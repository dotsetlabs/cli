/**
 * Integration Tests for the Audit Command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execa } from 'execa';
import { join } from 'node:path';

const CLI_PATH = join(__dirname, '..', 'dist', 'cli.js');

describe('dotset audit', () => {
    it('should show audit command help', async () => {
        const { stdout } = await execa('node', [CLI_PATH, 'audit', '--help']);

        expect(stdout).toContain('View and verify project audit logs');
        expect(stdout).toContain('list');
        expect(stdout).toContain('verify');
        expect(stdout).toContain('export');
    });

    it('should show help for audit list', async () => {
        const { stdout } = await execa('node', [CLI_PATH, 'audit', 'list', '--help']);

        expect(stdout).toContain('List recent audit logs');
        expect(stdout).toContain('--limit');
        expect(stdout).toContain('--source');
        expect(stdout).toContain('--project');
    });

    it('should show help for audit verify', async () => {
        const { stdout } = await execa('node', [CLI_PATH, 'audit', 'verify', '--help']);

        expect(stdout).toContain('Verify the cryptographic integrity of the audit log chain');
    });

    it('should show help for audit export', async () => {
        const { stdout } = await execa('node', [CLI_PATH, 'audit', 'export', '--help']);

        expect(stdout).toContain('Export audit logs for compliance');
        expect(stdout).toContain('--format');
    });

    it('should error when not logged in and no project specified', async () => {
        try {
            await execa('node', [CLI_PATH, 'audit', 'list']);
            expect.fail('Should have failed');
        } catch (err: any) {
            // Should either fail with "Not logged in" or "No project specified"
            expect(err.stderr || err.stdout).toMatch(/Not logged in|No project specified/);
        }
    });
});
