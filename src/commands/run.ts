/**
 * Unified Run Command
 *
 * Combines Axion secret injection with Gluon runtime monitoring
 * in a single command for streamlined developer experience.
 *
 * This is the "killer feature" of the unified CLI - one command
 * that replaces both `axn run` and `gln run`.
 *
 * Features:
 * - Loads and injects encrypted secrets from Axion
 * - Monitors stdout/stderr for secret leaks via Gluon
 * - Tracks network activity and module imports
 * - Reports security events on exit
 * - Supports graceful fallbacks if products aren't initialized
 */

import { Command } from 'commander';
import { spawn, type ChildProcess } from 'node:child_process';
import {
    COLORS,
    error,
    warn,
} from '@dotsetlabs/core';

// Axion imports for secret management
import {
    ManifestManager,
    GLOBAL_SERVICE,
    type ServiceVariables,
} from '@dotsetlabs/axion/manifest';

// Gluon imports for runtime monitoring
import {
    loadConfig as loadGluonConfig,
    createDefaultConfig as createDefaultGluonConfig,
    isInitialized as isGluonInitialized,
    type GluonConfig,
    type SecretMode,
} from '@dotsetlabs/gluon/config';
import {
    createCollector,
    generateSessionId,
    type TelemetryCollector,
} from '@dotsetlabs/gluon/telemetry';
import {
    createHookManager,
    type HookManager,
} from '@dotsetlabs/gluon/hooks';
import { createSecretsMonitor, type SecretsMonitor } from '@dotsetlabs/gluon/monitors/secrets';

/**
 * Options for the run command
 */
interface RunOptions {
    scope: 'development' | 'staging' | 'production';
    service?: string;
    secrets: boolean;
    monitor: boolean;
    mode?: SecretMode;
    redactText?: string;
    verbose: boolean;
    quiet: boolean;
}

/**
 * Result of the run operation
 */
interface RunResult {
    exitCode: number;
    secretsInjected: number;
    secretExposures: number;
    durationMs: number;
}

/**
 * Signals to forward to child process
 */
const FORWARDED_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/**
 * Registers the unified run command
 */
export function registerRunCommand(program: Command) {
    program
        .command('run')
        .description('Run a command with secrets injected and security monitoring enabled')
        .argument('<command...>', 'Command and arguments to run')
        .option('--scope <env>', 'Environment scope (development, staging, production)', 'development')
        .option('-s, --service <name>', 'Service to scope secrets to')
        .option('--no-secrets', 'Disable Axion secret injection')
        .option('--no-monitor', 'Disable Gluon security monitoring')
        .option('--mode <mode>', 'Secret protection mode: detect, redact, or block')
        .option('--redact-text <text>', 'Custom text to replace secrets with (default: [REDACTED])')
        .option('-v, --verbose', 'Show detailed output')
        .option('-q, --quiet', 'Suppress non-essential output')
        .allowUnknownOption()
        .action(async (commandArgs: string[], options: RunOptions) => {
            try {
                await runUnified(commandArgs, options);
            } catch (err) {
                error((err as Error).message);
            }
        });
}

/**
 * Main unified run function
 */
async function runUnified(commandArgs: string[], options: RunOptions): Promise<void> {
    const startTime = Date.now();
    const [command, ...args] = commandArgs;

    if (!command) {
        error('No command specified. Usage: dotset run -- <command>');
    }

    const { scope, service, secrets, monitor, mode, redactText, verbose, quiet } = options;

    // Validate scope
    if (!['development', 'staging', 'production'].includes(scope)) {
        error('Invalid scope. Must be one of: development, staging, production');
    }

    // Validate mode if provided
    if (mode && !['detect', 'redact', 'block'].includes(mode)) {
        error('Invalid mode. Must be one of: detect, redact, block');
    }

    // ─────────────────────────────────────────────────────────────
    // Phase 1: Load Axion Secrets
    // ─────────────────────────────────────────────────────────────

    let secretVars: ServiceVariables = {};
    let axionAvailable = false;

    if (secrets) {
        try {
            const manifest = new ManifestManager();
            const isAxionInit = await manifest.isInitialized();

            if (isAxionInit) {
                axionAvailable = true;
                const serviceKey = service ?? GLOBAL_SERVICE;

                // Attempt to load key from file first (local dev)
                let encryptionKey: string | undefined;
                try {
                    // This is hacky but we need to check if we can read the key
                    await manifest.showKey();
                } catch {
                    // Key not found locally, try to fetch from platform if linked
                    const { getAccessToken, getApiUrl } = await import('@dotsetlabs/core');
                    const { readFile } = await import('node:fs/promises');
                    const { join } = await import('node:path');

                    try {
                        const projectConfigPath = join(process.cwd(), '.dotset/project.json');
                        const projectConfig = JSON.parse(await readFile(projectConfigPath, 'utf8'));

                        if (projectConfig.projectId) {
                            const token = getAccessToken();
                            if (token) {
                                const API_URL = getApiUrl();
                                const res = await fetch(`${API_URL}/projects/${projectConfig.projectId}/axion/keys?scope=${scope}`, {
                                    headers: { Authorization: `Bearer ${token}` }
                                });

                                if (res.ok) {
                                    const data = await res.json() as { key: string };
                                    encryptionKey = data.key;
                                    // Re-initialize manifest with injected key
                                    // We need to create a new instance because the previous one failed to load key
                                    // This logic actually needs to be handled by creating a NEW ManifestManager with the key
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore, just means we can't fetch key
                        if (verbose) warn(`Could not fetch remote key: ${(e as Error).message}`);
                    }
                }

                if (encryptionKey) {
                    // create new manager with key
                    const remoteManifest = new ManifestManager({ encryptionKey });
                    secretVars = await remoteManifest.getVariables(serviceKey, scope);
                } else {
                    secretVars = await manifest.getVariables(serviceKey, scope);
                }

                if (!quiet) {
                    const count = Object.keys(secretVars).length;
                    if (count > 0) {
                        console.log(`${COLORS.green}✓${COLORS.reset} Loaded ${COLORS.bold}${count}${COLORS.reset} secrets from Axion ${COLORS.dim}(${scope})${COLORS.reset}`);
                    }
                }

                if (verbose) {
                    console.log(COLORS.dim + '  Secrets: ' + Object.keys(secretVars).join(', ') + COLORS.reset);
                }
            } else if (verbose) {
                console.log(COLORS.dim + '  Axion not initialized, skipping secret injection' + COLORS.reset);
            }
        } catch (err) {
            if (verbose) {
                warn(`Axion: ${(err as Error).message}`);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Phase 2: Initialize Gluon Monitoring
    // ─────────────────────────────────────────────────────────────

    let gluonConfig: GluonConfig | null = null;
    let telemetry: TelemetryCollector | null = null;
    let hookManager: HookManager | null = null;
    let secretsMonitor: SecretsMonitor | null = null;
    let gluonAvailable = false;
    let activeMode: SecretMode = 'detect';

    if (monitor) {
        try {
            const isGluonInit = await isGluonInitialized();
            gluonConfig = isGluonInit
                ? await loadGluonConfig()
                : createDefaultGluonConfig();

            gluonAvailable = true;

            // Create telemetry collector
            const sessionId = generateSessionId();
            telemetry = createCollector(gluonConfig.telemetry, sessionId);
            telemetry.setScope(scope);

            // Create hook manager
            hookManager = createHookManager();

            // Create secrets monitor with mode overrides
            secretsMonitor = createSecretsMonitor(gluonConfig, telemetry);

            // Override mode from CLI flag if provided
            if (mode) {
                secretsMonitor.setMode(mode);
            }
            activeMode = secretsMonitor.getMode();

            // Override redact text if provided
            if (redactText) {
                secretsMonitor.setRedactText(redactText);
            }

            secretsMonitor.registerHooks(hookManager);

            // Track Axion secrets as known sensitive values
            for (const [key, value] of Object.entries(secretVars)) {
                secretsMonitor.trackEnvVar(key, value);
            }

            if (!quiet) {
                const patternCount = secretsMonitor.getPatternCount();
                const modeLabel = activeMode === 'detect'
                    ? 'detecting'
                    : activeMode === 'redact'
                        ? 'redacting'
                        : 'blocking';
                console.log(`${COLORS.cyan}◉${COLORS.reset} Gluon ${COLORS.bold}${modeLabel}${COLORS.reset} secrets (${patternCount} patterns)`);
            }

            if (verbose) {
                const monitors: string[] = [];
                if (gluonConfig.secrets.enabled) monitors.push('secrets');
                if (gluonConfig.network.enabled) monitors.push('network');
                if (gluonConfig.modules.enabled) monitors.push('modules');
                console.log(COLORS.dim + `  Session: ${sessionId}` + COLORS.reset);
                console.log(COLORS.dim + `  Mode: ${activeMode}` + COLORS.reset);
                console.log(COLORS.dim + `  Monitoring: ${monitors.join(', ')}` + COLORS.reset);
            }
        } catch (err) {
            if (verbose) {
                warn(`Gluon: ${(err as Error).message}`);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Phase 3: Spawn Child Process
    // ─────────────────────────────────────────────────────────────

    if (!quiet && (axionAvailable || gluonAvailable)) {
        console.log();
    }

    // Create the hook context before spawning (required for transform hooks)
    if (hookManager && telemetry) {
        hookManager.createContext(telemetry.getSessionId(), command, args);
    }

    const result = await spawnMonitoredProcess(
        command,
        args,
        secretVars,
        hookManager,
        telemetry,
        verbose
    );

    // ─────────────────────────────────────────────────────────────
    // Phase 4: Report and Cleanup
    // ─────────────────────────────────────────────────────────────

    // Flush telemetry
    if (telemetry) {
        await telemetry.shutdown();
    }

    // Get final stats
    const durationMs = Date.now() - startTime;
    let secretExposures = 0;

    if (telemetry) {
        const stats = await telemetry.getStats();
        secretExposures = stats.byType['secret_exposure'] ?? 0;
    }

    // Report summary
    if (!quiet && (axionAvailable || gluonAvailable)) {
        console.log();
        console.log(COLORS.dim + `──────────────────────────────────────` + COLORS.reset);
        console.log(COLORS.dim + `[dotset] Exited with code ${result.exitCode} (${formatDuration(durationMs)})` + COLORS.reset);

        if (secretExposures > 0) {
            console.log();
            if (activeMode === 'detect') {
                console.log(`${COLORS.red}⚠${COLORS.reset}  ${COLORS.bold}${secretExposures}${COLORS.reset} potential secret exposure(s) detected!`);
                console.log(COLORS.dim + `   Check .dotset/gluon/telemetry.log for details` + COLORS.reset);
            } else if (activeMode === 'redact') {
                console.log(`${COLORS.yellow}◉${COLORS.reset}  ${COLORS.bold}${secretExposures}${COLORS.reset} secret(s) redacted from output`);
            } else {
                console.log(`${COLORS.yellow}◉${COLORS.reset}  ${COLORS.bold}${secretExposures}${COLORS.reset} output(s) blocked due to secrets`);
            }
        }
    }

    process.exit(result.exitCode);
}

/**
 * Spawns a child process with monitoring
 */
function spawnMonitoredProcess(
    command: string,
    args: string[],
    env: ServiceVariables,
    hookManager: HookManager | null,
    telemetry: TelemetryCollector | null,
    verbose: boolean
): Promise<{ exitCode: number }> {
    return new Promise((resolve, reject) => {
        // Merge environment
        const mergedEnv = {
            ...process.env,
            ...env,
        };

        // Add session ID if monitoring
        if (telemetry) {
            mergedEnv.GLUON_SESSION_ID = generateSessionId();
        }

        // Determine stdio mode
        const useMonitoring = hookManager !== null;

        // Spawn child process
        const child: ChildProcess = spawn(command, args, {
            env: mergedEnv,
            cwd: process.cwd(),
            stdio: useMonitoring ? ['inherit', 'pipe', 'pipe'] : 'inherit',
            shell: false,
        });

        // Signal handling
        const signalHandlers: Map<NodeJS.Signals, () => void> = new Map();

        function setupSignalForwarding(): void {
            for (const signal of FORWARDED_SIGNALS) {
                const handler = () => {
                    if (child.pid) {
                        child.kill(signal);
                    }
                };
                signalHandlers.set(signal, handler);
                process.on(signal, handler);
            }
        }

        function cleanupSignalHandlers(): void {
            for (const [signal, handler] of signalHandlers) {
                process.removeListener(signal, handler);
            }
            signalHandlers.clear();
        }

        // Set up stream monitoring if hook manager is available
        if (useMonitoring && child.stdout && child.stderr) {
            const stdoutTransform = hookManager!.createStreamTransform('stdout');
            const stderrTransform = hookManager!.createStreamTransform('stderr');

            child.stdout.pipe(stdoutTransform).pipe(process.stdout);
            child.stderr.pipe(stderrTransform).pipe(process.stderr);
        }

        setupSignalForwarding();

        // Handle errors
        child.on('error', (err) => {
            cleanupSignalHandlers();

            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                reject(new Error(`Command not found: ${command}`));
            } else {
                reject(new Error(`Failed to start command: ${err.message}`));
            }
        });

        // Handle exit
        child.on('close', (code, signal) => {
            cleanupSignalHandlers();

            let exitCode: number;
            if (signal) {
                const signalCodes: Record<string, number> = {
                    SIGINT: 130,
                    SIGTERM: 143,
                    SIGHUP: 129,
                };
                exitCode = signalCodes[signal] ?? 128;
            } else {
                exitCode = code ?? 0;
            }

            resolve({ exitCode });
        });
    });
}

/**
 * Formats a duration in milliseconds to a human-readable string
 */
function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`;
    } else if (ms < 60000) {
        return `${(ms / 1000).toFixed(1)}s`;
    } else {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }
}
