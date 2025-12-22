# @dotsetlabs/cli

**The unified developer platform CLI.**  
One package for secrets, telemetry, and tunnels.

[![npm version](https://img.shields.io/npm/v/@dotsetlabs/cli)](https://www.npmjs.com/package/@dotsetlabs/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Overview

The dotset CLI bundles three powerful developer tools:

| Tool | Command | Description |
|:-----|:--------|:------------|
| **Axion** | `dotset axion` / `axn` | Zero-knowledge secrets management |
| **Gluon** | `dotset gluon` / `gln` | Runtime security telemetry |
| **Tachyon** | `dotset tachyon` / `tcn` | Zero-trust localhost tunnels |

## Installation

```bash
npm install -g @dotsetlabs/cli
```

Or use individual packages:
```bash
npm install -g @dotsetlabs/axion   # Just secrets
npm install -g @dotsetlabs/gluon   # Just telemetry
npm install -g @dotsetlabs/tachyon # Just tunnels
```

## Quick Start

### Axion — Secrets Management

```bash
# Sign in
dotset axion login

# Initialize a project
dotset axion init --cloud --name "my-app"

# Add secrets
dotset axion set DATABASE_URL "postgres://..."
dotset axion set API_KEY "sk-12345"

# Run with secrets injected
dotset axion run -- npm start
```

### Gluon — Runtime Telemetry

```bash
# Initialize monitoring
dotset gluon init

# Run with telemetry
dotset gluon run -- npm start

# View captured telemetry
dotset gluon logs
dotset gluon analyze
```

### Tachyon — Secure Tunnels

```bash
# Sign in
dotset tachyon login

# Share a local port
dotset tachyon share 3000

# With custom subdomain
dotset tachyon share 3000 --subdomain my-api
```

## Commands

### Using the Unified CLI

```bash
dotset <product> <command> [options]

# Examples
dotset axion init
dotset gluon run -- npm start
dotset tachyon share 8080
```

### Direct Commands (Aliases)

Each product has a short alias for direct use:

```bash
axn init                    # Same as: dotset axion init
gln run -- npm start        # Same as: dotset gluon run -- npm start
tcn share 3000              # Same as: dotset tachyon share 3000
```

### Help

```bash
dotset --help               # Show unified CLI help
dotset axion --help         # Axion-specific help
dotset gluon --help         # Gluon-specific help
dotset tachyon --help       # Tachyon-specific help
```

## Why Use This Package?

| Benefit | Description |
|:--------|:------------|
| **Single Install** | One `npm install` for all three tools |
| **Consistent Versioning** | All tools are tested together |
| **Unified Entry Point** | `dotset` as the single command |
| **Still Flexible** | Direct aliases (`axn`, `gln`, `tcn`) still work |

## Individual Packages

For minimal installs, use the individual packages:

- **[@dotsetlabs/axion](https://www.npmjs.com/package/@dotsetlabs/axion)** — Secrets management
- **[@dotsetlabs/gluon](https://www.npmjs.com/package/@dotsetlabs/gluon)** — Runtime telemetry
- **[@dotsetlabs/tachyon](https://www.npmjs.com/package/@dotsetlabs/tachyon)** — Secure tunnels

## Requirements

- Node.js 20.0.0 or higher

## License

MIT

## Links

- [dotset labs](https://dotsetlabs.com) — Company website
- [Axion Docs](https://dotsetlabs.com/axion/docs) — Secrets management documentation
- [Gluon Docs](https://dotsetlabs.com/gluon/docs) — Telemetry documentation
- [Tachyon Docs](https://dotsetlabs.com/tachyon/docs) — Tunnel documentation
