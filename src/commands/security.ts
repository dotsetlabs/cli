/**
 * Security Commands (Gluon Module)
 * 
 * Complete CLI implementation for security monitoring.
 * Uses the @dotsetlabs/gluon SDK for all operations.
 */

import { Command } from 'commander';
import { basename, join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import {
    COLORS,
    colors,
    success,
    error,
    info,
} from '@dotsetlabs/core';

// Standard SBOM generation from package.json
// Supports CycloneDX 1.5 and SPDX 2.3 formats

export function registerSecurityCommands(program: Command) {
    // ─────────────────────────────────────────────────────────────
    // scan - Static security analysis
    // ─────────────────────────────────────────────────────────────

    program
        .command('scan')
        .description('Run static security analysis (Gluon module)')
        .option('--fix', 'Attempt to fix issues automatically')
        .option('--json', 'Output results as JSON')
        .action(async (options: { fix?: boolean; json?: boolean }) => {
            try {
                info('Scanning codebase for security issues...');

                const issues: { severity: 'error' | 'warning' | 'info'; message: string; file?: string }[] = [];

                // Check for .env files (security risk)
                try {
                    await readFile(join(process.cwd(), '.env'), 'utf8');
                    issues.push({
                        severity: 'warning',
                        message: '.env file found - consider using dotset secrets instead',
                        file: '.env',
                    });
                } catch {
                    // No .env file, that's good
                }

                // Check for .env.local
                try {
                    await readFile(join(process.cwd(), '.env.local'), 'utf8');
                    issues.push({
                        severity: 'info',
                        message: '.env.local file found - ensure it\'s in .gitignore',
                        file: '.env.local',
                    });
                } catch {
                    // No file
                }

                // Check package.json for sensitive keywords
                try {
                    const packageJson = await readFile(join(process.cwd(), 'package.json'), 'utf8');
                    const pkg = JSON.parse(packageJson);

                    // Check scripts for hardcoded secrets patterns
                    if (pkg.scripts) {
                        for (const [name, script] of Object.entries(pkg.scripts)) {
                            if (typeof script === 'string') {
                                if (script.includes('--password') || script.includes('--secret')) {
                                    issues.push({
                                        severity: 'error',
                                        message: `Script "${name}" may contain hardcoded credentials`,
                                        file: 'package.json',
                                    });
                                }
                            }
                        }
                    }
                } catch {
                    // No package.json
                }

                // Output results
                if (options.json) {
                    console.log(JSON.stringify({
                        success: issues.filter(i => i.severity === 'error').length === 0,
                        issues
                    }, null, 2));
                    return;
                }

                console.log();
                console.log(`${COLORS.bold}Security Scan Results${COLORS.reset}`);
                console.log();

                if (issues.length === 0) {
                    success('No security issues detected');
                } else {
                    const errors = issues.filter(i => i.severity === 'error');
                    const warnings = issues.filter(i => i.severity === 'warning');
                    const infos = issues.filter(i => i.severity === 'info');

                    for (const issue of errors) {
                        console.log(`  ${colors.red('✗')} ${issue.message}${issue.file ? ` (${colors.dim(issue.file)})` : ''}`);
                    }
                    for (const issue of warnings) {
                        console.log(`  ${colors.yellow('⚠')} ${issue.message}${issue.file ? ` (${colors.dim(issue.file)})` : ''}`);
                    }
                    for (const issue of infos) {
                        console.log(`  ${colors.cyan('ℹ')} ${issue.message}${issue.file ? ` (${colors.dim(issue.file)})` : ''}`);
                    }

                    console.log();
                    console.log(`  ${colors.dim(`${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info`)}`);
                }

                console.log();
                info(`For runtime protection, run: ${colors.cyan('dotset run -- <command>')}`);
            } catch (err) {
                error((err as Error).message);
            }
        });

    // ─────────────────────────────────────────────────────────────
    // sbom - Software Bill of Materials
    // ─────────────────────────────────────────────────────────────

    program
        .command('sbom')
        .description('Generate Software Bill of Materials (Gluon module)')
        .option('--format <format>', 'Output format (cyclonedx or spdx)', 'cyclonedx')
        .option('-o, --output <file>', 'Output file path')
        .option('--static', 'Generate from package.json (default)')
        .action(async (options: { format: string; output?: string; static?: boolean }) => {
            try {
                const projectName = basename(process.cwd());
                info('Generating SBOM from package.json...');

                const packageJsonPath = join(process.cwd(), 'package.json');
                let packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

                try {
                    packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
                } catch {
                    error('No package.json found in current directory');
                }

                const allDeps = {
                    ...packageJson.dependencies ?? {},
                    ...packageJson.devDependencies ?? {},
                };

                const components = Object.entries(allDeps).map(([name, version]) => ({
                    type: 'library' as const,
                    name,
                    version: String(version).replace(/^[\^~>=<]/, ''),
                    purl: `pkg:npm/${name.replace(/\//g, '%2F')}@${String(version).replace(/^[\^~>=<]/, '')}`,
                }));

                let output: string;

                if (options.format === 'spdx') {
                    output = JSON.stringify({
                        spdxVersion: 'SPDX-2.3',
                        dataLicense: 'CC0-1.0',
                        SPDXID: 'SPDXRef-DOCUMENT',
                        name: projectName,
                        documentNamespace: `https://dotsetlabs.com/sbom/${projectName}/${Date.now()}`,
                        creationInfo: {
                            created: new Date().toISOString(),
                            creators: ['Tool: dotset-1.0.0'],
                        },
                        packages: components.map((c, i) => ({
                            SPDXID: `SPDXRef-Package-${i + 1}`,
                            name: c.name,
                            versionInfo: c.version,
                            downloadLocation: `https://www.npmjs.com/package/${c.name}`,
                        })),
                    }, null, 2);
                } else {
                    output = JSON.stringify({
                        bomFormat: 'CycloneDX',
                        specVersion: '1.5',
                        version: 1,
                        metadata: {
                            timestamp: new Date().toISOString(),
                            tools: [{ vendor: 'dotsetlabs', name: 'dotset', version: '1.0.0' }],
                            component: { type: 'application', name: projectName },
                        },
                        components,
                    }, null, 2);
                }

                if (options.output) {
                    await writeFile(options.output, output, 'utf8');
                    success(`SBOM written to ${options.output}`);
                } else {
                    console.log(output);
                }

                console.log();
                info(`Found ${components.length} dependencies`);
            } catch (err) {
                error((err as Error).message);
            }
        });
}
