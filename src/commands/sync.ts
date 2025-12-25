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
    getAccessToken,
    getApiUrl,
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

                const manifest = new ManifestManager();
                const scope = validateScope(options.scope);

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
                    info('Syncing manifest to cloud...');

                    const currentManifest = await manifest.load();
                    await manifest.save(currentManifest);

                    success('Manifest synced to cloud.');
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

                const manifest = new ManifestManager();
                const scope = validateScope(options.scope);

                info(`Pulling secrets from cloud for ${scope}...`);

                // Reload manifest which will sync with cloud if linked
                const currentManifest = await manifest.load();
                await manifest.save(currentManifest);

                success(`Secrets synchronized for ${scope} scope.`);
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

                info('Checking sync status...');

                const drift = await manifest.detectDrift();

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
                    console.log(colors.dim('Run "dotset sync push" or "dotset sync pull" to resolve.'));
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
