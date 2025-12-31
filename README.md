# Unfault VS Code Extension

**Cognitive context for your code — right where you write it.**

Unfault helps you understand the runtime impact of your code while you're writing it. Hover over a function to see where it's used, what routes depend on it, and whether safeguards like logging or retries are in place.

## Features

- **Function Impact Hovers**: Hover over any function to see its callers, the routes it affects, and what safeguards exist in the call chain
- **File Centrality**: See how important a file is in the status bar — hub files that many others depend on are highlighted
- **Dependency Awareness**: Get notified when you open a file that many other files depend on
- **Real-time Insights**: Diagnostics appear inline as you code, showing where context might be missing
- **Quick Fixes**: Apply suggested improvements with a single click
- **Privacy First**: Code is parsed locally by the CLI; only analyzed IR is sent to the Unfault API

## How It Works

When you open a supported file, Unfault builds a semantic graph of your codebase:

1. **Local Parsing**: Your code is parsed by the CLI on your machine
2. **Graph Construction**: Imports, function calls, routes, and middleware chains are captured
3. **Context Analysis**: The graph is analyzed for patterns and relationships
4. **Inline Display**: Context appears as hovers, diagnostics, and status bar info

### Function Impact Hovers

Hover over a function name to see:

```
process_payment() — High Impact Function

Used by:
  • /api/checkout (POST)
  • /api/retry-payment (POST)
  • BackgroundTask: process_failed_payments

Safeguards in call chain:
  ⚠ No structured logging
  ✓ Has retry logic (tenacity)
  ⚠ No circuit breaker

3 files depend on this function
```

### File Centrality

The status bar shows:

- **Hub file (12 importers)** — This file is central; changes have wide impact
- **Important file (7 importers)** — Moderate impact radius
- **Leaf file** — Safe to modify; few dependencies

### Dependency Notifications

When you open a file that other files depend on, you'll see a notification:

> "5 files depend on auth/middleware.py. Show All Dependents?"

Click to see and navigate to all dependent files.

## Requirements

1. **Unfault CLI**: Install the CLI:
   ```bash
   cargo install unfault
   ```

2. **Authentication**: Login to enable analysis:
   ```bash
   unfault login
   ```

## Installation

1. Install this extension from the VS Code Marketplace
2. Ensure `unfault` is in your PATH, or configure the path in settings
3. Open a supported file — the extension starts automatically

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `unfault.executablePath` | Path to the unfault CLI executable | `unfault` |
| `unfault.trace.server` | Trace LSP communication for debugging | `off` |

## Supported Languages

- Python (.py)
- Go (.go)
- Rust (.rs)
- TypeScript (.ts, .tsx)
- JavaScript (.js, .jsx)

## Commands

| Command | Description |
|---------|-------------|
| `Unfault: Restart LSP Server` | Restart the language server |
| `Unfault: Show File Dependents` | Show files that depend on the current file |
| `Unfault: Show Output` | View LSP server logs |

Access commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) or click the Unfault icon in the status bar.

## Understanding the Insights

Unfault doesn't tell you what's "wrong" — it tells you what's *there* (or not there):

| Icon | Meaning |
|------|---------|
| ✓ | Safeguard is present |
| ⚠ | Safeguard is missing — you may want to add it |
| 🔗 | Connected to routes or external systems |
| 📊 | Impact metric (callers, dependents) |

This is cognitive support, not a warning system. The goal is to help you understand your code's runtime behavior so you can make informed decisions.

## Status Bar States

| Display | Meaning |
|---------|---------|
| `$(unfault-logo) ✓` | No insights for this file |
| `$(unfault-logo) 3` | 3 insights to review |
| `$(unfault-logo) $(hub)` | Hub file with many dependents |
| `$(unfault-logo) $(loading)` | Server starting |
| `$(unfault-logo) ⚠` | Server error — click to restart |

## Troubleshooting

### "unfault: command not found"

The CLI is not in your PATH. Either:
- Add the directory containing `unfault` to your PATH
- Configure `unfault.executablePath` in VS Code settings

### No hovers or diagnostics appearing

1. Check the Output panel (View > Output) and select "Unfault LSP"
2. Make sure you're logged in: `unfault login`
3. Try restarting the server: Command Palette > "Unfault: Restart LSP Server"
4. Ensure you have network connectivity to app.unfault.dev

### Hovers are slow

The first hover may take a moment as the graph is built. Subsequent hovers use the cached graph and should be instant.

## Privacy

Your source code never leaves your machine. The CLI parses your code locally and sends only a semantic representation (imports, function signatures, call relationships) to the Unfault API. See our [privacy policy](https://unfault.dev/privacy) for details.

## License

MIT
