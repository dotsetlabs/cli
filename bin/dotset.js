#!/usr/bin/env node

/**
 * Dotset Labs Unified CLI
 * 
 * Single entry point for Axion, Gluon, and Tachyon CLIs.
 * 
 * Usage:
 *   dotset axion <command>   # Secrets management
 *   dotset gluon <command>   # Runtime telemetry
 *   dotset tachyon <command> # Secure tunnels
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ANSI color codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

// Get package version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgPath = join(__dirname, '..', 'package.json');
let version = '1.0.0';
try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    version = pkg.version;
} catch {
    // Fallback to hardcoded version
}

const args = process.argv.slice(2);
const command = args[0];

// Help text
const HELP = `
${BOLD}dotset labs${RESET} ${DIM}v${version}${RESET}

${DIM}The unified developer platform CLI.${RESET}

${BOLD}Usage:${RESET}
  dotset <product> <command> [options]

${BOLD}Products:${RESET}
  ${CYAN}axion${RESET}    ${DIM}(axn)${RESET}   Zero-knowledge secrets management
  ${CYAN}gluon${RESET}    ${DIM}(gln)${RESET}   Runtime security telemetry
  ${CYAN}tachyon${RESET}  ${DIM}(tcn)${RESET}   Zero-trust localhost tunnels

${BOLD}Examples:${RESET}
  ${DIM}# Secrets management${RESET}
  dotset axion login
  dotset axion init --cloud --name "my-app"
  dotset axion run -- npm start

  ${DIM}# Runtime monitoring${RESET}
  dotset gluon init
  dotset gluon run -- npm start

  ${DIM}# Secure tunnels${RESET}
  dotset tachyon login
  dotset tachyon share 3000 --subdomain my-api

${BOLD}Options:${RESET}
  -h, --help      Show this help message
  -v, --version   Show version information

${BOLD}Documentation:${RESET}
  ${DIM}https://dotsetlabs.com${RESET}
`;

// Version check
if (command === '--version' || command === '-v') {
    console.log(`dotset v${version}`);
    console.log(`  @dotsetlabs/axion   (secrets)`);
    console.log(`  @dotsetlabs/gluon   (telemetry)`);
    console.log(`  @dotsetlabs/tachyon (tunnels)`);
    process.exit(0);
}

// Help check
if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    process.exit(0);
}

// Map 'dotset <cmd>' to the actual binary name
const BIN_MAP = {
    'axion': 'axn',
    'axn': 'axn',
    'gluon': 'gln',
    'gln': 'gln',
    'tachyon': 'tcn',
    'tcn': 'tcn',
};

const binName = BIN_MAP[command.toLowerCase()];

if (!binName) {
    console.error(`${RED}Error:${RESET} Unknown command: ${BOLD}${command}${RESET}`);
    console.error(`\nRun ${CYAN}dotset --help${RESET} for usage information.`);
    process.exit(1);
}

// Forward to the specific CLI
const subArgs = args.slice(1);

const child = spawn(binName, subArgs, {
    stdio: 'inherit',
    shell: true, // Use shell to resolve binary in PATH
});

child.on('error', (err) => {
    if (err.code === 'ENOENT') {
        console.error(`${RED}Error:${RESET} Could not find ${BOLD}${binName}${RESET} command.`);
        console.error(`\nThis usually means the package wasn't installed correctly.`);
        console.error(`Try reinstalling: ${CYAN}npm install -g @dotsetlabs/cli${RESET}`);
    } else {
        console.error(`${RED}Error:${RESET} ${err.message}`);
    }
    process.exit(1);
});

child.on('exit', (code) => {
    process.exit(code ?? 0);
});
