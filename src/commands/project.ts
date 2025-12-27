/**
 * Project Commands
 * 
 * Manage projects across the dotset platform.
 */

import { Command } from 'commander';
import {
    COLORS,
    colors,
    success,
    error,
    info,
    warn,
    isAuthenticated,
    getAccessToken,
    getApiUrl,
} from '@dotsetlabs/core';

const API_URL = getApiUrl();

interface Project {
    id: string;
    name: string;
    createdAt: string;
}

export function registerProjectCommands(program: Command) {
    const project = program
        .command('project')
        .alias('projects')
        .description('Manage projects');

    // ─────────────────────────────────────────────────────────────
    // project list
    // ─────────────────────────────────────────────────────────────

    project
        .command('list')
        .alias('ls')
        .description('List all projects')
        .action(async () => {
            try {
                if (!isAuthenticated()) {
                    error('Not logged in. Run: dotset login');
                }

                const token = getAccessToken();
                const response = await fetch(`${API_URL}/projects`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    error('Failed to fetch projects');
                }

                const projects = await response.json() as Project[];

                if (!Array.isArray(projects) || projects.length === 0) {
                    info('No projects found');
                    console.log(`\n  Create one at: ${colors.cyan('https://app.dotsetlabs.com')}\n`);
                    return;
                }

                console.log(`\n${COLORS.bold}Projects${COLORS.reset}\n`);

                for (const proj of projects) {
                    console.log(`  ${colors.cyan(proj.name)} ${colors.dim(`(${proj.id})`)}`);
                }

                console.log();
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // project show
    // ─────────────────────────────────────────────────────────────

    project
        .command('show <id>')
        .description('Show project details')
        .action(async (id: string) => {
            try {
                if (!isAuthenticated()) {
                    error('Not logged in. Run: dotset login');
                }

                const token = getAccessToken();
                const response = await fetch(`${API_URL}/projects/${id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        error(`Project not found: ${id}`);
                    }
                    error('Failed to fetch project');
                }

                const proj = await response.json() as Project & {
                    members?: { email: string; role: string }[];
                    stats?: { secrets?: number; tunnels?: number; };
                };

                console.log();
                console.log(`${COLORS.bold}${proj.name}${COLORS.reset}`);
                console.log(`${colors.dim('ID:')} ${proj.id}`);
                console.log();

                // Modules
                console.log(`${colors.dim('Modules (all enabled):')}`);
                console.log(`  Secrets (Axion):  ${colors.green('enabled')}`);
                console.log(`  Security (Gluon): ${colors.green('enabled')}`);

                // Stats
                if (proj.stats) {
                    console.log();
                    console.log(`${colors.dim('Stats:')}`);
                    if (proj.stats.secrets !== undefined) {
                        console.log(`  Secrets: ${proj.stats.secrets}`);
                    }
                    if (proj.stats.tunnels !== undefined) {
                        console.log(`  Active tunnels: ${proj.stats.tunnels}`);
                    }
                }

                // Members
                if (proj.members && proj.members.length > 0) {
                    console.log();
                    console.log(`${colors.dim('Team members:')}`);
                    for (const member of proj.members) {
                        console.log(`  ${member.email} ${colors.dim(`(${member.role})`)}`);
                    }
                }

                console.log();
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // project link
    // ─────────────────────────────────────────────────────────────

    project
        .command('link <id>')
        .description('Link current directory to a project')
        .action(async (id: string) => {
            try {
                if (!isAuthenticated()) {
                    error('Not logged in. Run: dotset login');
                }

                const token = getAccessToken();

                // Verify project exists
                const response = await fetch(`${API_URL}/projects/${id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        error(`Project not found: ${id}`);
                    }
                    error('Failed to fetch project');
                }

                const proj = await response.json() as Project;

                // Save link in .dotset/config.yaml
                const { writeFile, mkdir } = await import('node:fs/promises');
                const { join } = await import('node:path');

                const configDir = join(process.cwd(), '.dotset');
                await mkdir(configDir, { recursive: true });

                const configPath = join(configDir, 'project.json');
                await writeFile(configPath, JSON.stringify({
                    projectId: proj.id,
                    projectName: proj.name,
                    linkedAt: new Date().toISOString(),
                }, null, 2));

                success(`Linked to project: ${proj.name}`);
                console.log();
                console.log(`  ${colors.dim('Project ID:')} ${proj.id}`);
                console.log(`  ${colors.dim('Config saved to:')} .dotset/project.json`);
                console.log();
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // project unlink
    // ─────────────────────────────────────────────────────────────

    project
        .command('unlink')
        .description('Unlink current directory from project')
        .action(async () => {
            try {
                const { unlink, stat } = await import('node:fs/promises');
                const { join } = await import('node:path');

                const configPath = join(process.cwd(), '.dotset', 'project.json');

                try {
                    await stat(configPath);
                } catch {
                    info('Not currently linked to any project.');
                    return;
                }

                await unlink(configPath);
                success('Unlinked from project.');
            } catch (err) {
                error((err as Error).message);
            }
        });
}
