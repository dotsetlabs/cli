import { Command } from 'commander';
import { spawn } from 'node:child_process';
import {
    type ProductKey,
    COLORS,
    PRODUCT_NAMES,
} from '@dotsetlabs/core';

export function registerProductCommands(program: Command) {
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
}
