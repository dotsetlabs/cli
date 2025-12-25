# @dotsetlabs/cli

**The dotset labs Unified CLI.**  
Run your applications with secrets injection and runtime security combined.

[![npm version](https://img.shields.io/npm/v/@dotsetlabs/cli)](https://www.npmjs.com/package/@dotsetlabs/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Documentation

Full documentation is available at [docs.dotsetlabs.com](https://docs.dotsetlabs.com/cli/unified-cli).

## Features

- **Unified Run** — Combines Axion secret injection with Gluon runtime monitoring.
- **Product Shortcuts** — Direct access to `axn`, `gln`, and `tcn` commands.
- **Monorepo Support** — Automatic service detection and management.

## Quick Start

```bash
npm install -g @dotsetlabs/cli

# Run with secrets and monitoring
dotset run -- npm start

# Access product commands
dotset axn list
dotset gln analyze
dotset tcn share 3000
```

## License

MIT
