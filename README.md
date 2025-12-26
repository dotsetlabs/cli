# @dotsetlabs/cli

**The dotset Developer Platform.**  
One CLI for secrets, security, and tunnels. The secure runtime for modern development.

[![npm version](https://img.shields.io/npm/v/@dotsetlabs/cli)](https://www.npmjs.com/package/@dotsetlabs/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Why dotset?

Stop juggling multiple security tools. `dotset` combines encrypted secrets management, runtime leak prevention, and zero-trust tunneling into a single developer experience.

```bash
npm install -g @dotsetlabs/cli
```

## The Unified Runtime

With one command, inject secrets and monitor for leaks:

```bash
# Initialize your project
dotset init

# Run with full security stack
dotset run -- npm start
```

This single command:
- 🔐 **Injects secrets** from your encrypted vault (Axion)
- 🛡️ **Monitors runtime** for secret leaks in logs (Gluon)
- 📊 **Tracks network** calls to detect anomalies (Gluon)

## Core Commands

| Command | Description |
|:--------|:------------|
| `dotset init` | Initialize a new project |
| `dotset run` | Run with secrets + monitoring |
| `dotset login` | Authenticate with cloud |
| `dotset logout` | Clear stored credentials |
| `dotset status` | Show project status |

## Module Commands

### Secrets (Axion)

```bash
dotset secrets init              # Initialize secrets vault
dotset secrets set API_KEY "sk-..."
dotset secrets get API_KEY
dotset secrets list
dotset secrets delete API_KEY
dotset secrets export
dotset secrets import .env
dotset secrets rotate            # Rotate encryption key
```

### Security (Gluon)

```bash
dotset scan                      # Static security analysis
dotset sbom --static             # Generate SBOM
```

### Tunnels (Tachyon)

```bash
dotset share 3000                # Share localhost
dotset share 3000 --inspect      # With request inspector
dotset share 3000 --public       # Allow unauthenticated access
dotset tunnels                   # List active tunnels
```

### CI (Hadron)

```bash
dotset ci --list                 # List available workflows
dotset ci build test             # Run specific job
dotset ci --sync                 # Sync results to cloud
```

### Cloud Sync

```bash
dotset sync push                 # Push secrets to cloud
dotset sync pull                 # Pull secrets from cloud
dotset sync status               # Check sync status
dotset drift                     # Detect local/cloud differences
```

### Projects

```bash
dotset project list              # List cloud projects
dotset project show <id>         # Show project details
dotset project link <id>         # Link to cloud project
dotset project unlink            # Unlink from cloud
```

### Webhooks

```bash
dotset webhooks list             # List captured webhooks
dotset webhooks show <id>        # Show webhook details
dotset webhooks replay <id>      # Replay a webhook
```

## Documentation

Full documentation: [docs.dotsetlabs.com](https://docs.dotsetlabs.com)

## License

MIT
