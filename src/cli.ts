#!/usr/bin/env node
/**
 * dotset - The Secure Developer Runtime
 * 
 * Unified CLI for the dotset labs platform.
 * Combines secrets management, runtime security, and local CI.
 */

import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerStatusCommand } from './commands/status.js';
import { registerRunCommand } from './commands/run.js';
import { registerSecretsCommands } from './commands/secrets.js';
import { registerSecurityCommands } from './commands/security.js';

import { registerSyncCommands } from './commands/sync.js';
import { registerDriftCommand } from './commands/drift.js';
import { registerProjectCommands } from './commands/project.js';

import { registerCICommand } from './commands/ci.js';
import { registerTeamCommands } from './commands/team.js';
import { registerAuditCommands } from './commands/audit.js';
import { registerReplayCommand } from './commands/replay.js';

const VERSION = '1.0.0';

// ─────────────────────────────────────────────────────────────
// Program Setup
// ─────────────────────────────────────────────────────────────

const program = new Command();

program
    .name('dotset')
    .description('The Secure Developer Runtime — secrets, security, and local CI in one CLI.')
    .version(VERSION);

// ─────────────────────────────────────────────────────────────
// Core Commands
// ─────────────────────────────────────────────────────────────

registerInitCommand(program);
registerAuthCommands(program);
registerReplayCommand(program);
registerStatusCommand(program);
registerRunCommand(program);

// ─────────────────────────────────────────────────────────────
// Secrets Module (Axion)
// ─────────────────────────────────────────────────────────────

registerSecretsCommands(program);
registerSyncCommands(program);
registerDriftCommand(program);

// ─────────────────────────────────────────────────────────────
// Security Module (Gluon)
// ─────────────────────────────────────────────────────────────

registerSecurityCommands(program);

// ─────────────────────────────────────────────────────────────
// CI Module (Hadron)
// ─────────────────────────────────────────────────────────────

registerCICommand(program);



// ─────────────────────────────────────────────────────────────
// Team Management (RBAC)
// ─────────────────────────────────────────────────────────────

registerTeamCommands(program);
registerAuditCommands(program);

// ─────────────────────────────────────────────────────────────
// Project Management
// ─────────────────────────────────────────────────────────────

registerProjectCommands(program);

// ─────────────────────────────────────────────────────────────
// Parse
// ─────────────────────────────────────────────────────────────

program.parse(process.argv);

