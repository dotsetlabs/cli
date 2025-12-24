import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
    saveCredentials,
    clearCredentials,
    getApiUrl,
    getCurrentUser,
    COLORS,
    colors,
    success,
    error,
    info,
    printBanner,
} from '@dotsetlabs/core';

export function registerAuthCommands(program: Command) {
    program
        .command('login')
        .description('Authenticate with dotset labs cloud')
        .action(async () => {
            try {
                const apiUrl = getApiUrl();
                const authUrl = `${apiUrl}/auth/cli`;

                console.log();
                printBanner();
                console.log();
                info('Opening browser for authentication...');
                console.log();
                console.log(`  ${colors.dim('If browser does not open, visit:')}`);
                console.log(`  ${colors.cyan(authUrl)}`);
                console.log();

                // Open browser
                const opener = process.platform === 'darwin' ? 'open' :
                    process.platform === 'win32' ? 'start' : 'xdg-open';
                spawn(opener, [authUrl], { detached: true, stdio: 'ignore' }).unref();

                // Wait for token input
                const rl = createInterface({
                    input: process.stdin,
                    output: process.stdout,
                });

                const token = await new Promise<string>((resolve) => {
                    rl.question(`${COLORS.cyan}?${COLORS.reset} Paste your token: `, (answer) => {
                        rl.close();
                        resolve(answer.trim());
                    });
                });

                if (!token) {
                    error('No token provided.');
                }

                // Validate token
                info('Validating token...');
                saveCredentials({ accessToken: token });

                try {
                    const user = await getCurrentUser();
                    success(`Logged in as ${colors.cyan(user.email)}`);
                } catch {
                    clearCredentials();
                    error('Invalid token. Please try again.');
                }

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
}
