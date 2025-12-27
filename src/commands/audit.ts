/**
 * Audit Commands
 *
 * CLI commands for viewing and verifying project audit logs.
 * Implements unified audit log trail and hash chain verification.
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
    apiRequest,
    requireAuth,
} from '@dotsetlabs/core';

interface AuditLog {
    id: string;
    action: string;
    source: string;
    scope?: string;
    metadata?: Record<string, any>;
    ipAddress: string;
    createdAt: string;
    actorEmail?: string;
    actorTokenName?: string;
}

interface IntegrityResult {
    valid: boolean;
    entriesVerified: number;
    error?: string;
}

export function registerAuditCommands(program: Command) {
    const audit = program
        .command('audit')
        .description('View and verify project audit logs');

    // ─────────────────────────────────────────────────────────────
    // audit list - View recent activity
    // ─────────────────────────────────────────────────────────────

    audit
        .command('list')
        .alias('ls')
        .description('List recent audit logs')
        .option('--limit <n>', 'Number of logs to show', '20')
        .option('--project <id>', 'Project ID (defaults to current project)')
        .action(async (options: { limit: string; source?: string; project?: string }) => {
            try {
                requireAuth();

                const projectId = options.project || getProjectId();
                if (!projectId) {
                    error('No project specified. Use --project <id> or run from a linked project directory.');
                }

                let url = `/projects/${projectId}/audit?limit=${options.limit}`;
                if (options.source) {
                    url += `&sources=${options.source}`;
                }

                const response = await apiRequest<{ logs: AuditLog[] }>('GET', url);
                const logs = response.logs;

                if (!logs || logs.length === 0) {
                    info('No audit logs found.');
                    return;
                }

                console.log(`\n${COLORS.bold}Project Audit Logs${COLORS.reset}\n`);

                for (const log of logs) {
                    const date = new Date(log.createdAt).toLocaleString();
                    const actor = log.actorEmail || log.actorTokenName || 'System';
                    const scope = log.scope ? ` [${log.scope}]` : '';

                    console.log(`  ${colors.dim(date)} ${colors.cyan(log.action.padEnd(25))} ${colors.dim(actor)}`);
                }

                console.log();
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // audit verify - Check hash chain integrity
    // ─────────────────────────────────────────────────────────────

    audit
        .command('verify')
        .description('Verify the cryptographic integrity of the audit log chain')
        .option('--project <id>', 'Project ID (defaults to current project)')
        .action(async (options: { project?: string }) => {
            try {
                requireAuth();

                const projectId = options.project || getProjectId();
                if (!projectId) {
                    error('No project specified.');
                }

                info('Verifying audit log hash chain...');

                const result = await apiRequest<IntegrityResult>('GET', `/projects/${projectId}/audit/verify`);

                if (result.valid) {
                    success(`Integrity verified! ${result.entriesVerified} entries checked.`);
                    console.log(`  ${colors.dim('Status:')} No tampering detected in the cryptographic chain.\n`);
                } else {
                    error(`Integrity check FAILED: ${result.error}`);
                    console.log(`  ${colors.red('CAUTION:')} The audit log chain appears to be broken or tampered with at entry ${colors.bold(result.error || 'unknown')}.\n`);
                    process.exit(1);
                }
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // audit export - Export logs
    // ─────────────────────────────────────────────────────────────

    audit
        .command('export')
        .description('Export audit logs for compliance')
        .option('--format <format>', 'Output format (json, csv)', 'json')
        .option('--project <id>', 'Project ID (defaults to current project)')
        .action(async (options: { format: string; project?: string }) => {
            try {
                requireAuth();

                const projectId = options.project || getProjectId();
                if (!projectId) {
                    error('No project specified.');
                }

                const format = options.format.toLowerCase();
                if (format !== 'json' && format !== 'csv') {
                    error('Invalid format. Use json or csv.');
                }

                info(`Exporting audit logs as ${format.toUpperCase()}...`);

                const rawContent = await apiRequest<string>('GET', `/projects/${projectId}/audit/export?format=${format}`);

                // Output to stdout (user can redirect to file)
                console.log(rawContent);
            } catch (err) {
                error((err as Error).message);
            }
        });
}

function getProjectId(): string | null {
    const config = loadProjectConfig();
    return config?.cloudProjectId ?? null;
}
