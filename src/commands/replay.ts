/**
 * Lagrangian Replay Command
 * 
 * Replays a captured HTTP interaction locally for bug reproduction.
 * Leverages Axion for secrets and Hadron-like execution.
 */

import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { COLORS, error, warn, info, getAccessToken, getApiUrl, loadProjectConfig } from '@dotsetlabs/core';
import {
    loadConfig as loadGluonConfig,
    isInitialized as isGluonInitialized
} from '@dotsetlabs/gluon/config';
import { ManifestManager, GLOBAL_SERVICE } from '@dotsetlabs/axion/manifest';
import { spawn } from 'node:child_process';
import { type TelemetryEvent, type HttpInteractionEvent } from '@dotsetlabs/gluon/telemetry';

interface ReplayOptions {
    scope: 'development' | 'staging' | 'production';
    cmd: string;
    port?: number;
    delay?: number;
}

export function registerReplayCommand(program: Command) {
    program
        .command('replay')
        .description('Replay a captured production error locally (Lagrangian)')
        .argument('<eventId>', 'The ID of the event to replay (e.g. evt_...)')
        .option('--cmd <command>', 'Command to start the local server', 'npm start')
        .option('--scope <scope>', 'Secrets scope to use', 'development')
        .option('--port <port>', 'Local port to send the replay to (default: 3000)', '3000')
        .option('--delay <ms>', 'Delay in ms before replaying (to allow server boot)', '2000')
        .action(async (eventId: string, options: ReplayOptions) => {
            try {
                await executeReplay(eventId, options);
            } catch (err) {
                error((err as Error).message);
            }
        });
}

async function executeReplay(eventId: string, options: ReplayOptions) {
    const { scope, cmd, port = 3000, delay = 2000 } = options;

    // 1. Find the event in telemetry logs
    info(`Searching for event ${COLORS.bold}${eventId}${COLORS.reset}...`);

    const isGluonInit = await isGluonInitialized();
    if (!isGluonInit) {
        throw new Error('Gluon is not initialized in this project.');
    }

    const gluonConfig = await loadGluonConfig();
    const storagePath = gluonConfig.telemetry.storagePath;

    let event: HttpInteractionEvent | null = null;
    try {
        const content = await readFile(storagePath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        for (const line of lines) {
            const parsed = JSON.parse(line) as TelemetryEvent;
            if (parsed.id === eventId && parsed.type === 'http_interaction') {
                event = parsed as HttpInteractionEvent;
                break;
            }
        }
    } catch (err) {
        throw new Error(`Failed to read telemetry logs: ${(err as Error).message}`);
    }

    if (!event) {
        info(`Event not found in local logs. Checking ${COLORS.bold}Dotset Cloud${COLORS.reset}...`);
        try {
            const projectConfig = loadProjectConfig();
            if (!projectConfig?.cloudProjectId) {
                throw new Error('Event not found locally and project is not linked to Dotset Cloud.');
            }

            const token = getAccessToken();
            if (!token) {
                throw new Error('Not authenticated with Dotset Cloud. Run "dotset login" first.');
            }

            const API_URL = getApiUrl();
            const res = await fetch(`${API_URL}/projects/${projectConfig.cloudProjectId}/lagrangian/${eventId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                if (res.status === 404) {
                    throw new Error(`Event ${eventId} not found in local logs or on Dotset Cloud.`);
                }
                const errText = await res.text();
                throw new Error(`Failed to fetch event from cloud: ${res.status} ${errText}`);
            }

            const cloudEvent = await res.json() as any;
            // Map cloud entity to SDK interface
            event = {
                id: cloudEvent.id,
                type: 'http_interaction',
                timestamp: cloudEvent.timestamp,
                severity: 'critical',
                message: `Cloud Replay of ${eventId}`,
                metadata: {
                    method: cloudEvent.method,
                    path: cloudEvent.path,
                    headers: cloudEvent.headers,
                    body: cloudEvent.body,
                    statusCode: cloudEvent.statusCode,
                    durationMs: cloudEvent.durationMs
                },
                sessionId: cloudEvent.sessionId,
                scope: cloudEvent.scope
            };
            info(`${COLORS.green}✓${COLORS.reset} Found event on Dotset Cloud`);
        } catch (err) {
            throw new Error(`Event ${eventId} could not be retrieved: ${(err as Error).message}`);
        }
    }

    info(`Found event: ${COLORS.cyan}${event.metadata.method} ${event.metadata.path}${COLORS.reset}`);

    // 2. Load secrets via Axion
    let envVars = { ...process.env };
    try {
        const manifest = new ManifestManager();
        if (await manifest.isInitialized()) {
            const secrets = await manifest.getVariables(GLOBAL_SERVICE, scope);
            envVars = { ...envVars, ...secrets };
            info(`${COLORS.green}✓${COLORS.reset} Injected Axion secrets (${scope})`);
        }
    } catch (err) {
        warn(`Axion secrets not loaded: ${(err as Error).message}`);
    }

    // 3. Start the local process
    info(`Starting local server: ${COLORS.bold}${cmd}${COLORS.reset}...`);
    const [shell, ...shellArgs] = process.platform === 'win32'
        ? ['cmd.exe', '/c', cmd]
        : ['/bin/sh', '-c', cmd];

    const child = spawn(shell, shellArgs, {
        env: envVars,
        stdio: 'inherit',
        shell: false
    });

    // 4. Wait for server to boot and replay
    info(`Waiting ${delay}ms for server to stabilize...`);
    await new Promise(resolve => setTimeout(resolve, delay));

    info(`${COLORS.yellow}▶${COLORS.reset} Replaying request to localhost:${port}${event.metadata.path}...`);

    try {
        const url = `http://localhost:${port}${event.metadata.path}`;
        const res = await fetch(url, {
            method: event.metadata.method,
            headers: event.metadata.headers,
            body: event.metadata.method !== 'GET' && event.metadata.method !== 'HEAD'
                ? event.metadata.body
                : undefined
        });

        console.log();
        console.log(`${COLORS.bold}Replay Result:${COLORS.reset}`);
        console.log(`${COLORS.dim}Status:${COLORS.reset} ${res.status >= 500 ? COLORS.red : COLORS.green}${res.status}${COLORS.reset}`);

        const responseBody = await res.text();
        if (responseBody) {
            console.log(`${COLORS.dim}Body:${COLORS.reset}`);
            console.log(responseBody);
        }
        console.log();

    } catch (err) {
        error(`Replay failed: ${(err as Error).message}`);
    }

    // Keep process alive or exit? 
    // Usually, we want the dev to see the logs. 
    // We'll wait for the child process to exit.
    return new Promise((resolve) => {
        child.on('close', (code) => {
            info(`Local server exited with code ${code}`);
            resolve(null);
            process.exit(code ?? 0);
        });
    });
}
