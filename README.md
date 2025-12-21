# Unfault VS Code Extension

Production-readiness linting for your code. Detect stability, performance, and reliability issues before they reach production.

## Features

- **Real-time Analysis**: Get instant feedback as you code with diagnostics that appear in your editor
- **Quick Fixes**: Apply suggested fixes with a single click using VS Code's code actions
- **Multi-language Support**: Python, Go, Rust, TypeScript, and JavaScript
- **Privacy First**: Code is parsed locally by the CLI, only analyzed IR is sent to the Unfault API

## Requirements

1. **Unfault CLI**: Install the unfault CLI:
   ```bash
   cargo install unfault
   ```

2. **API Key**: Login to authenticate:
   ```bash
   unfault login
   ```

## Installation

1. Install this extension from the VS Code Marketplace
2. Make sure `unfault` is in your PATH, or configure the path in settings

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `unfault.executablePath` | Path to the unfault CLI executable | `unfault` |
| `unfault.trace.server` | Trace LSP communication for debugging | `off` |

## How It Works

The extension runs the Unfault CLI in LSP (Language Server Protocol) mode:

1. **Client-side parsing**: Your code is parsed locally by the CLI
2. **IR analysis**: Only analyzed IR is sent to the Unfault API
3. **Findings returned**: The API returns findings with suggested fixes
4. **Diagnostics displayed**: Findings appear as diagnostics in VS Code

This architecture ensures your source code never leaves your machine.

## Supported Languages

- Python (.py)
- Go (.go)
- Rust (.rs)
- TypeScript (.ts, .tsx)
- JavaScript (.js, .jsx)

## Commands

- **Unfault: Restart LSP Server** - Restart the language server

## Troubleshooting

### "unfault: command not found"

The CLI is not in your PATH. Either:
- Add the directory containing `unfault` to your PATH
- Configure `unfault.executablePath` in VS Code settings

### No diagnostics appearing

1. Check the Output panel (View > Output) and select "Unfault LSP"
2. Make sure you're logged in: `unfault login`
3. Try restarting the server: Command Palette > "Unfault: Restart LSP Server"

## License

MIT
