/**
 * Tunnel Commands (Tachyon Module)
 * 
 * CLI implementation for secure tunnels.
 * Uses the @dotsetlabs/tachyon SDK for native tunnel management.
 */

import { Command } from 'commander';
import {
    COLORS,
    colors,
    success,
    error,
    info,
    warn,
    isAuthenticated as coreIsAuthenticated,
    apiRequest,
    // RBAC permission utilities
    loadProjectConfig,
    hasPermission,
    ensurePermissions,
    PermissionDeniedError,
} from '@dotsetlabs/core';

// Import Tachyon SDK
import { createTunnel, TunnelClient, type TunnelOptions } from '@dotsetlabs/tachyon';
import { registerTunnel, closeTunnel } from '@dotsetlabs/tachyon/auth';
import { createInspector } from '@dotsetlabs/tachyon/inspector';



// Relay WebSocket URL
const RELAY_URL = process.env.TACHYON_RELAY_URL || 'wss://relay.dotsetlabs.com';

export function registerTunnelCommands(program: Command) {
    // ─────────────────────────────────────────────────────────────
    // share - Share localhost via tunnel
    // ─────────────────────────────────────────────────────────────

    program
        .command('share <port>')
        .description('Share localhost via secure tunnel (Tachyon module)')
        .option('--subdomain <name>', 'Request specific subdomain (Pro feature)')
        .option('--allow <emails...>', 'Allow specific email addresses')
        .option('--inspect [port]', 'Enable request inspector')
        .option('--public', 'Allow public access (no auth required)')
        .option('--project <id>', 'Link to a specific project')
        .action(async (port: string, options: {
            subdomain?: string;
            allow?: string[];
            inspect?: boolean | string;
            public?: boolean;
            project?: string;
        }) => {
            let tunnelClient: TunnelClient | null = null;
            let inspector: ReturnType<typeof createInspector> | null = null;

            try {
                const portNum = parseInt(port, 10);
                if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
                    error('Invalid port number. Must be between 1 and 65535.');
                }

                // Check authentication (required for authenticated tunnels)
                const isAuth = coreIsAuthenticated();
                if (!isAuth && !options.public) {
                    warn('Not logged in. Creating public tunnel.');
                    console.log(`  Run ${colors.cyan('dotset login')} for authenticated tunnels.\n`);
                    options.public = true;
                }

                // ─────────────────────────────────────────────────────────────
                // RBAC Permission Check for Public Tunnels
                // ─────────────────────────────────────────────────────────────

                if (options.public && isAuth) {
                    try {
                        const projectConfig = loadProjectConfig();
                        const projectId = options.project || projectConfig?.cloudProjectId;

                        if (projectId) {
                            await ensurePermissions();

                            // Check if user can create public tunnels
                            if (!hasPermission(projectId, 'tachyon', 'create:public')) {
                                throw new PermissionDeniedError(
                                    'Access Denied: Your role does not have permission to create public tunnels.\n' +
                                    'Only project owners and admins can expose services publicly.'
                                );
                            }
                        }
                    } catch (err: unknown) {
                        if (err instanceof PermissionDeniedError) {
                            error(err.message);
                        }
                        // Continue - server will enforce
                    }
                }

                info(`Starting tunnel to localhost:${portNum}...`);

                // Register tunnel via API
                const registration = await registerTunnel({
                    port: portNum,
                    subdomain: options.subdomain,
                    isPublic: options.public,
                    projectId: options.project,
                    allowedEmails: options.allow,
                });

                // Create tunnel options
                const tunnelOpts: TunnelOptions = {
                    port: portNum,
                    host: 'localhost',
                    public: options.public ?? false,
                    subdomain: registration.subdomain,
                    tunnelToken: registration.tunnelToken,
                    tunnelId: registration.id,
                    relayUrl: RELAY_URL,
                };

                // Create and connect tunnel
                tunnelClient = await createTunnel(tunnelOpts);

                console.log();
                success('Tunnel connected!');
                console.log();
                console.log(`  ${colors.dim('Public URL:')} ${colors.cyan(registration.url)}`);
                console.log(`  ${colors.dim('Subdomain:')}  ${registration.subdomain}`);
                console.log(`  ${colors.dim('Forwards to:')} localhost:${portNum}`);

                if (options.allow && options.allow.length > 0) {
                    console.log(`  ${colors.dim('Allowed:')}    ${options.allow.join(', ')}`);
                }

                if (options.public) {
                    console.log(`  ${colors.dim('Access:')}     ${colors.yellow('Public (no auth)')}`);
                } else {
                    console.log(`  ${colors.dim('Access:')}     ${colors.green('Authenticated')}`);
                }
                console.log();
                console.log(`  ${colors.dim('Press Ctrl+C to stop the tunnel.')}`);
                console.log();

                // Start inspector if requested
                if (options.inspect !== undefined && options.inspect !== false) {
                    const inspectPort = typeof options.inspect === 'string'
                        ? parseInt(options.inspect, 10)
                        : 4040;

                    inspector = createInspector({
                        port: inspectPort,
                        proxyOptions: {
                            host: 'localhost',
                            port: portNum,
                        },
                    });

                    await inspector.start();
                    console.log(`  ${colors.dim('Inspector:')}  ${colors.cyan(`http://localhost:${inspectPort}`)}`);
                    console.log();
                }

                // Handle graceful shutdown
                const cleanup = async () => {
                    console.log('\n');
                    info('Closing tunnel...');

                    if (inspector) {
                        await inspector.stop();
                    }

                    if (tunnelClient) {
                        await tunnelClient.close();
                    }

                    // Notify server
                    await closeTunnel(registration.id);

                    success('Tunnel closed.');
                    process.exit(0);
                };

                process.on('SIGINT', cleanup);
                process.on('SIGTERM', cleanup);

                // Keep process alive
                await new Promise(() => { });

            } catch (err: any) {
                // Clean up on error
                if (inspector) await inspector.stop().catch(() => { });
                if (tunnelClient) await tunnelClient.close().catch(() => { });

                if (err.status === 403) {
                    error(`Permission denied: ${err.message || 'You do not have permission to create this tunnel.'}`);
                }
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // tunnels - List active tunnels
    // ─────────────────────────────────────────────────────────────

    program
        .command('tunnels')
        .description('List active tunnels')
        .action(async () => {
            try {
                const tunnels = await apiRequest<{ subdomain: string; port: number; status: string; url?: string }[]>('GET', '/tachyon/tunnels');

                if (!Array.isArray(tunnels) || tunnels.length === 0) {
                    info('No active tunnels');
                    console.log(`\n  Run ${colors.cyan('dotset share <port>')} to create a tunnel.\n`);
                    return;
                }

                console.log(`\n${COLORS.bold}Active Tunnels${COLORS.reset}\n`);

                for (const tunnel of tunnels) {
                    const status = tunnel.status === 'connected'
                        ? colors.green('●')
                        : colors.yellow('○');
                    const url = tunnel.url || `${tunnel.subdomain}.tunnel.dotsetlabs.dev`;
                    console.log(`  ${status} ${colors.cyan(url)} → localhost:${tunnel.port}`);
                }

                console.log();
            } catch (err) {
                error((err as Error).message);
            }
        });
}
