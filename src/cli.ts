#!/usr/bin/env node
/**
 * Dotset Labs Unified CLI
 * 
 * Single entry point for the dotset ecosystem.
 * Provides unified commands plus routing to product-specific CLIs.
 */

import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
    // Project
    isProjectInitialized,
    loadProjectConfig,
    initializeProject,
    linkToCloud,
    type ProductKey,

    // Auth
    isAuthenticated,
    saveCredentials,
    clearCredentials,
    getApiUrl,

    // API
    createCloudProject,
    getCurrentUser,

    // UI
    COLORS,
    colors,
    success,
    error,
    info,
    warn,
    printBanner,
    PRODUCT_NAMES,
    PRODUCT_DESCRIPTIONS,

    // Integrations
    isProductInstalled,
    getInstallCommand,
} from '@dotsetlabs/core';

const VERSION = '1.0.0';

// ─────────────────────────────────────────────────────────────
// Program Setup
// ─────────────────────────────────────────────────────────────

const program = new Command();

program
    .name('dotset')
    .description('The unified CLI for dotset labs. Secrets, Security, and Tunnels.')
    .version(VERSION);

// ─────────────────────────────────────────────────────────────
// Init Command - Interactive Product Selection
// ─────────────────────────────────────────────────────────────

program
    .command('init')
    .description('Initialize a new dotset project')
    .option('--name <name>', 'Project name')
    .option('--cloud', 'Create cloud project immediately')
    .option('--axion', 'Enable Axion (secrets)')
    .option('--gluon', 'Enable Gluon (security)')
    .option('--tachyon', 'Enable Tachyon (tunnels)')
    .action(async (options: {
        name?: string;
        cloud?: boolean;
        axion?: boolean;
        gluon?: boolean;
        tachyon?: boolean;
    }) => {
        try {
            if (isProjectInitialized()) {
                const existing = loadProjectConfig();
                warn(`Project already initialized: ${existing?.name}`);
                info('Delete .dotset/ to reinitialize.');
                return;
            }

            console.log();
            printBanner();
            console.log();

            // Determine products to enable
            let products = {
                axion: options.axion ?? false,
                gluon: options.gluon ?? false,
                tachyon: options.tachyon ?? false,
            };

            // If no products specified via flags, prompt interactively
            const anyProductFlagSet = options.axion || options.gluon || options.tachyon;
            if (!anyProductFlagSet) {
                console.log(colors.bold('Select products to enable:'));
                console.log();
                products = await promptProductSelection();
                console.log();
            }

            // Ensure at least one product is enabled
            if (!products.axion && !products.gluon && !products.tachyon) {
                error('At least one product must be enabled.');
            }

            // Initialize local project
            const config = initializeProject({
                name: options.name,
                products,
            });

            success(`Initialized project: ${colors.cyan(config.name)}`);

            // Show enabled products
            console.log();
            console.log(colors.bold('Enabled products:'));
            if (products.axion) console.log(`  ${colors.axion('●')} Axion - ${PRODUCT_DESCRIPTIONS.axion}`);
            if (products.gluon) console.log(`  ${colors.gluon('●')} Gluon - ${PRODUCT_DESCRIPTIONS.gluon}`);
            if (products.tachyon) console.log(`  ${colors.tachyon('●')} Tachyon - ${PRODUCT_DESCRIPTIONS.tachyon}`);

            // Check if product CLIs are installed
            const missingProducts: ProductKey[] = [];
            for (const [product, enabled] of Object.entries(products)) {
                if (enabled && !isProductInstalled(product as ProductKey)) {
                    missingProducts.push(product as ProductKey);
                }
            }

            if (missingProducts.length > 0) {
                console.log();
                warn(`Missing CLI tools: ${missingProducts.join(', ')}`);
                console.log(`  Install: ${colors.cyan(getInstallCommand(missingProducts))}`);
            }

            // Create cloud project if requested
            if (options.cloud) {
                console.log();
                if (!isAuthenticated()) {
                    warn('Not logged in. Run `dotset login` first for cloud features.');
                } else {
                    info('Creating cloud project...');
                    try {
                        const cloudProject = await createCloudProject({
                            name: config.name,
                            axionEnabled: products.axion,
                            gluonEnabled: products.gluon,
                            tachyonEnabled: products.tachyon,
                        });
                        linkToCloud(cloudProject.id);
                        success(`Linked to cloud project: ${colors.cyan(cloudProject.id)}`);
                    } catch (err) {
                        warn(`Could not create cloud project: ${(err as Error).message}`);
                    }
                }
            }

            // Next steps
            console.log();
            console.log(colors.bold('Next steps:'));
            if (products.axion) {
                console.log(`  ${colors.dim('1.')} Run ${colors.cyan('axn set KEY value')} to add secrets`);
            }
            if (products.gluon) {
                console.log(`  ${colors.dim(products.axion ? '2.' : '1.')} Run ${colors.cyan('gln run -- npm start')} to monitor`);
            }
            if (products.tachyon) {
                console.log(`  ${colors.dim('•')} Run ${colors.cyan('tcn share 3000')} to create a tunnel`);
            }
            console.log();
            console.log(colors.yellow('Important:'));
            console.log(`  Add ${colors.bold('.dotset/')} to your .gitignore`);
            console.log();

        } catch (err) {
            error((err as Error).message);
        }
    });

// ─────────────────────────────────────────────────────────────
// Login Command
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Logout Command
// ─────────────────────────────────────────────────────────────

program
    .command('logout')
    .description('Clear stored credentials')
    .action(() => {
        clearCredentials();
        success('Logged out successfully.');
    });

// ─────────────────────────────────────────────────────────────
// Status Command
// ─────────────────────────────────────────────────────────────

program
    .command('status')
    .description('Show project and auth status')
    .action(async () => {
        console.log();
        printBanner();
        console.log();

        // Auth status
        if (isAuthenticated()) {
            try {
                const user = await getCurrentUser();
                console.log(`${colors.green('●')} Logged in as ${colors.cyan(user.email)}`);
            } catch (err: any) {
                if (err.code === 'BETA_ACCESS_REQUIRED') {
                    console.log(`${colors.yellow('●')} Beta access required. Set ${colors.cyan('DOTSET_BETA_PASSWORD')}`);
                } else {
                    console.log(`${colors.yellow('●')} Token may be invalid. Run ${colors.cyan('dotset login')}`);
                }
            }
        } else {
            console.log(`${colors.dim('○')} Not logged in`);
        }

        console.log();

        // Project status
        if (isProjectInitialized()) {
            const config = loadProjectConfig()!;
            console.log(`${colors.bold('Project:')} ${config.name}`);
            console.log();

            console.log(colors.bold('Products:'));
            console.log(`  Axion:   ${config.products.axion ? colors.green('enabled') : colors.dim('disabled')}`);
            console.log(`  Gluon:   ${config.products.gluon ? colors.green('enabled') : colors.dim('disabled')}`);
            console.log(`  Tachyon: ${config.products.tachyon ? colors.green('enabled') : colors.dim('disabled')}`);
            console.log();

            if (config.cloudProjectId) {
                console.log(`${colors.bold('Cloud:')} ${colors.cyan(config.cloudProjectId)}`);
            } else {
                console.log(`${colors.bold('Cloud:')} ${colors.dim('not linked')}`);
            }
        } else {
            console.log(`${colors.dim('No project initialized.')}`);
            console.log(`Run ${colors.cyan('dotset init')} to create a project.`);
        }

        console.log();
    });

// ─────────────────────────────────────────────────────────────
// Product Routing Commands
// ─────────────────────────────────────────────────────────────

const PRODUCT_BINARIES: Record<string, string> = {
    'axion': 'axn',
    'axn': 'axn',
    'gluon': 'gln',
    'gln': 'gln',
    'tachyon': 'tcn',
    'tcn': 'tcn',
};

// Add passthrough commands for each product
for (const [alias, binary] of Object.entries(PRODUCT_BINARIES)) {
    if (['axion', 'gluon', 'tachyon'].includes(alias)) {
        program
            .command(`${alias} [args...]`)
            .description(`Run ${PRODUCT_NAMES[alias as ProductKey]} CLI`)
            .allowUnknownOption()
            .action((args: string[]) => {
                const child = spawn(binary, args, {
                    stdio: 'inherit',
                    shell: true,
                });

                child.on('error', (err) => {
                    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                        console.error(`${COLORS.red}✗${COLORS.reset} ${PRODUCT_NAMES[alias as ProductKey]} CLI not found.`);
                        console.error(`  Install: ${COLORS.cyan}npm i -g @dotsetlabs/${alias}${COLORS.reset}`);
                    } else {
                        console.error(`${COLORS.red}✗${COLORS.reset} ${(err as Error).message}`);
                    }
                    process.exit(1);
                });

                child.on('exit', (code) => {
                    process.exit(code ?? 0);
                });
            });
    }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function promptProductSelection(): Promise<{ axion: boolean; gluon: boolean; tachyon: boolean }> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const ask = (question: string): Promise<boolean> => {
        return new Promise((resolve) => {
            rl.question(`${COLORS.cyan}?${COLORS.reset} ${question} (Y/n): `, (answer) => {
                const normalized = answer.trim().toLowerCase();
                resolve(normalized === '' || normalized === 'y' || normalized === 'yes');
            });
        });
    };

    console.log(`  ${colors.axion('Axion')} - ${PRODUCT_DESCRIPTIONS.axion}`);
    const axion = await ask('  Enable Axion?');

    console.log(`  ${colors.gluon('Gluon')} - ${PRODUCT_DESCRIPTIONS.gluon}`);
    const gluon = await ask('  Enable Gluon?');

    console.log(`  ${colors.tachyon('Tachyon')} - ${PRODUCT_DESCRIPTIONS.tachyon}`);
    const tachyon = await ask('  Enable Tachyon?');

    rl.close();

    return { axion, gluon, tachyon };
}

// ─────────────────────────────────────────────────────────────
// Parse
// ─────────────────────────────────────────────────────────────

program.parse(process.argv);
