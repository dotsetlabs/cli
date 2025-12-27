import { Command } from 'commander';
import {
    isProjectInitialized,
    loadProjectConfig,
    initializeProject,
    linkToCloud,
    createCloudProject,
    isAuthenticated,
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
        .action(async (options: {
            name?: string;
            cloud?: boolean;
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

                // Initialize local project (all products enabled by default)
                const config = initializeProject({
                    name: options.name,
                });

                success(`Initialized project: ${colors.cyan(config.name)}`);

                // Show enabled products
                console.log();
                console.log(colors.bold('Enabled products:'));
                console.log(`  ${colors.axion('●')} Axion - ${PRODUCT_DESCRIPTIONS.axion}`);
                console.log(`  ${colors.gluon('●')} Gluon - ${PRODUCT_DESCRIPTIONS.gluon}`);

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
                console.log(`  ${colors.dim('1.')} Run ${colors.cyan('dotset secrets set KEY value')} to add secrets`);
                console.log(`  ${colors.dim('2.')} Run ${colors.cyan('dotset run -- npm start')} to monitor with protection`);
                console.log();
                console.log(colors.yellow('Important:'));
                console.log(`  Add ${colors.bold('.dotset/')} to your .gitignore`);
                console.log();

            } catch (err) {
                error((err as Error).message);
            }
        });
}
