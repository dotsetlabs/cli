/**
 * Auth Commands
 *
 * Handles authentication with dotset labs cloud using GitHub Device Flow.
 * Stores credentials and permissions for RBAC enforcement.
 */

import { Command } from 'commander';
import { spawn } from 'node:child_process';
import {
    saveCredentials,
    clearCredentials,
    getApiUrl,
    getCurrentUser,
    updatePermissions,
    type ProjectPermission,
    COLORS,
    colors,
    success,
    error,
    info,
    printBanner,
} from '@dotsetlabs/core';

interface DeviceCodeResponse {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
    interval: number;
}

interface DevicePollResponse {
    status: 'pending' | 'slow_down' | 'complete';
    user?: {
        id: string;
        email: string;
        name?: string;
        avatarUrl?: string;
        provider: string;
        createdAt: string;
    };
    tokens?: {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
    };
    permissions?: ProjectPermission[];
}

export function registerAuthCommands(program: Command) {
    program
        .command('login')
        .description('Authenticate with dotset labs cloud')
        .option('--provider <provider>', 'OAuth provider (github or google)', 'github')
        .action(async (options: { provider: string }) => {
            try {
                const apiUrl = getApiUrl();
                const provider = options.provider.toLowerCase();

                if (provider !== 'github' && provider !== 'google') {
                    error('Invalid provider. Use "github" or "google".');
                }

                console.log();
                printBanner();
                console.log();
                info('Initiating device authorization...');

                // Step 1: Request device code
                const deviceEndpoint = provider === 'google'
                    ? `${apiUrl}/auth/device/google`
                    : `${apiUrl}/auth/device`;

                const deviceResponse = await fetch(deviceEndpoint, { method: 'POST' });

                if (!deviceResponse.ok) {
                    const err = await deviceResponse.json().catch(() => ({})) as { message?: string };
                    error(err.message || 'Failed to initiate device authorization.');
                }

                const deviceData = await deviceResponse.json() as DeviceCodeResponse;

                // Step 2: Display instructions
                console.log();
                console.log(`  ${COLORS.bold}To authenticate, visit:${COLORS.reset}`);
                console.log();
                console.log(`  ${colors.cyan(deviceData.verificationUri)}`);
                console.log();
                console.log(`  ${COLORS.bold}And enter this code:${COLORS.reset}  ${colors.cyan(deviceData.userCode)}`);
                console.log();

                // Try to open browser automatically
                try {
                    const opener = process.platform === 'darwin' ? 'open' :
                        process.platform === 'win32' ? 'start' : 'xdg-open';
                    spawn(opener, [deviceData.verificationUri], {
                        detached: true,
                        stdio: 'ignore',
                    }).unref();
                    info('Browser opened. Complete the authorization in your browser.');
                } catch {
                    // Ignore browser open failure
                }

                console.log();
                process.stdout.write(colors.dim('Waiting for authorization'));

                // Step 3: Poll for completion
                const pollEndpoint = provider === 'google'
                    ? `${apiUrl}/auth/device/google/poll`
                    : `${apiUrl}/auth/device/poll`;

                const pollInterval = (deviceData.interval || 5) * 1000;
                const timeout = (deviceData.expiresIn || 900) * 1000;
                const startTime = Date.now();

                let pollResult: DevicePollResponse | null = null;

                while (Date.now() - startTime < timeout) {
                    await sleep(pollInterval);
                    process.stdout.write('.');

                    try {
                        const pollResponse = await fetch(pollEndpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ deviceCode: deviceData.deviceCode }),
                        });

                        if (pollResponse.status === 410) {
                            console.log();
                            error('Device code expired. Please run login again.');
                        }

                        if (pollResponse.status === 403) {
                            console.log();
                            error('Authorization denied.');
                        }

                        if (!pollResponse.ok && pollResponse.status !== 200) {
                            // Other error, might be rate limited
                            continue;
                        }

                        pollResult = await pollResponse.json() as DevicePollResponse;

                        if (pollResult.status === 'complete') {
                            break;
                        }

                        if (pollResult.status === 'slow_down') {
                            // Increase poll interval
                            await sleep(pollInterval);
                        }
                    } catch {
                        // Network error, continue polling
                        continue;
                    }
                }

                console.log();

                if (!pollResult || pollResult.status !== 'complete') {
                    error('Authorization timed out. Please try again.');
                }

                // Step 4: Save credentials and permissions
                const expiresAt = pollResult.tokens!.expiresAt;
                saveCredentials({
                    accessToken: pollResult.tokens!.accessToken,
                    refreshToken: pollResult.tokens!.refreshToken,
                    expiresAt: new Date(expiresAt * 1000).toISOString(),
                    email: pollResult.user!.email,
                    userId: pollResult.user!.id,
                    provider: pollResult.user!.provider as 'github' | 'google',
                });

                // Save permissions if provided
                if (pollResult.permissions && pollResult.permissions.length > 0) {
                    updatePermissions(pollResult.permissions);
                }

                console.log();
                success(`Logged in as ${colors.cyan(pollResult.user!.email)}`);

                // Show project access summary
                if (pollResult.permissions && pollResult.permissions.length > 0) {
                    console.log();
                    console.log(`  ${colors.dim('Project Access:')}`);
                    for (const perm of pollResult.permissions.slice(0, 5)) {
                        const roleColor = perm.role === 'admin' ? colors.green :
                            perm.role === 'member' ? colors.cyan : colors.dim;
                        console.log(`    ${roleColor('●')} ${perm.projectName} ${colors.dim(`(${perm.role})`)}`);
                    }
                    if (pollResult.permissions.length > 5) {
                        console.log(`    ${colors.dim(`... and ${pollResult.permissions.length - 5} more`)}`);
                    }
                }

                console.log();
            } catch (err) {
                error((err as Error).message);
            }
        });

    program
        .command('logout')
        .description('Clear stored credentials')
        .action(() => {
            clearCredentials();
            success('Logged out successfully.');
        });

    program
        .command('whoami')
        .description('Show current logged in user')
        .action(async () => {
            try {
                const user = await getCurrentUser();
                console.log();
                console.log(`  ${colors.dim('Email:')}    ${colors.cyan(user.email)}`);
                console.log(`  ${colors.dim('Provider:')} ${user.provider}`);
                console.log(`  ${colors.dim('Plan:')}     ${user.subscription?.plan || 'free'}`);
                console.log();
            } catch (err) {
                error('Not logged in. Run `dotset login` to authenticate.');
            }
        });
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
