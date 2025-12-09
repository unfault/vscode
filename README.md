# Unfault VS Code Extension

Production-readiness linting for your code. Detect stability, performance, and
reliability issues before they reach production.

## Features

- **Real-time Analysis**: Get instant feedback as you code with diagnostics that
  appear in your editor
- **Quick Fixes**: Apply suggested fixes with a single click using VS Code's
  code actions
- **Multi-language Support**: Python, Go, Rust, TypeScript, and JavaScript
- **LSP-optimized Profiles**: Uses specialized profiles that avoid false
  positives in single-file analysis

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Unfault"
4. Click Install

### From VSIX

1. Download the `.vsix` file from the releases page
2. In VS Code, go to Extensions (Ctrl+Shift+X)
3. Click the "..." menu and select "Install from VSIX..."
4. Select the downloaded file

## Setup

### Option 1: Use Existing CLI Configuration

If you've already run `unfault login` via the CLI, the extension will
automatically detect your configuration from `~/.config/unfault/config.json`.

### Option 2: Enter API Key Manually

1. Open the Command Palette (Ctrl+Shift+P)
2. Run "Unfault: Setup / Configure API Key"
3. Enter your API key in the welcome panel

### Option 3: Login via CLI

1. Install the Unfault CLI: `cargo install unfault`
2. Run `unfault login` in your terminal
3. Follow the browser-based authentication flow
4. Restart VS Code or run "Unfault: Refresh Configuration"

## Configuration

Configure the extension via VS Code settings (File > Preferences > Settings):

| Setting | Default | Description |
|---------|---------|-------------|
| `unfault.enable` | `true` | Enable/disable Unfault diagnostics |
| `unfault.apiUrl` | `""` | API server URL (leave empty to use config file or default) |
| `unfault.analyzeOnSave` | `true` | Analyze files when saved |
| `unfault.analyzeOnOpen` | `true` | Analyze files when opened |
| `unfault.debounceMs` | `500` | Debounce time in milliseconds before analyzing |
| `unfault.profile` | `auto` | Profile to use for analysis |

### Profile Options

- `auto` - Automatically detect the appropriate LSP profile based on file language
- `python_lsp` - Python LSP profile (excludes cross-file rules)
- `go_lsp` - Go LSP profile (excludes cross-file rules)
- `rust_lsp` - Rust LSP profile (excludes cross-file rules)
- `typescript_lsp` - TypeScript/JavaScript LSP profile (excludes cross-file rules)

## Commands

Access these commands via the Command Palette (Ctrl+Shift+P):

| Command | Description |
|---------|-------------|
| `Unfault: Analyze Current File` | Manually trigger analysis of the current file |
| `Unfault: Analyze All Open Files` | Analyze all currently open files |
| `Unfault: Clear Diagnostics` | Clear all Unfault diagnostics |
| `Unfault: Setup / Configure API Key` | Open the setup panel to configure your API key |
| `Unfault: Refresh Configuration` | Reload configuration from the config file |

## How It Works

The extension communicates with the Unfault API server to analyze your code.
When you open or save a file:

1. The extension sends the file content to the API
2. The API runs the Unfault engine with an LSP-optimized profile
3. Diagnostics are returned and displayed in your editor
4. Quick fixes are available for issues that have patches

### LSP Profiles

The extension uses specialized LSP profiles that exclude rules which might
produce false positives in single-file analysis. For example:

- Rules that check for CORS middleware configuration (might be in a different file)
- Rules that require full project context
- Rules that depend on cross-file analysis

For full project analysis, use the CLI: `unfault review .`

## Supported Languages

| Language | File Extensions | Profile |
|----------|-----------------|---------|
| Python | `.py` | `python_lsp` |
| Go | `.go` | `go_lsp` |
| Rust | `.rs` | `rust_lsp` |
| TypeScript | `.ts`, `.tsx` | `typescript_lsp` |
| JavaScript | `.js`, `.jsx` | `typescript_lsp` |

## Troubleshooting

### "Not Configured" Error

If you see this error, the extension couldn't find your API key:

1. Run "Unfault: Setup / Configure API Key" from the Command Palette
2. Enter your API key or run `unfault login` in the terminal

### No Diagnostics Appearing

1. Check that `unfault.enable` is set to `true`
2. Verify the file language is supported
3. Check the Output panel (View > Output) and select "Unfault" for logs
4. Ensure the API server is reachable

### Authentication Errors

If you see authentication errors:

1. Your API key may have expired
2. Run "Unfault: Setup / Configure API Key" to update it
3. Or run `unfault login` in the terminal

## Development

### Building from Source

```bash
cd vscode
npm install
npm run compile
```

### Running in Development

1. Open the `vscode` folder in VS Code
2. Press F5 to launch the Extension Development Host
3. The extension will be loaded in a new VS Code window

### Packaging

```bash
npm run package
```

This creates a `.vsix` file that can be installed manually.

## Requirements

- VS Code 1.85.0 or higher
- Unfault API server running (local or cloud)
- API key (get one at [unfault.dev](https://unfault.dev))

## License

MIT

## Links

- [Unfault Website](https://unfault.dev)
- [Documentation](https://unfault.dev/docs)
- [GitHub Repository](https://github.com/unfault/vscode)
- [Issue Tracker](https://github.com/unfault/vscode/issues)