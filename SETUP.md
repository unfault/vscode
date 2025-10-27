# Fault Rules VSCode Extension - Setup Guide

Quick setup guide for the Fault Rules VSCode extension.

## Prerequisites

- Node.js 18+ and npm
- VSCode 1.75.0 or later
- TypeScript 5.3+

## Installation

### 1. Install Extension Dependencies

```bash
cd vscode-extension
npm install
```

### 2. Install Mock Server Dependencies

```bash
cd mock-server
npm install
cd ..
```

## Running the Extension

### Option A: Development Mode (with Mock Server)

**Terminal 1 - Start Mock Server:**
```bash
cd vscode-extension/mock-server
npm start
```

You should see:
```
🚀 Mock Fault Rules API server running at http://localhost:8080
📊 Health check: http://localhost:8080/health
📚 API base: http://localhost:8080/api/v1

Ready to accept requests from VSCode extension!
```

**Terminal 2 - Run Extension:**
```bash
cd vscode-extension
npm run compile  # Compile TypeScript
```

Then in VSCode:
1. Open the `vscode-extension` folder
2. Press `F5` to launch Extension Development Host
3. In the new window, open a project folder
4. Try commands:
   - Ctrl+Shift+P → "Fault Rules: Analyze Current File"
   - Ctrl+Shift+P → "Fault Rules: Analyze Entire Project"

### Option B: Production Mode (with Real Backend)

1. Update settings in the Extension Development Host:
   ```json
   {
     "faultRules.apiEndpoint": "https://your-api.example.com/api/v1"
   }
   ```

2. Ensure your backend implements the API spec in `docs/api/vscode-extension-api.yaml`

## Development Workflow

### Watch Mode (Auto-compile on changes)

```bash
cd vscode-extension
npm run watch
```

Leave this running in a terminal. Changes to TypeScript files will auto-compile.

### Debug Extension

1. Open `vscode-extension` folder in VSCode
2. Press `F5` (or Run → Start Debugging)
3. Extension Development Host opens
4. Set breakpoints in `.ts` files
5. Debug Console shows logs

### View Output

In Extension Development Host window:
- **View → Output** → Select "Fault Rules" channel
- See all extension logs and API responses

### Testing with Mock Data

The mock server provides sample findings:

**Mock Findings:**
- Missing timeout on HTTP client (High severity)
- No structured logging (Medium severity)  
- Missing graceful shutdown (High severity)

**Mock Files:**
- `src/api/client.py` - Has timeout issue
- `src/main.py` - Has logging and shutdown issues

Open any Python file to see diagnostics.

## Building for Distribution

### Package Extension

```bash
cd vscode-extension
npm run package
```

This creates `fault-rules-0.1.0.vsix` file.

### Install VSIX Locally

1. In VSCode: Extensions view (Ctrl+Shift+X)
2. Click "..." menu → "Install from VSIX..."
3. Select the `.vsix` file

## Configuration

### Extension Settings

Settings → search "Fault Rules":

```json
{
  "faultRules.apiEndpoint": "http://localhost:8080/api/v1",
  "faultRules.autoAnalyze": true,
  "faultRules.severityThreshold": "info",
  "faultRules.maxFileSize": 1048576,
  "faultRules.excludePatterns": [
    "node_modules/**",
    "*.test.js",
    ".git/**"
  ]
}
```

### Mock Server Configuration

Edit `mock-server/server.ts` to customize:
- Port (default: 8080)
- Mock findings
- Mock bundles
- Mock fixes

## Verification

### 1. Check Mock Server

```bash
curl http://localhost:8080/health
# Should return: {"status":"ok"}
```

### 2. Test API Endpoints

```bash
# List rules
curl http://localhost:8080/api/v1/rules

# Analyze files
curl -X POST http://localhost:8080/api/v1/analyze/files \
  -H "Content-Type: application/json" \
  -d '{"files":["src/main.py"]}'
```

### 3. Verify Extension

1. Open any Python file in Extension Development Host
2. Save the file (Ctrl+S)
3. Check Problems panel (Ctrl+Shift+M)
4. Should see mock findings if auto-analyze enabled

## Troubleshooting

### "Cannot find module 'vscode'"

This is expected before running `npm install`. The TypeScript errors will resolve after:
```bash
cd vscode-extension
npm install
```

### Extension not activating

1. Check you're using VSCode 1.75.0+
2. Open a folder (not just files)
3. Open a supported file type (.py, .js, .ts, .go, .rs)
4. Check Output → "Fault Rules" for errors

### Mock server connection refused

1. Verify server is running: `curl http://localhost:8080/health`
2. Check firewall settings
3. Try different port in `mock-server/server.ts`

### No diagnostics showing

1. Verify auto-analyze is enabled in settings
2. Try manual analysis: Ctrl+Shift+P → "Fault Rules: Analyze Current File"
3. Check Output panel for API errors
4. Verify severity threshold in settings

### TypeScript compilation errors

```bash
cd vscode-extension
rm -rf node_modules out
npm install
npm run compile
```

## File Structure

```
vscode-extension/
├── src/
│   ├── extension.ts         # Main entry point
│   ├── apiClient.ts         # API client
│   ├── diagnostics.ts       # Diagnostics provider
│   ├── codeActions.ts       # Quick fixes
│   └── types.ts             # Type definitions
├── mock-server/
│   ├── server.ts            # Mock API
│   └── package.json         # Server deps
├── out/                     # Compiled JS (generated)
├── node_modules/            # Dependencies (generated)
├── package.json             # Extension manifest
├── tsconfig.json            # TypeScript config
├── README.md                # User documentation
└── SETUP.md                 # This file
```

## Next Steps

After setup:

1. **Explore the extension**: Try all commands and features
2. **Customize mock data**: Edit `mock-server/server.ts` for your test cases
3. **Add new features**: Extend `src/extension.ts` and related files
4. **Connect real backend**: Point to actual API when ready
5. **Package for distribution**: Run `npm run package` to create VSIX

## Resources

- **API Spec**: `docs/api/vscode-extension-api.yaml`
- **VSCode Extension API**: https://code.visualstudio.com/api
- **Extension Development**: https://code.visualstudio.com/api/get-started/your-first-extension

## Support

Questions? Issues?
- Check README.md for full documentation
- Review mock-server logs for API debugging
- Use VSCode Debug Console for extension debugging