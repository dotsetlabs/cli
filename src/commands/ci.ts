/**
 * CI Command (Hadron Module)
 *
 * CLI implementation for running GitHub Actions workflows locally
 * with Axion secrets and Gluon monitoring.
 */

import { Command } from 'commander';
import {
    COLORS,
    colors,
    success,
    error,
    info,
    warn,
    loadProjectConfig,
    post,
} from '@dotsetlabs/core';
import { ManifestManager, GLOBAL_SERVICE } from '@dotsetlabs/axion/manifest';
import {
    loadConfig as loadGluonConfig,
    createDefaultConfig as createDefaultGluonConfig,
    isInitialized as isGluonInitialized,
    type SecretMode,
} from '@dotsetlabs/gluon/config';
import { createHookManager } from '@dotsetlabs/gluon/hooks';
import { createSecretsMonitor } from '@dotsetlabs/gluon/monitors/secrets';
import { createCollector, generateSessionId } from '@dotsetlabs/gluon/telemetry';

import {
    parseWorkflow,
    discoverWorkflows,
    getRunnableSteps,
    getSkippedSteps,
    type Workflow,
    type Job,
    type Step,
} from '@dotsetlabs/hadron/parser';
import { loadConfig as loadHadronConfig } from '@dotsetlabs/hadron/config';
import { executeJob, type ExecutionOptions } from '@dotsetlabs/hadron/executor';
import { printReport } from '@dotsetlabs/hadron/reporter';

export function registerCICommand(program: Command) {
    program
        .command('ci [workflow] [job]')
        .description('Run a GitHub Actions workflow locally (Hadron module)')
        .option('--scope <env>', 'Environment scope for secrets', 'development')
        .option('-s, --service <name>', 'Service to scope secrets to')
        .option('--dry-run', 'Parse and validate workflow without executing')
        .option('--list', 'List available workflows and jobs')
        .option('--mode <mode>', 'Secret protection mode: detect, redact, block')
        .option('-v, --verbose', 'Show detailed output')
        .option('--sync', 'Sync run results to server')
        .action(async (workflow: string | undefined, job: string | undefined, options: {
            scope: string;
            service?: string;
            dryRun?: boolean;
            list?: boolean;
            mode?: SecretMode;
            verbose?: boolean;
            sync?: boolean;
        }) => {
            try {
                const cwd = process.cwd();

                // ───────────────────────────────────────────────
                // List mode: show available workflows and jobs
                // ───────────────────────────────────────────────
                if (options.list) {
                    const workflowPaths = await discoverWorkflows(cwd);

                    if (workflowPaths.length === 0) {
                        info('No workflows found in .github/workflows/');
                        return;
                    }

                    console.log(`\n${COLORS.bold}Available Workflows${COLORS.reset}\n`);

                    for (const path of workflowPaths) {
                        const wf = await parseWorkflow(path);
                        console.log(`  ${colors.cyan(wf.filename)}: ${wf.name}`);

                        for (const [jobId, jobDef] of wf.jobs) {
                            const runnable = getRunnableSteps(jobDef).length;
                            const skipped = getSkippedSteps(jobDef).length;
                            console.log(`    ${colors.dim('→')} ${jobId} (${runnable} steps${skipped > 0 ? `, ${skipped} actions skipped` : ''})`);
                        }
                    }

                    console.log();
                    return;
                }

                // ───────────────────────────────────────────────
                // Find and parse the workflow
                // ───────────────────────────────────────────────
                const workflowPaths = await discoverWorkflows(cwd);

                if (workflowPaths.length === 0) {
                    error('No workflows found. Create a workflow in .github/workflows/');
                }

                let selectedWorkflow: Workflow;

                if (workflow) {
                    // Find by name or filename
                    const matchingPath = workflowPaths.find((p) =>
                        p.includes(workflow) || p.endsWith(`${workflow}.yml`) || p.endsWith(`${workflow}.yaml`)
                    );

                    if (!matchingPath) {
                        error(`Workflow "${workflow}" not found. Run \`dotset ci --list\` to see available workflows.`);
                    }

                    selectedWorkflow = await parseWorkflow(matchingPath!);
                } else if (workflowPaths.length === 1) {
                    selectedWorkflow = await parseWorkflow(workflowPaths[0]);
                } else {
                    error('Multiple workflows found. Specify which one to run: `dotset ci <workflow> [job]`');
                    return;
                }

                // ───────────────────────────────────────────────
                // Find the job to run
                // ───────────────────────────────────────────────
                let selectedJob: Job;

                if (job) {
                    const found = selectedWorkflow.jobs.get(job);
                    if (!found) {
                        error(`Job "${job}" not found in ${selectedWorkflow.filename}. Available: ${Array.from(selectedWorkflow.jobs.keys()).join(', ')}`);
                    }
                    selectedJob = found!;
                } else if (selectedWorkflow.jobs.size === 1) {
                    selectedJob = selectedWorkflow.jobs.values().next().value!;
                } else {
                    error(`Multiple jobs found. Specify which one to run: \`dotset ci ${selectedWorkflow.filename.replace(/\.ya?ml$/, '')} <job>\``);
                    return;
                }

                // ───────────────────────────────────────────────
                // Dry run mode
                // ───────────────────────────────────────────────
                if (options.dryRun) {
                    console.log(`\n${COLORS.bold}Workflow:${COLORS.reset} ${selectedWorkflow.name}`);
                    console.log(`${COLORS.bold}Job:${COLORS.reset} ${selectedJob.name} (${selectedJob.id})`);
                    console.log(`${COLORS.bold}Steps:${COLORS.reset}`);

                    for (let i = 0; i < selectedJob.steps.length; i++) {
                        const step = selectedJob.steps[i];
                        if (step.run) {
                            console.log(`  ${i + 1}. ${step.name}`);
                        } else if (step.uses) {
                            console.log(`  ${i + 1}. ${colors.dim(`[SKIP] ${step.name} (uses: ${step.uses})`)}`);
                        }
                    }

                    console.log();
                    success('Dry run complete. Workflow parsed successfully.');
                    return;
                }

                // ───────────────────────────────────────────────
                // Load Axion secrets
                // ───────────────────────────────────────────────
                info(`Running job "${selectedJob.name}" from ${selectedWorkflow.filename}`);

                let secrets: Record<string, string> = {};

                try {
                    const manifest = new ManifestManager();
                    const isAxionInit = await manifest.isInitialized();

                    if (isAxionInit) {
                        const serviceKey = options.service ?? GLOBAL_SERVICE;
                        secrets = await manifest.getVariables(serviceKey, options.scope as any);

                        const count = Object.keys(secrets).length;
                        if (count > 0) {
                            console.log(`${COLORS.green}✓${COLORS.reset} Loaded ${COLORS.bold}${count}${COLORS.reset} secrets from Axion ${COLORS.dim}(${options.scope})${COLORS.reset}`);
                        }
                    }
                } catch (err) {
                    if (options.verbose) {
                        warn(`Axion: ${(err as Error).message}`);
                    }
                }

                // ───────────────────────────────────────────────
                // Initialize Gluon monitoring
                // ───────────────────────────────────────────────
                let hookManager = createHookManager();
                let telemetry = null;

                try {
                    const isGluonInit = await isGluonInitialized();
                    const gluonConfig = isGluonInit
                        ? await loadGluonConfig()
                        : createDefaultGluonConfig();

                    const sessionId = generateSessionId();
                    telemetry = createCollector(gluonConfig.telemetry, sessionId);

                    const secretsMonitor = createSecretsMonitor(gluonConfig, telemetry);

                    if (options.mode) {
                        secretsMonitor.setMode(options.mode);
                    }

                    // Track Axion secrets
                    for (const [key, value] of Object.entries(secrets)) {
                        secretsMonitor.trackEnvVar(key, value);
                    }

                    secretsMonitor.registerHooks(hookManager);

                    const mode = secretsMonitor.getMode();
                    const modeLabel = mode === 'detect' ? 'detecting' : mode === 'redact' ? 'redacting' : 'blocking';
                    console.log(`${COLORS.cyan}◉${COLORS.reset} Gluon ${COLORS.bold}${modeLabel}${COLORS.reset} secrets`);
                } catch (err) {
                    if (options.verbose) {
                        warn(`Gluon: ${(err as Error).message}`);
                    }
                }

                // ───────────────────────────────────────────────
                // Execute the job
                // ───────────────────────────────────────────────
                console.log();

                const hadronConfig = await loadHadronConfig(cwd);

                hookManager.createContext(generateSessionId(), 'dotset', ['ci']);

                const executionOptions: ExecutionOptions = {
                    secrets,
                    cwd,
                    config: hadronConfig,
                    stdoutTransform: hookManager.createStreamTransform('stdout'),
                    stderrTransform: hookManager.createStreamTransform('stderr'),
                    onStepStart: (step, index) => {
                        if (options.verbose) {
                            console.log(`${COLORS.dim}[${index + 1}/${selectedJob.steps.length}]${COLORS.reset} ${step.name}`);
                        }
                    },
                };

                const result = await executeJob(selectedJob, executionOptions);

                // ───────────────────────────────────────────────
                // Report results
                // ───────────────────────────────────────────────
                printReport(result, { verbose: !!options.verbose, colors: true });

                // ───────────────────────────────────────────────
                // Sync results to server (if --sync flag)
                // ───────────────────────────────────────────────
                if (options.sync) {
                    try {
                        const projectConfig = await loadProjectConfig();
                        if (projectConfig?.cloudProjectId) {
                            const runData = {
                                externalRunId: generateSessionId(),
                                workflowName: selectedWorkflow.filename,
                                jobId: selectedJob.id,
                                jobName: selectedJob.name,
                                scope: options.scope,
                                protectionMode: options.mode || 'detect',
                                status: result.success ? 'success' : 'failed',
                                startedAt: new Date().toISOString(),
                                completedAt: new Date().toISOString(),
                                durationMs: result.durationMs,
                                exitCode: result.success ? 0 : 1,
                                leaksDetected: result.totalSecretExposures ?? 0,
                                steps: result.steps?.map((s, i: number) => ({
                                    stepIndex: i,
                                    name: s.name,
                                    status: s.skipped ? 'skipped' : (s.exitCode === 0 ? 'success' : 'failed'),
                                    durationMs: s.durationMs,
                                    exitCode: s.exitCode,
                                })),
                            };

                            await post(`/projects/${projectConfig.cloudProjectId}/hadron/runs`, runData);
                            console.log(`${COLORS.green}✓${COLORS.reset} Run synced to dashboard`);
                        } else {
                            if (options.verbose) {
                                warn('No cloud project linked. Run \'dotset init\' and \'dotset link\' to enable sync.');
                            }
                        }
                    } catch (syncErr) {
                        if (options.verbose) {
                            warn(`Sync failed: ${(syncErr as Error).message}`);
                        }
                    }
                }

                // Flush telemetry
                if (telemetry) {
                    await telemetry.shutdown();
                }

                process.exit(result.success ? 0 : 1);

            } catch (err) {
                error((err as Error).message);
            }
        });
}
