# Unfault VSCode Extension

Production readiness analysis and automated fixes directly in your IDE.

## Features

- 🔍 **Real-time Analysis**: Get instant feedback as you code with file-level and project-wide scans
- 🎯 **Smart Diagnostics**: Issues highlighted with severity levels (Critical, High, Medium, Low, Info)
- 🔧 **Quick Fixes**: One-click automated fixes for common production issues
- 📊 **Readiness Score**: Overall production readiness score with vital-specific breakdowns
- 📚 **Rule Explanations**: Detailed explanations about why issues matter and how to fix them
- 🎨 **Code Actions**: Integrated quick-fix suggestions in the editor
- ⚡ **Performance**: Optimized for sub-100ms response times on file analysis

## Installation

### From VSIX (Recommended)

1. Download the latest `.vsix` file from releases
2. In VSCode, go to Extensions view (Ctrl+Shift+X)
3. Click the "..." menu → "Install from VSIX..."
4. Select the downloaded file

### From Source

```bash
cd vscode-extension
npm install
npm run compile
```

Then press F5 in VSCode to launch the extension in a new Extension Development Host window.

## Quick Start

### 1. Start the Mock API Server (for testing)

```bash
cd mock-server
npm install
npm start
```

The mock server will run at `http://localhost:8080`

### 2. Configure the Extension

Open VSCode settings (Ctrl+,) and search for "Unfault":

- **API Endpoint**: `http://localhost:8080/api/v1` (default for mock server)
- **Auto Analyze**: Enable/disable automatic analysis on file save
- **Severity Threshold**: Minimum severity to display (info, low, medium, high, critical)

### 3. Analyze Your Code

**Analyze Current File:**
- Command Palette (Ctrl+Shift+P) → "Unfault: Analyze Current File"
- Or save a file with auto-analyze enabled

**Analyze Entire Project:**
- Command Palette → "Unfault: Analyze Entire Project"
- Or click the status bar item "🛡️ Unfault"

## Usage

### Viewing Issues

Issues appear as:
- **Inline diagnostics** with squiggly underlines
- **Problems panel** (View → Problems or Ctrl+Shift+M)
- **Hover tooltips** with detailed explanations

Severity indicators:
- 🔴 **Critical/High**: Red error markers
- 🟡 **Medium**: Yellow warning markers  
- 🔵 **Low/Info**: Blue information markers

### Applying Fixes

1. Place cursor on an issue
2. Click the lightbulb 💡 icon (or press Ctrl+.)
3. Select "Fix: [issue name]" to apply the automated fix
4. Or select "Explain: [issue name]" for more details

### Understanding Your Score

The production readiness score (0-100%) reflects how well your code follows production best practices across key vitals:

- **Observability**: Logging, metrics, tracing
- **Safety**: Error handling, graceful shutdown
- **Availability**: Timeouts, circuit breakers, health checks
- **Capacity**: Resource limits, autoscaling
- **Performance**: Caching, connection pooling
- **And more...**

Click the status bar score to see a detailed breakdown.

## Configuration

### Extension Settings

```json
{
  // API endpoint for Unfault backend
  "unfault.apiEndpoint": "http://localhost:8080/api/v1",
  
  // Automatically analyze files on save
  "unfault.autoAnalyze": true,
  
  // Minimum severity level to display
  "unfault.severityThreshold": "info",
  
  // Maximum file size to analyze (bytes)
  "unfault.maxFileSize": 1048576,
  
  // Glob patterns to exclude from analysis
  "unfault.excludePatterns": [
    "node_modules/**",
    "*.test.js",
    "*.test.py",
    ".git/**",
    "dist/**",
    "build/**"
  ],
  
  // Show inline annotations with fixes
  "unfault.enableInlineAnnotations": true
}
```

### Keyboard Shortcuts

| Command | Shortcut |
|---------|----------|
| Analyze Current File | (none - use Command Palette) |
| Analyze Project | (none - use Command Palette) |
| Show Readiness Score | Click status bar item |
| Apply Fix | Ctrl+. (when on diagnostic) |

You can customize shortcuts in Keyboard Shortcuts editor (Ctrl+K Ctrl+S).

## Development

### Project Structure

```
vscode-extension/
├── src/
│   ├── extension.ts         # Main extension entry point
│   ├── apiClient.ts         # API client for backend
│   ├── diagnostics.ts       # Diagnostics provider
│   ├── codeActions.ts       # Code actions & fix application
│   └── types.ts             # TypeScript type definitions
├── mock-server/
│   ├── server.ts            # Mock API server
│   └── package.json         # Mock server dependencies
├── package.json             # Extension manifest
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

### Building

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes (during development)
npm run watch

# Package extension
npm run package
```

### Testing with Mock Server

The mock server simulates the Unfault API for development and testing:

```bash
cd mock-server
npm install
npm start
```

Mock endpoints:
- `GET /health` - Health check
- `POST /api/v1/analyze/files` - Analyze specific files
- `POST /api/v1/analyze/project` - Analyze entire project
- `GET /api/v1/fixes` - Get proposed fixes
- `POST /api/v1/fixes/preview` - Preview patch before applying
- `GET /api/v1/explain/:id` - Get rule explanation
- `GET /api/v1/bundles` - List fix bundles
- `GET /api/v1/rules` - List available rules

### Running in Debug Mode

1. Open the extension folder in VSCode
2. Press F5 to launch Extension Development Host
3. Open a project folder in the new window
4. Test extension features

Logs appear in:
- Debug Console (in the original VSCode window)
- Output panel → "Unfault" channel (in Extension Host)

## API Integration

### Connecting to Real Backend

To use with an actual Unfault backend:

1. Update the API endpoint in settings:
   ```json
   {
     "unfault.apiEndpoint": "https://your-api.example.com/api/v1"
   }
   ```

2. Ensure the backend implements the API specification in `docs/api/vscode-extension-api.yaml`

### API Requirements

The backend must provide:
- File-by-file analysis endpoint (`POST /analyze/files`)
- Project-wide analysis endpoint (`POST /analyze/project`)
- Proposed fixes endpoint (`GET /fixes`)
- Explanation endpoint (`GET /explain/:id`)
- Metadata endpoints (`GET /bundles`, `GET /rules`)

See `docs/api/vscode-extension-api.yaml` for complete specification.

## Troubleshooting

### "Cannot connect to Unfault API"

**Cause**: Extension cannot reach the configured API endpoint

**Solutions**:
1. Verify the API server is running
2. Check the API endpoint in settings
3. Ensure no firewall is blocking the connection
4. Try the mock server: `cd mock-server && npm start`

### "No issues found" on analysis

**Possible reasons**:
1. Code actually has no detectable issues (great!)
2. File type not supported (check supported languages)
3. File excluded by patterns in settings
4. API backend not properly analyzing the code

### TypeScript errors in source

These are expected during development as node_modules won't be present initially. Run `npm install` to resolve.

### Extension not activating

1. Check Output panel → "Unfault" for error messages
2. Verify you're working with supported file types
3. Try reloading the window (Ctrl+Shift+P → "Reload Window")

## Supported Languages

- Python (.py)
- JavaScript (.js)
- TypeScript (.ts)
- Go (.go)
- Rust (.rs)

Additional languages can be added by configuring the backend analysis engine.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- 📧 Email: support@fault.dev
- 💬 Discord: [Join our community](https://discord.gg/fault-dev)
- 🐛 Issues: [GitHub Issues](https://github.com/fault-dev/fault-rules/issues)
- 📖 Docs: [Documentation](https://docs.fault.dev)

## Changelog

### v0.1.0 (Initial Release)

- ✨ File-level and project-wide analysis
- 🔧 Automated fix application
- 📊 Production readiness scoring
- 💡 Quick fix code actions
- 📚 Rule explanations
- ⚙️ Configurable severity thresholds
- 🎨 Inline diagnostics with badges
- 🧪 Mock API server for testing

---

Made with ❤️ by the Unfault team