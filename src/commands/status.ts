import { Command } from 'commander';
import {
    isProjectInitialized,
    loadProjectConfig,
    isAuthenticated,
    getCurrentUser,
    colors,
    printBanner,
} from '@dotsetlabs/core';

export function registerStatusCommand(program: Command) {
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

                console.log(colors.bold('Modules (all enabled):'));
                console.log(`  Secrets (Axion):   ${colors.green('enabled')}`);
                console.log(`  Security (Gluon):  ${colors.green('enabled')}`);
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
}
