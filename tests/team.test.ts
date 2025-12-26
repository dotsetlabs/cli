/**
 * Integration Tests for the Team Command
 */

import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import { join } from 'node:path';

const CLI_PATH = join(__dirname, '..', 'dist', 'cli.js');

describe('dotset team', () => {
    it('should show team command help', async () => {
        const { stdout } = await execa('node', [CLI_PATH, 'team', '--help']);

        expect(stdout).toContain('Manage project team members and permissions');
        expect(stdout).toContain('list');
        expect(stdout).toContain('invite');
        expect(stdout).toContain('update');
        expect(stdout).toContain('remove');
        expect(stdout).toContain('restrict');
    });

    it('should show help for team list', async () => {
        const { stdout } = await execa('node', [CLI_PATH, 'team', 'list', '--help']);

        expect(stdout).toContain('List project team members');
        expect(stdout).toContain('--project');
    });

    it('should show help for team invite', async () => {
        const { stdout } = await execa('node', [CLI_PATH, 'team', 'invite', '--help']);

        expect(stdout).toContain('Invite a team member to the project');
        expect(stdout).toContain('--role');
        expect(stdout).toContain('--scopes');
    });

    it('should error when inviting without email', async () => {
        try {
            await execa('node', [CLI_PATH, 'team', 'invite']);
            expect.fail('Should have failed');
        } catch (err: any) {
            expect(err.stderr || err.stdout).toContain("missing required argument 'email'");
        }
    });
});
