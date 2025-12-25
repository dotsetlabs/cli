/**
 * Drift Detection Commands (Axion Module)
 * 
 * Detect differences between local and cloud secrets.
 */

import { Command } from 'commander';
import {
    COLORS,
    colors,
    success,
    error,
    info,
    isAuthenticated,
} from '@dotsetlabs/core';

import {
    ManifestManager,
    GLOBAL_SERVICE,
} from '@dotsetlabs/axion/manifest';

export function registerDriftCommand(program: Command) {
    program
        .command('drift')
        .description('Detect drift between local and cloud secrets (Axion module)')
        .option('--json', 'Output as JSON')
        .option('--ci', 'Exit with code 1 if drift detected (for CI pipelines)')
        .action(async (options: { json?: boolean; ci?: boolean }) => {
            try {
                if (!isAuthenticated()) {
                    error('Not logged in. Run: dotset login');
                }

                info('Comparing local and cloud secrets...');

                const manifest = new ManifestManager();
                const drift = await manifest.detectDrift();

                if (options.json) {
                    console.log(JSON.stringify(drift, null, 2));
                } else {
                    console.log();

                    if (!drift.hasDrift) {
                        success('No drift detected! Local and cloud are in sync.');
                        console.log();
                        return;
                    }

                    console.log(colors.yellow(`⚠️  Drift detected: ${drift.summary.total} difference(s)`));
                    console.log();

                    // Local only (not pushed)
                    if (drift.localOnly.length > 0) {
                        console.log(colors.bold(colors.green('+ Local only (not pushed):')));
                        for (const item of drift.localOnly) {
                            const serviceBadge = item.service === GLOBAL_SERVICE ? '' : colors.dim(` [${item.service}]`);
                            console.log(colors.green(`  + ${item.key}${serviceBadge}`));
                        }
                        console.log();
                    }

                    // Cloud only (not pulled)
                    if (drift.cloudOnly.length > 0) {
                        console.log(colors.bold(colors.red('- Cloud only (not pulled):')));
                        for (const item of drift.cloudOnly) {
                            const serviceBadge = item.service === GLOBAL_SERVICE ? '' : colors.dim(` [${item.service}]`);
                            console.log(colors.red(`  - ${item.key}${serviceBadge}`));
                        }
                        console.log();
                    }

                    // Modified (different values)
                    if (drift.modified.length > 0) {
                        console.log(colors.bold(colors.yellow('~ Modified (different values):')));
                        for (const item of drift.modified) {
                            const serviceBadge = item.service === GLOBAL_SERVICE ? '' : colors.dim(` [${item.service}]`);
                            console.log(colors.yellow(`  ~ ${item.key}${serviceBadge}`));
                            console.log(colors.dim(`      local:  ${maskValue(item.localValue)}`));
                            console.log(colors.dim(`      cloud:  ${maskValue(item.cloudValue)}`));
                        }
                        console.log();
                    }

                    console.log(colors.dim('Run "dotset sync push" to push local changes to cloud.'));
                    console.log(colors.dim('Run "dotset sync pull" to pull cloud changes to local.'));
                    console.log();
                }

                // CI mode: exit 1 if drift detected
                if (options.ci && drift.hasDrift) {
                    process.exit(1);
                }
            } catch (err) {
                error((err as Error).message);
            }
        });
}

/**
 * Masks a secret value for display (shows first/last 2 chars)
 */
function maskValue(value: string): string {
    if (value.length <= 8) {
        return '****';
    }
    return `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 8))}${value.slice(-2)}`;
}
