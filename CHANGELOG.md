# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-22

### Added
- Initial release of the unified dotset CLI
- Wrapper for `@dotsetlabs/axion` (secrets management)
- Wrapper for `@dotsetlabs/gluon` (runtime telemetry)
- Wrapper for `@dotsetlabs/tachyon` (secure tunnels)
- Single `dotset` command with subcommands: `axion`, `gluon`, `tachyon`
- Short aliases: `axn`, `gln`, `tcn`
- Colored help output
- Version information via `--version` flag
