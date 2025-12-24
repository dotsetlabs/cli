# @dotsetlabs/cli

**The unified developer platform CLI.**  
One package for secrets, security, and tunnels.

[![npm version](https://img.shields.io/npm/v/@dotsetlabs/cli)](https://www.npmjs.com/package/@dotsetlabs/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Overview

The dotset CLI bundles three powerful developer tools:

| Tool | Command | Description |
|:-----|:--------|:------------|
| **Axion** | `axn` | Zero-knowledge secrets management |
| **Gluon** | `gln` | Runtime security telemetry |
| **Tachyon** | `tcn` | Zero-trust localhost tunnels |

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

### Initialize a Multi-Product Project

```bash
# Interactive product selection
dotset init

# Or specify products directly
dotset init --axion --gluon --tachyon
```

This creates a unified `.dotset/` directory with configurations for each enabled product.

### Unified Authentication

```bash
# Login once, authenticated across all products
dotset login

# Check status
dotset status

# Logout
dotset logout
```

### Use Individual Products

The unified CLI routes to product CLIs:

```bash
# Axion — Secrets
dotset axn set DATABASE_URL "postgres://..."
dotset axn run -- npm start

# Gluon — Security Telemetry
dotset gln run -- npm start

# Tachyon — Tunnels
dotset tcn share 3000
```

Or use the direct commands (installed with individual packages):

```bash
axn set DATABASE_URL "postgres://..."
gln run -- npm start
tcn share 3000
```

## Commands

### Unified Commands

| Command | Description |
|:--------|:------------|
| `dotset init` | Initialize a project with selected products |
| `dotset login` | Authenticate with dotset labs cloud |
| `dotset logout` | Clear credentials |
| `dotset status` | Show project and auth status |

### Product Routing

| Command | Routes To |
|:--------|:----------|
| `dotset axn <cmd>` | `axn <cmd>` (Axion CLI) |
| `dotset gln <cmd>` | `gln <cmd>` (Gluon CLI) |
| `dotset tcn <cmd>` | `tcn <cmd>` (Tachyon CLI) |
| `dotset axion <cmd>` | `axn <cmd>` (Axion CLI) |
| `dotset gluon <cmd>` | `gln <cmd>` (Gluon CLI) |
| `dotset tachyon <cmd>` | `tcn <cmd>` (Tachyon CLI) |

## Project Structure

When you run `dotset init`, it creates:

```
.dotset/
├── project.yaml        # Shared project configuration
├── axion/              # Axion secrets data (if enabled)
│   ├── manifest.enc    # Encrypted secrets
│   ├── key             # Encryption key
│   └── local.env       # Local overrides
├── gluon/              # Gluon telemetry data (if enabled)
│   ├── config.yaml     # Monitoring rules
│   └── telemetry.log   # Event log
└── tachyon/            # Tachyon tunnel data (if enabled)
    ├── config.yaml     # Tunnel config
    └── state.json      # Active tunnels

~/.dotset/
└── credentials.yaml    # Unified auth for all CLIs
```

## Why Use This Package?

| Benefit | Description |
|:--------|:------------|
| **Single Install** | One `npm install` for all three tools |
| **Unified Init** | Set up multiple products at once |
| **Shared Auth** | Login once, use everywhere |
| **Consistent Versioning** | All tools tested together |

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
- [Axion Docs](https://dotsetlabs.com/axion) — Secrets management
- [Gluon Docs](https://dotsetlabs.com/gluon) — Security telemetry
- [Tachyon Docs](https://dotsetlabs.com/tachyon) — Secure tunnels
