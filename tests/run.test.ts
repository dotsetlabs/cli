/**
 * Integration Tests for the Unified Run Command
 * 
 * Tests the combined Axion + Gluon functionality:
 * - Secret injection
 * - Security monitoring
 * - Graceful fallbacks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execa, type ExecaError } from 'execa';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const CLI_PATH = join(__dirname, '..', 'dist', 'cli.js');

// Test secret with 24+ chars after prefix (Stripe pattern requires 24+ chars)
const TEST_STRIPE_SECRET = 'sk_live_dummy_secret_for_integration_testing_only';

/**
 * Creates a temporary test directory
 */
async function createTempDir(): Promise<string> {
    const dir = join(tmpdir(), `dotset-test-${randomBytes(4).toString('hex')}`);
    await mkdir(dir, { recursive: true });
    return dir;
}

/**
 * Initializes Axion with a test secret
 */
async function initAxion(dir: string, secrets: Record<string, string> = {}): Promise<void> {
    // Run axn init
    await execa('node', [join(__dirname, '../../axion/dist/cli.js'), 'init'], {
        cwd: dir,
        env: { ...process.env },
    });

    // Set secrets
    for (const [key, value] of Object.entries(secrets)) {
        await execa('node', [join(__dirname, '../../axion/dist/cli.js'), 'set', key, value], {
            cwd: dir,
            env: { ...process.env },
        });
    }
}

describe('dotset run', () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await createTempDir();
    });

    afterEach(async () => {
        try {
            await rm(testDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('Help and Version', () => {
        it('should show run command help', async () => {
            const { stdout } = await execa('node', [CLI_PATH, 'run', '--help']);

            expect(stdout).toContain('Run a command with secrets injected');
            expect(stdout).toContain('--scope');
            expect(stdout).toContain('--no-secrets');
            expect(stdout).toContain('--no-monitor');
        });
    });

    describe('Without Axion or Gluon Initialized', () => {
        it('should run command successfully without initialization', async () => {
            const { stdout, exitCode } = await execa('node', [
                CLI_PATH,
                'run',
                '--',
                'node',
                '-e',
                'console.log("hello")',
            ], { cwd: testDir });

            expect(exitCode).toBe(0);
            expect(stdout).toContain('hello');
        });

        it('should run with quiet mode', async () => {
            const { stdout, exitCode } = await execa('node', [
                CLI_PATH,
                'run',
                '--quiet',
                '--',
                'node',
                '-e',
                'console.log("output")',
            ], { cwd: testDir });

            expect(exitCode).toBe(0);
            expect(stdout).toContain('output');
            // Should not contain dotset status messages
            expect(stdout).not.toContain('secrets');
            expect(stdout).not.toContain('Gluon');
        });
    });

    describe('With Axion Initialized', () => {
        it('should inject secrets into environment', async () => {
            // Initialize Axion with a secret
            await initAxion(testDir, {
                TEST_SECRET: 'secret-value-123',
            });

            // Run command that accesses the secret
            const { stdout, exitCode } = await execa('node', [
                CLI_PATH,
                'run',
                '--',
                'node',
                '-e',
                'console.log("SECRET:" + process.env.TEST_SECRET)',
            ], { cwd: testDir });

            expect(exitCode).toBe(0);
            expect(stdout).toContain('SECRET:secret-value-123');
        });

        it('should inject multiple secrets', async () => {
            await initAxion(testDir, {
                DATABASE_URL: 'postgres://localhost/test',
                API_KEY: 'key-abc-123',
            });

            const { stdout, exitCode } = await execa('node', [
                CLI_PATH,
                'run',
                '--',
                'node',
                '-e',
                'console.log(process.env.DATABASE_URL + "|" + process.env.API_KEY)',
            ], { cwd: testDir });

            expect(exitCode).toBe(0);
            expect(stdout).toContain('postgres://localhost/test|key-abc-123');
        });

        it('should skip secrets with --no-secrets', async () => {
            await initAxion(testDir, {
                TEST_SECRET: 'should-not-appear',
            });

            const { stdout, exitCode } = await execa('node', [
                CLI_PATH,
                'run',
                '--no-secrets',
                '--',
                'node',
                '-e',
                'console.log("VALUE:" + (process.env.TEST_SECRET || "undefined"))',
            ], { cwd: testDir });

            expect(exitCode).toBe(0);
            expect(stdout).toContain('VALUE:undefined');
        });
    });

    describe('Exit Codes', () => {
        it('should propagate child process exit code', async () => {
            try {
                await execa('node', [
                    CLI_PATH,
                    'run',
                    '--',
                    'node',
                    '-e',
                    'process.exit(42)',
                ], { cwd: testDir });
            } catch (err) {
                const error = err as ExecaError;
                expect(error.exitCode).toBe(42);
            }
        });

        it('should return 0 on successful command', async () => {
            const { exitCode } = await execa('node', [
                CLI_PATH,
                'run',
                '--',
                'node',
                '-e',
                'console.log("success")',
            ], { cwd: testDir });

            expect(exitCode).toBe(0);
        });
    });

    describe('Error Handling', () => {
        it('should error on invalid command', async () => {
            try {
                await execa('node', [
                    CLI_PATH,
                    'run',
                    '--',
                    'nonexistent-command-xyz-12345',
                ], { cwd: testDir });
                expect.fail('Should have thrown');
            } catch (err) {
                const error = err as ExecaError;
                expect(error.stderr || error.message).toContain('not found');
            }
        });

        it('should error when no command specified', async () => {
            try {
                await execa('node', [CLI_PATH, 'run'], { cwd: testDir });
                expect.fail('Should have thrown');
            } catch (err) {
                const error = err as ExecaError;
                // Commander outputs "missing required argument 'command'"
                expect(error.stderr || error.message).toContain("missing required argument 'command'");
            }
        });
    });

    describe('Verbose Mode', () => {
        it('should show detailed output with --verbose', async () => {
            await initAxion(testDir, {
                VERBOSE_TEST: 'value',
            });

            const { stdout, stderr, exitCode } = await execa('node', [
                CLI_PATH,
                'run',
                '--verbose',
                '--',
                'node',
                '-e',
                'console.log("done")',
            ], { cwd: testDir });

            expect(exitCode).toBe(0);
            // Verbose mode should show which secrets are loaded
            const output = stdout + stderr;
            expect(output).toContain('VERBOSE_TEST');
        });
    });

    describe('Secret Protection Modes', () => {
        it('should detect secrets in output (default mode)', async () => {
            const { stdout, stderr, exitCode } = await execa('node', [
                CLI_PATH,
                'run',
                '--',
                'node',
                '-e',
                `console.log("${TEST_STRIPE_SECRET}")`,
            ], { cwd: testDir });

            expect(exitCode).toBe(0);
            // Secret should still appear in output (detect mode)
            expect(stdout).toContain(TEST_STRIPE_SECRET);
        });

        it('should redact secrets in redact mode', async () => {
            const { stdout, stderr, exitCode } = await execa('node', [
                CLI_PATH,
                'run',
                '--mode',
                'redact',
                '--',
                'node',
                '-e',
                `console.log("Secret: ${TEST_STRIPE_SECRET} end")`,
            ], { cwd: testDir });

            expect(exitCode).toBe(0);
            // Secret should be redacted
            expect(stdout).toContain('[REDACTED]');
            expect(stdout).not.toContain('sk_live_123456');
        });

        it('should use custom redact text', async () => {
            const { stdout, exitCode } = await execa('node', [
                CLI_PATH,
                'run',
                '--mode',
                'redact',
                '--redact-text',
                '[CENSORED]',
                '--',
                'node',
                '-e',
                `console.log("Key: ${TEST_STRIPE_SECRET}")`,
            ], { cwd: testDir });

            expect(exitCode).toBe(0);
            expect(stdout).toContain('[CENSORED]');
        });

        it('should block output in block mode', async () => {
            const { stdout, exitCode } = await execa('node', [
                CLI_PATH,
                'run',
                '--mode',
                'block',
                '--',
                'node',
                '-e',
                `console.log("${TEST_STRIPE_SECRET}")`,
            ], { cwd: testDir });

            expect(exitCode).toBe(0);
            // Output should be blocked entirely
            expect(stdout).not.toContain('sk_live_');
        });

        it('should pass through non-secret output in block mode', async () => {
            const { stdout, exitCode } = await execa('node', [
                CLI_PATH,
                'run',
                '--mode',
                'block',
                '--',
                'node',
                '-e',
                'console.log("Hello world")',
            ], { cwd: testDir });

            expect(exitCode).toBe(0);
            expect(stdout).toContain('Hello world');
        });
    });
});
