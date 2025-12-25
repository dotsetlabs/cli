/**
 * Webhooks Commands (Tachyon Module)
 * 
 * Manage and inspect webhook requests captured by tunnels.
 */

import { Command } from 'commander';
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

const API_URL = getApiUrl();

interface WebhookRequest {
    id: string;
    tunnelId: string;
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
    statusCode: number;
    timestamp: string;
    duration: number;
}

export function registerWebhooksCommand(program: Command) {
    const webhooks = program
        .command('webhooks')
        .description('Manage captured webhook requests (Tachyon module)');

    // ─────────────────────────────────────────────────────────────
    // webhooks list
    // ─────────────────────────────────────────────────────────────

    webhooks
        .command('list')
        .alias('ls')
        .description('List recent webhook requests')
        .option('--tunnel <id>', 'Filter by tunnel ID')
        .option('--limit <n>', 'Number of requests to show', '20')
        .action(async (options: { tunnel?: string; limit: string }) => {
            try {
                if (!isAuthenticated()) {
                    error('Not logged in. Run: dotset login');
                }

                const token = getAccessToken();
                const limit = parseInt(options.limit, 10) || 20;

                let url = `${API_URL}/tachyon/webhooks?limit=${limit}`;
                if (options.tunnel) {
                    url += `&tunnelId=${options.tunnel}`;
                }

                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    error('Failed to fetch webhooks');
                }

                const requests = await response.json() as WebhookRequest[];

                if (!Array.isArray(requests) || requests.length === 0) {
                    info('No webhook requests captured');
                    console.log(`\n  Start a tunnel with --inspect to capture requests:\n`);
                    console.log(`  ${colors.cyan('dotset share 3000 --inspect')}\n`);
                    return;
                }

                console.log(`\n${COLORS.bold}Recent Webhook Requests${COLORS.reset}\n`);

                for (const req of requests) {
                    const statusColor = req.statusCode >= 400
                        ? colors.red
                        : req.statusCode >= 300
                            ? colors.yellow
                            : colors.green;

                    const time = new Date(req.timestamp).toLocaleTimeString();

                    console.log(
                        `  ${statusColor(String(req.statusCode))} ` +
                        `${colors.dim(req.method.padEnd(6))} ${req.path} ` +
                        `${colors.dim(`${req.duration}ms`)} ` +
                        `${colors.dim(time)}`
                    );
                }

                console.log();
                console.log(colors.dim(`Showing ${requests.length} request(s). Use --limit to see more.`));
                console.log();
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // webhooks show
    // ─────────────────────────────────────────────────────────────

    webhooks
        .command('show <id>')
        .description('Show webhook request details')
        .option('--body', 'Show request body')
        .action(async (id: string, options: { body?: boolean }) => {
            try {
                if (!isAuthenticated()) {
                    error('Not logged in. Run: dotset login');
                }

                const token = getAccessToken();

                const response = await fetch(`${API_URL}/tachyon/webhooks/${id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        error(`Webhook request not found: ${id}`);
                    }
                    error('Failed to fetch webhook');
                }

                const req = await response.json() as WebhookRequest;

                const statusColor = req.statusCode >= 400
                    ? colors.red
                    : req.statusCode >= 300
                        ? colors.yellow
                        : colors.green;

                console.log();
                console.log(`${COLORS.bold}Webhook Request${COLORS.reset}`);
                console.log();
                console.log(`  ${colors.dim('ID:')} ${req.id}`);
                console.log(`  ${colors.dim('Tunnel:')} ${req.tunnelId}`);
                console.log(`  ${colors.dim('Time:')} ${new Date(req.timestamp).toISOString()}`);
                console.log(`  ${colors.dim('Duration:')} ${req.duration}ms`);
                console.log();
                console.log(`  ${statusColor(String(req.statusCode))} ${req.method} ${req.path}`);
                console.log();

                // Headers
                console.log(`${colors.dim('Headers:')}`);
                for (const [key, value] of Object.entries(req.headers)) {
                    console.log(`  ${colors.cyan(key)}: ${value}`);
                }

                // Body
                if (options.body && req.body) {
                    console.log();
                    console.log(`${colors.dim('Body:')}`);
                    try {
                        const parsed = JSON.parse(req.body);
                        console.log(JSON.stringify(parsed, null, 2));
                    } catch {
                        console.log(req.body);
                    }
                }

                console.log();
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // webhooks replay
    // ─────────────────────────────────────────────────────────────

    webhooks
        .command('replay <id>')
        .description('Replay a webhook request to your local server')
        .option('--port <port>', 'Local port to replay to', '3000')
        .action(async (id: string, options: { port: string }) => {
            try {
                if (!isAuthenticated()) {
                    error('Not logged in. Run: dotset login');
                }

                const token = getAccessToken();
                const port = parseInt(options.port, 10) || 3000;

                // Fetch the webhook
                const response = await fetch(`${API_URL}/tachyon/webhooks/${id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    error(`Webhook not found: ${id}`);
                }

                const req = await response.json() as WebhookRequest;

                info(`Replaying ${req.method} ${req.path} to localhost:${port}...`);

                // Replay to local server
                const localUrl = `http://localhost:${port}${req.path}`;

                const replayResponse = await fetch(localUrl, {
                    method: req.method,
                    headers: req.headers,
                    body: req.body,
                });

                const replayStatus = replayResponse.status;
                const statusColor = replayStatus >= 400 ? colors.red : colors.green;

                success(`Replayed! Response: ${statusColor(String(replayStatus))}`);
            } catch (err) {
                error((err as Error).message);
            }
        });
}
