#!/usr/bin/env node
/**
 * Dotset Labs Unified CLI
 * 
 * Single entry point for the dotset ecosystem.
 * Provides unified commands plus routing to product-specific CLIs.
 */

import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerStatusCommand } from './commands/status.js';
import { registerProductCommands } from './commands/products.js';

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
// Register Commands
// ─────────────────────────────────────────────────────────────

registerInitCommand(program);
registerAuthCommands(program);
registerStatusCommand(program);
registerProductCommands(program);

// ─────────────────────────────────────────────────────────────
// Parse
// ─────────────────────────────────────────────────────────────

program.parse(process.argv);
