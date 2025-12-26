/**
 * Sync Commands (Axion Module)
 * 
 * Commands for syncing secrets between local and cloud.
 */

import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import {
    COLORS,
    colors,
    success,
    error,
    info,
    isAuthenticated,
    loadProjectConfig,
    post,
    get,
} from '@dotsetlabs/core';

import {
    ManifestManager,
    GLOBAL_SERVICE,
} from '@dotsetlabs/axion/manifest';

import { parseEnvFile } from '@dotsetlabs/axion/parser';

type Scope = 'development' | 'staging' | 'production';

export function registerSyncCommands(program: Command) {
    const sync = program
        .command('sync')
        .description('Sync secrets between local and cloud (Axion module)');

    // ─────────────────────────────────────────────────────────────
    // sync push
    // ─────────────────────────────────────────────────────────────

    sync
        .command('push [file]')
        .description('Push local secrets to cloud, or import from .env file')
        .option('--scope <env>', 'Environment scope to push to', 'development')
        .option('--overwrite', 'Overwrite existing cloud variables')
        .action(async (file: string | undefined, options: { scope: string; overwrite?: boolean }) => {
            try {
                if (!isAuthenticated()) {
                    error('Not logged in. Run: dotset login');
                }

                const scope = validateScope(options.scope);

                // 1. Fetch key for the scope (if not present locally)
                let encryptionKey: string | undefined;
                let manifest: ManifestManager;

                const projectConfig = loadProjectConfig();
                if (!projectConfig?.cloudProjectId) {
                    // For local-only usage or if just migrating files without link
                    if (!file) {
                        error('Project not linked to cloud. Run: dotset project link');
                        return;
                    }
                    // If migrating local file, we might not need remote link if we have local key
                    manifest = new ManifestManager();
                } else {
                    try {
                        const token = (await import('@dotsetlabs/core')).getAccessToken();
                        const API_URL = (await import('@dotsetlabs/core')).getApiUrl();
                        const res = await fetch(`${API_URL}/projects/${projectConfig.cloudProjectId}/axion/keys?scope=${scope}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });

                        // If we can get the key, use it. If not (e.g. key doesn't exist yet/not init), we'll try local.
                        // For push, we might be initializing. Use file-based key if remote fails.
                        if (res.ok) {
                            const data = await res.json() as { key: string };
                            encryptionKey = data.key;
                        }
                    } catch { /* ignore fetch error */ }

                    manifest = new ManifestManager(encryptionKey ? { encryptionKey } : undefined);
                }

                if (file) {
                    // Migration Mode: Import from .env file
                    info(`Migrating variables from ${file} to ${scope} scope...`);

                    const content = await readFile(file, 'utf8');
                    const result = parseEnvFile(content);

                    if (result.errors.length > 0) {
                        console.log(colors.yellow('\n⚠️  Parsing warnings:'));
                        for (const err of result.errors) {
                            console.log(`   Line ${err.line}: ${err.message}`);
                        }
                    }

                    if (result.variables.length === 0) {
                        info('No variables found to migrate.');
                        return;
                    }

                    let imported = 0;
                    // Note: If remote key fetch failed and local key missing, this will throw "Axion not initialized"
                    // User must run "axn init" or similar if entirely local.
                    // Or if first push to cloud, how do we get key? 
                    // GET /keys creates it if missing for owner. So fetch above should have returned it.

                    const existing = await manifest.getVariables(GLOBAL_SERVICE, scope);

                    for (const { key, value } of result.variables) {
                        if (key in existing && !options.overwrite) {
                            continue;
                        }
                        await manifest.setVariable(key, value, GLOBAL_SERVICE, scope);
                        imported++;
                    }

                    success(`Migrated ${imported} variables to ${scope} scope.`);
                } else {
                    // Normal Push: Sync manifest to cloud
                    if (!projectConfig?.cloudProjectId) {
                        error('Project not linked to cloud. Run: dotset project link');
                        return;
                    }

                    info(`Pushing [${scope}] manifest to cloud...`);

                    const currentManifest = await manifest.load(scope);
                    const path = manifest.getScopedManifestPath(scope);
                    const encryptedData = await readFile(path, 'utf8');
                    const keyFingerprint = await manifest.getFingerprint();

                    try {
                        await post(`/projects/${projectConfig.cloudProjectId}/axion/manifest`, {
                            encryptedData,
                            keyFingerprint,
                            scope
                        });
                        success(`Manifest for [${scope}] synced to cloud.`);
                    } catch (err: any) {
                        if (err.status === 403) {
                            error(`Permission Denied: ${err.message || 'You do not have access to push to this scope.'}`);
                        } else {
                            throw err;
                        }
                    }
                }
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // sync pull
    // ─────────────────────────────────────────────────────────────

    sync
        .command('pull')
        .description('Pull secrets from cloud to local')
        .option('--scope <env>', 'Environment scope to pull', 'development')
        .option('--overwrite', 'Overwrite existing local variables')
        .action(async (options: { scope: string; overwrite?: boolean }) => {
            try {
                if (!isAuthenticated()) {
                    error('Not logged in. Run: dotset login');
                }

                const scope = validateScope(options.scope);
                const projectConfig = loadProjectConfig();
                if (!projectConfig?.cloudProjectId) {
                    error('Project not linked to cloud. Run: dotset project link');
                    return;
                }

                info(`Pulling secrets from cloud for [${scope}]...`);

                try {
                    // Fetch key first
                    let encryptionKey: string | undefined;
                    try {
                        const token = (await import('@dotsetlabs/core')).getAccessToken();
                        const API_URL = (await import('@dotsetlabs/core')).getApiUrl();
                        const res = await fetch(`${API_URL}/projects/${projectConfig.cloudProjectId}/axion/keys?scope=${scope}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        if (res.ok) {
                            const data = await res.json() as { key: string };
                            encryptionKey = data.key;
                        }
                    } catch { /* ignore */ }

                    const manifest = new ManifestManager(encryptionKey ? { encryptionKey } : undefined);

                    const response = await get<{ manifest: { encryptedData: string } }>(
                        `/projects/${projectConfig.cloudProjectId}/axion/manifest?scope=${scope}`
                    );

                    // Save the encrypted data locally
                    const { mkdir, writeFile } = await import('node:fs/promises');
                    const { dirname } = await import('node:path');
                    const path = manifest.getScopedManifestPath(scope);

                    await mkdir(dirname(path), { recursive: true });
                    await writeFile(path, response.manifest.encryptedData, 'utf8');

                    success(`Secrets synchronized for [${scope}] scope.`);
                } catch (err: any) {
                    if (err.status === 403) {
                        error(`Permission Denied: ${err.message || 'You do not have access to pull from this scope.'}`);
                    } else if (err.code === 'NO_MANIFEST') {
                        info(`No manifest found in cloud for [${scope}].`);
                    } else {
                        throw err;
                    }
                }
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // sync status
    // ─────────────────────────────────────────────────────────────

    sync
        .command('status')
        .description('Show sync status between local and cloud')
        .action(async () => {
            try {
                if (!isAuthenticated()) {
                    error('Not logged in. Run: dotset login');
                }

                const manifest = new ManifestManager();
                const scope = 'development'; // Default scope for status or we could iterate

                info('Checking sync status...');

                const drift = await manifest.detectDrift(undefined, scope);

                console.log();

                if (!drift.hasDrift) {
                    success('In sync! Local and cloud are identical.');
                } else {
                    console.log(colors.yellow(`⚠️  Drift detected: ${drift.summary.total} difference(s)`));
                    console.log();
                    console.log(`  ${colors.green(`+ ${drift.summary.added} added`)}`);
                    console.log(`  ${colors.red(`- ${drift.summary.removed} removed`)}`);
                    console.log(`  ${colors.yellow(`~ ${drift.summary.changed} modified`)}`);
                    console.log();
                    console.log(COLORS.dim + 'Run "dotset sync push" or "dotset sync pull" to resolve.' + COLORS.reset);
                }

                console.log();
            } catch (err) {
                error((err as Error).message);
            }
        });
}

/**
 * Validate and cast scope string
 */
function validateScope(scope: string): Scope {
    if (!['development', 'staging', 'production'].includes(scope)) {
        error(`Invalid scope: ${scope}. Must be development, staging, or production.`);
    }
    return scope as Scope;
}
