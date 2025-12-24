import { Command } from 'commander';
import { createInterface } from 'node:readline';
import {
    isProjectInitialized,
    loadProjectConfig,
    initializeProject,
    linkToCloud,
    createCloudProject,
    isAuthenticated,
    isProductInstalled,
    getInstallCommand,
    type ProductKey,
    COLORS,
    colors,
    success,
    error,
    info,
    warn,
    printBanner,
    PRODUCT_DESCRIPTIONS,
} from '@dotsetlabs/core';

export function registerInitCommand(program: Command) {
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
}

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
