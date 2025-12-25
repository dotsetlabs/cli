/**
 * Secrets Commands (Axion Module)
 * 
 * Complete CLI implementation for secrets management.
 * Uses the @dotsetlabs/axion SDK for all operations.
 */

import { Command } from 'commander';
import {
    COLORS,
    colors,
    success,
    error,
    info,
} from '@dotsetlabs/core';

// Import from Axion SDK
import {
    ManifestManager,
    GLOBAL_SERVICE,
} from '@dotsetlabs/axion/manifest';
import { getKeyFingerprint } from '@dotsetlabs/axion/crypto';

type Scope = 'development' | 'staging' | 'production';

export function registerSecretsCommands(program: Command) {
    const secrets = program
        .command('secrets')
        .alias('s')
        .description('Manage encrypted secrets (Axion module)');

    // ─────────────────────────────────────────────────────────────
    // secrets init
    // ─────────────────────────────────────────────────────────────

    secrets
        .command('init')
        .description('Initialize secrets management for this project')
        .action(async () => {
            try {
                const manifest = new ManifestManager();

                if (await manifest.isInitialized()) {
                    info('Secrets already initialized for this project.');
                    return;
                }

                const key = await manifest.init();
                success('Secrets initialized!');
                console.log();
                console.log(`  ${colors.dim('Encryption key (save this securely):')}`);
                console.log(`  ${colors.cyan(key)}`);
                console.log();
                console.log(`  ${colors.dim('Add to your CI/CD as AXION_KEY')}`);
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // secrets set
    // ─────────────────────────────────────────────────────────────

    secrets
        .command('set <key> [value]')
        .description('Set a secret value')
        .option('--scope <env>', 'Environment scope (development, staging, production)', 'development')
        .option('-s, --service <name>', 'Service to scope the secret to')
        .action(async (key: string, value: string | undefined, options: { scope: string; service?: string }) => {
            try {
                ensureSecretsInitialized();

                const manifest = new ManifestManager();
                const serviceKey = options.service ?? GLOBAL_SERVICE;
                const scope = validateScope(options.scope);

                // If no value provided, read from stdin
                let secretValue = value;
                if (!secretValue) {
                    if (!process.stdin.isTTY) {
                        const chunks: Buffer[] = [];
                        for await (const chunk of process.stdin) {
                            chunks.push(chunk);
                        }
                        secretValue = Buffer.concat(chunks).toString().trim();
                    } else {
                        error('No value provided. Pipe a value or provide it as an argument.');
                    }
                }

                await manifest.setVariable(key, secretValue, serviceKey, scope);
                success(`Set ${colors.cyan(key)} in ${colors.dim(scope)}`);
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // secrets get
    // ─────────────────────────────────────────────────────────────

    secrets
        .command('get <key>')
        .description('Get a secret value')
        .option('--scope <env>', 'Environment scope', 'development')
        .option('-s, --service <name>', 'Service to scope the secret to')
        .action(async (key: string, options: { scope: string; service?: string }) => {
            try {
                ensureSecretsInitialized();

                const manifest = new ManifestManager();
                const serviceKey = options.service ?? GLOBAL_SERVICE;
                const scope = validateScope(options.scope);
                const vars = await manifest.getVariables(serviceKey, scope);
                const value = vars[key];

                if (value === undefined) {
                    error(`Secret ${key} not found in ${scope}`);
                }

                console.log(value);
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // secrets list
    // ─────────────────────────────────────────────────────────────

    secrets
        .command('list')
        .alias('ls')
        .description('List all secrets')
        .option('--scope <env>', 'Environment scope', 'development')
        .option('-s, --service <name>', 'Service to scope the secret to')
        .option('--show-values', 'Show secret values (use with caution)')
        .action(async (options: { scope: string; service?: string; showValues?: boolean }) => {
            try {
                ensureSecretsInitialized();

                const manifest = new ManifestManager();
                const serviceKey = options.service ?? GLOBAL_SERVICE;
                const scope = validateScope(options.scope);
                const vars = await manifest.getVariables(serviceKey, scope);
                const keys = Object.keys(vars);

                if (keys.length === 0) {
                    info('No secrets found');
                    console.log(`\n  Run ${colors.cyan('dotset secrets set KEY value')} to add secrets.\n`);
                    return;
                }

                console.log(`\n${COLORS.bold}Secrets${COLORS.reset} ${COLORS.dim}(${scope})${COLORS.reset}\n`);

                for (const key of keys.sort()) {
                    if (options.showValues) {
                        console.log(`  ${colors.cyan(key)} = ${vars[key]}`);
                    } else {
                        console.log(`  ${colors.cyan(key)}`);
                    }
                }

                console.log(`\n  ${colors.dim(`${keys.length} secret(s)`)}\n`);
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // secrets delete
    // ─────────────────────────────────────────────────────────────

    secrets
        .command('delete <key>')
        .alias('rm')
        .description('Delete a secret')
        .option('--scope <env>', 'Environment scope', 'development')
        .option('-s, --service <name>', 'Service to scope the secret to')
        .action(async (key: string, options: { scope: string; service?: string }) => {
            try {
                ensureSecretsInitialized();

                const manifest = new ManifestManager();
                const serviceKey = options.service ?? GLOBAL_SERVICE;
                const scope = validateScope(options.scope);
                const removed = await manifest.removeVariable(key, serviceKey, scope);

                if (removed) {
                    success(`Deleted ${colors.cyan(key)} from ${colors.dim(scope)}`);
                } else {
                    error(`Secret ${key} not found`);
                }
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // secrets export
    // ─────────────────────────────────────────────────────────────

    secrets
        .command('export')
        .description('Export secrets to a file or stdout')
        .option('--scope <env>', 'Environment scope', 'development')
        .option('-s, --service <name>', 'Service to export')
        .option('--format <fmt>', 'Output format: env, json, yaml', 'env')
        .option('-o, --output <file>', 'Write to file instead of stdout')
        .action(async (options: { scope: string; service?: string; format: string; output?: string }) => {
            try {
                ensureSecretsInitialized();
                const manifest = new ManifestManager();
                const scope = validateScope(options.scope);
                const service = options.service ?? GLOBAL_SERVICE;

                const variables = await manifest.getVariables(service, scope);

                let output: string;
                switch (options.format) {
                    case 'json':
                        output = JSON.stringify(variables, null, 2);
                        break;
                    case 'yaml':
                        output = Object.entries(variables)
                            .map(([k, v]) => `${k}: "${v.replace(/"/g, '\\"')}"`)
                            .join('\n');
                        break;
                    case 'env':
                    default:
                        output = Object.entries(variables)
                            .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
                            .join('\n');
                        break;
                }

                if (options.output) {
                    const { writeFile } = await import('node:fs/promises');
                    await writeFile(options.output, output + '\n', 'utf8');
                    success(`Exported ${Object.keys(variables).length} secrets to ${colors.cyan(options.output)}`);
                } else {
                    console.log(output);
                }
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // secrets import
    // ─────────────────────────────────────────────────────────────

    secrets
        .command('import <file>')
        .description('Import secrets from a .env file')
        .option('--scope <env>', 'Environment scope', 'development')
        .option('-s, --service <name>', 'Service to import into')
        .option('--overwrite', 'Overwrite existing secrets')
        .action(async (file: string, options: { scope: string; service?: string; overwrite?: boolean }) => {
            try {
                ensureSecretsInitialized();
                const { readFile } = await import('node:fs/promises');
                const { existsSync } = await import('node:fs');

                if (!existsSync(file)) {
                    error(`File not found: ${file}`);
                }

                const content = await readFile(file, 'utf8');
                const manifest = new ManifestManager();
                const scope = validateScope(options.scope);
                const service = options.service ?? GLOBAL_SERVICE;

                // Parse .env file
                const lines = content.split('\n');
                let imported = 0;
                let skipped = 0;

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) continue;

                    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
                    if (!match) continue;

                    const [, key, rawValue] = match;
                    // Remove surrounding quotes
                    let value = rawValue;
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }

                    // Check if exists
                    if (!options.overwrite) {
                        const existing = await manifest.getVariables(service, scope);
                        if (key in existing) {
                            skipped++;
                            continue;
                        }
                    }

                    await manifest.setVariable(key, value, service, scope);
                    imported++;
                }

                success(`Imported ${colors.cyan(String(imported))} secrets from ${colors.dim(file)}`);
                if (skipped > 0) {
                    info(`Skipped ${skipped} existing secrets (use --overwrite to replace)`);
                }
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // secrets rotate
    // ─────────────────────────────────────────────────────────────

    secrets
        .command('rotate')
        .description('Rotate the encryption key')
        .option('--force', 'Skip confirmation')
        .action(async (options: { force?: boolean }) => {
            try {
                ensureSecretsInitialized();
                const manifest = new ManifestManager();

                if (!options.force) {
                    console.log();
                    console.log(colors.yellow('⚠️  Key Rotation Warning'));
                    console.log();
                    console.log('  This will:');
                    console.log('  1. Generate a new encryption key');
                    console.log('  2. Re-encrypt all secrets with the new key');
                    console.log('  3. Invalidate the old key');
                    console.log();
                    console.log('  You will need to update AXION_KEY in all CI/CD environments.');
                    console.log();

                    const readline = await import('node:readline');
                    const rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout,
                    });

                    const answer = await new Promise<string>((resolve) => {
                        rl.question(`  Type ${colors.cyan('ROTATE')} to confirm: `, resolve);
                    });
                    rl.close();

                    if (answer !== 'ROTATE') {
                        info('Rotation cancelled.');
                        return;
                    }
                }

                info('Rotating encryption key...');
                const { oldKey, newKey } = await manifest.rotateKey();

                console.log();
                success('Key rotated successfully!');
                console.log();
                console.log(`  ${colors.dim('Old fingerprint:')} ${getKeyFingerprint(oldKey)}`);
                console.log(`  ${colors.dim('New fingerprint:')} ${getKeyFingerprint(newKey)}`);
                console.log();
                console.log(`  ${colors.dim('New key (save this securely):')}`)
                console.log(`  ${colors.cyan(newKey)}`);
                console.log();
                console.log(`  ${colors.yellow('Update AXION_KEY in all CI/CD environments!')}`);
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // secrets key
    // ─────────────────────────────────────────────────────────────

    const keyCmd = secrets
        .command('key')
        .description('Manage encryption key');

    keyCmd
        .command('show')
        .description('Display the encryption key')
        .action(async () => {
            try {
                ensureSecretsInitialized();
                const manifest = new ManifestManager();
                const key = await manifest.showKey();
                console.log(key);
            } catch (err) {
                error((err as Error).message);
            }
        });

    keyCmd
        .command('fingerprint')
        .description('Show key fingerprint (safe to share)')
        .action(async () => {
            try {
                ensureSecretsInitialized();
                const manifest = new ManifestManager();
                const fingerprint = await manifest.getFingerprint();
                console.log(`Fingerprint: ${colors.cyan(fingerprint)}`);
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

/**
 * Ensure secrets are initialized for this project
 */
async function ensureSecretsInitialized(): Promise<void> {
    const manifest = new ManifestManager();
    if (!(await manifest.isInitialized())) {
        error('Secrets not initialized. Run: dotset secrets init');
    }
}
