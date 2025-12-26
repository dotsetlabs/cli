/**
 * Team Commands
 *
 * CLI commands for managing project team members and permissions.
 * Implements RBAC team management via the Dotset API.
 */

import { Command } from 'commander';
import {
    COLORS,
    colors,
    success,
    error,
    info,
    warn,
    loadProjectConfig,
    apiRequest,
    requireAuth,
    refreshPermissions,
} from '@dotsetlabs/core';

interface TeamMember {
    id: string;
    userId: string;
    userEmail: string;
    role: 'admin' | 'member' | 'readonly';
    allowedScopes: string[];
    customPermissions: Record<string, boolean>;
    createdAt: string;
    revokedAt?: string;
}

export function registerTeamCommands(program: Command) {
    const team = program
        .command('team')
        .description('Manage project team members and permissions');

    // ─────────────────────────────────────────────────────────────
    // team list - List team members
    // ─────────────────────────────────────────────────────────────

    team
        .command('list')
        .description('List project team members')
        .option('--project <id>', 'Project ID (defaults to current project)')
        .action(async (options: { project?: string }) => {
            try {
                requireAuth();

                const projectId = options.project || getProjectId();
                if (!projectId) {
                    error('No project specified. Use --project <id> or run from a linked project directory.');
                }

                const members = await apiRequest<TeamMember[]>('GET', `/projects/${projectId}/members`);

                if (!members || members.length === 0) {
                    info('No team members found.');
                    console.log(`\n  Run ${colors.cyan('dotset team invite <email>')} to add members.\n`);
                    return;
                }

                console.log(`\n${COLORS.bold}Team Members${COLORS.reset}\n`);

                const activeMembers = members.filter(m => !m.revokedAt);
                const revokedMembers = members.filter(m => m.revokedAt);

                for (const member of activeMembers) {
                    const roleColor = member.role === 'admin' ? colors.green :
                        member.role === 'member' ? colors.cyan : colors.dim;
                    const scopes = member.allowedScopes.length > 0
                        ? member.allowedScopes.join(', ')
                        : 'all';

                    console.log(`  ${roleColor('●')} ${member.userEmail}`);
                    console.log(`    ${colors.dim('Role:')}   ${roleColor(member.role)}`);
                    console.log(`    ${colors.dim('Scopes:')} ${scopes}`);
                    console.log();
                }

                if (revokedMembers.length > 0) {
                    console.log(`${colors.dim(`  + ${revokedMembers.length} revoked member(s)`)}\n`);
                }
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // team invite - Invite a new team member
    // ─────────────────────────────────────────────────────────────

    team
        .command('invite <email>')
        .description('Invite a team member to the project')
        .option('--role <role>', 'Member role: admin, member, readonly', 'member')
        .option('--scopes <scopes>', 'Comma-separated allowed scopes (e.g., development,staging)')
        .option('--project <id>', 'Project ID (defaults to current project)')
        .action(async (email: string, options: {
            role: string;
            scopes?: string;
            project?: string;
        }) => {
            try {
                requireAuth();

                const projectId = options.project || getProjectId();
                if (!projectId) {
                    error('No project specified. Use --project <id> or run from a linked project directory.');
                }

                const role = options.role.toLowerCase();
                if (!['admin', 'member', 'readonly'].includes(role)) {
                    error('Invalid role. Must be one of: admin, member, readonly');
                }

                const allowedScopes = options.scopes
                    ? options.scopes.split(',').map(s => s.trim())
                    : ['development', 'staging', 'production'];

                info(`Inviting ${email} as ${role}...`);

                await apiRequest<TeamMember>('POST', `/projects/${projectId}/members`, {
                    email,
                    role,
                    allowedScopes,
                });

                // Refresh local permissions cache
                await refreshPermissions();

                success(`Invited ${colors.cyan(email)} as ${colors.green(role)}`);
                console.log(`  ${colors.dim('Scopes:')} ${allowedScopes.join(', ')}`);
                console.log();
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // team update - Update a team member's role or permissions
    // ─────────────────────────────────────────────────────────────

    team
        .command('update <email>')
        .description('Update a team member\'s role or permissions')
        .option('--role <role>', 'New role: admin, member, readonly')
        .option('--scopes <scopes>', 'Comma-separated allowed scopes')
        .option('--grant <permission>', 'Grant a custom permission (e.g., tachyon:create:public)')
        .option('--revoke <permission>', 'Revoke a custom permission')
        .option('--project <id>', 'Project ID (defaults to current project)')
        .action(async (email: string, options: {
            role?: string;
            scopes?: string;
            grant?: string;
            revoke?: string;
            project?: string;
        }) => {
            try {
                requireAuth();

                const projectId = options.project || getProjectId();
                if (!projectId) {
                    error('No project specified. Use --project <id> or run from a linked project directory.');
                }

                // First, get the member to find their userId
                const members = await apiRequest<TeamMember[]>('GET', `/projects/${projectId}/members`);
                const member = members?.find(m => m.userEmail.toLowerCase() === email.toLowerCase());

                if (!member) {
                    error(`Member not found: ${email}`);
                }

                const updates: Record<string, unknown> = {};

                if (options.role) {
                    const role = options.role.toLowerCase();
                    if (!['admin', 'member', 'readonly'].includes(role)) {
                        error('Invalid role. Must be one of: admin, member, readonly');
                    }
                    updates.role = role;
                }

                if (options.scopes) {
                    updates.allowedScopes = options.scopes.split(',').map(s => s.trim());
                }

                if (options.grant || options.revoke) {
                    const customPermissions = { ...member.customPermissions };
                    if (options.grant) {
                        customPermissions[options.grant] = true;
                    }
                    if (options.revoke) {
                        customPermissions[options.revoke] = false;
                    }
                    updates.customPermissions = customPermissions;
                }

                if (Object.keys(updates).length === 0) {
                    warn('No updates specified. Use --role, --scopes, --grant, or --revoke.');
                    return;
                }

                info(`Updating ${email}...`);

                await apiRequest<TeamMember>('PATCH', `/projects/${projectId}/members/${member.userId}`, updates);

                // Refresh local permissions cache
                await refreshPermissions();

                success(`Updated ${colors.cyan(email)}`);
                if (updates.role) {
                    console.log(`  ${colors.dim('Role:')} ${updates.role}`);
                }
                if (updates.allowedScopes) {
                    console.log(`  ${colors.dim('Scopes:')} ${(updates.allowedScopes as string[]).join(', ')}`);
                }
                if (options.grant) {
                    console.log(`  ${colors.green('+')} Granted: ${options.grant}`);
                }
                if (options.revoke) {
                    console.log(`  ${colors.dim('-')} Revoked: ${options.revoke}`);
                }
                console.log();
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // team remove - Remove a team member
    // ─────────────────────────────────────────────────────────────

    team
        .command('remove <email>')
        .description('Remove a team member from the project')
        .option('--project <id>', 'Project ID (defaults to current project)')
        .action(async (email: string, options: { project?: string }) => {
            try {
                requireAuth();

                const projectId = options.project || getProjectId();
                if (!projectId) {
                    error('No project specified. Use --project <id> or run from a linked project directory.');
                }

                // First, get the member to find their userId
                const members = await apiRequest<TeamMember[]>('GET', `/projects/${projectId}/members`);
                const member = members?.find(m => m.userEmail.toLowerCase() === email.toLowerCase());

                if (!member) {
                    error(`Member not found: ${email}`);
                }

                info(`Removing ${email}...`);

                await apiRequest<void>('DELETE', `/projects/${projectId}/members/${member.userId}`);

                // Refresh local permissions cache
                await refreshPermissions();

                success(`Removed ${colors.cyan(email)} from the project`);
                console.log();
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // team restrict - Restrict access for a member (shorthand)
    // ─────────────────────────────────────────────────────────────

    team
        .command('restrict <email>')
        .description('Restrict a member\'s access to specific scopes')
        .option('--scopes <scopes>', 'Comma-separated allowed scopes (e.g., development)')
        .option('--deny <resource>', 'Deny access to a resource (e.g., axion:production)')
        .option('--project <id>', 'Project ID (defaults to current project)')
        .action(async (email: string, options: {
            scopes?: string;
            deny?: string;
            project?: string;
        }) => {
            try {
                requireAuth();

                const projectId = options.project || getProjectId();
                if (!projectId) {
                    error('No project specified. Use --project <id> or run from a linked project directory.');
                }

                // Get the member
                const members = await apiRequest<TeamMember[]>('GET', `/projects/${projectId}/members`);
                const member = members?.find(m => m.userEmail.toLowerCase() === email.toLowerCase());

                if (!member) {
                    error(`Member not found: ${email}`);
                }

                const updates: Record<string, unknown> = {};

                if (options.scopes) {
                    updates.allowedScopes = options.scopes.split(',').map(s => s.trim());
                }

                if (options.deny) {
                    const customPermissions = { ...member.customPermissions };
                    customPermissions[options.deny] = false;
                    updates.customPermissions = customPermissions;
                }

                if (Object.keys(updates).length === 0) {
                    warn('No restrictions specified. Use --scopes or --deny.');
                    return;
                }

                info(`Restricting ${email}...`);

                await apiRequest<TeamMember>('PATCH', `/projects/${projectId}/members/${member.userId}`, updates);

                // Refresh local permissions cache
                await refreshPermissions();

                success(`Restricted ${colors.cyan(email)}`);
                if (updates.allowedScopes) {
                    console.log(`  ${colors.dim('Scopes limited to:')} ${(updates.allowedScopes as string[]).join(', ')}`);
                }
                if (options.deny) {
                    console.log(`  ${colors.dim('Denied:')} ${options.deny}`);
                }
                console.log();
            } catch (err) {
                error((err as Error).message);
            }
        });
}

/**
 * Helper to get the current project ID from local config
 */
function getProjectId(): string | null {
    const config = loadProjectConfig();
    return config?.cloudProjectId ?? null;
}
