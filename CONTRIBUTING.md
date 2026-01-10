# Contributing to Unfault VS Code Extension

Thank you for your interest in contributing to the Unfault VS Code extension! This extension brings cognitive context to your editor via LSP.

## What This Extension Does

- **Function Impact Hovers**: Show callers, routes, and safeguards when hovering over functions
- **File Centrality**: Display how important a file is based on dependencies
- **Real-time Diagnostics**: Surface findings inline as you code
- **Quick Fixes**: Apply suggested improvements with one click

The extension communicates with the Unfault CLI via LSP. The CLI does the heavy lifting (parsing, graph building, API calls); the extension displays results.

## Getting Started

### Prerequisites

- **Node.js 18+**: For building and running
- **VS Code**: For testing the extension
- **Unfault CLI**: Install via `cargo install unfault`

### Setup

```bash
git clone https://github.com/unfault/vscode.git
cd vscode
npm install
```

### Building

```bash
npm run compile    # Compile TypeScript
npm run watch      # Watch mode for development
```

### Running in Development

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. Open a supported file in the new window
4. The extension activates and connects to the CLI

## Project Structure

```
vscode/
├── src/
│   ├── extension.ts        # Entry point, activation
│   ├── lsp/                # Language Server Protocol handling
│   │   ├── client.ts       # LSP client configuration
│   │   └── handlers.ts     # Custom notification handlers
│   ├── providers/          # VS Code providers
│   │   ├── hover.ts        # Hover information
│   │   ├── codelens.ts     # Code lens (impact indicators)
│   │   └── diagnostics.ts  # Diagnostic display
│   ├── views/              # Webview panels
│   │   └── context.ts      # Context view panel
│   └── utils/              # Utilities
│       └── config.ts       # Settings management
├── package.json            # Extension manifest
├── tsconfig.json           # TypeScript config
└── images/                 # Extension assets
```

## Development

### Key Files

- **`extension.ts`**: Extension lifecycle, LSP client startup
- **`package.json`**: Commands, settings, activation events
- **`lsp/client.ts`**: LSP client configuration and connection

### LSP Protocol

The extension uses standard LSP plus custom notifications:

```typescript
// Custom notifications from the CLI
interface FileCentralityNotification {
  uri: string;
  centrality: 'hub' | 'important' | 'normal' | 'leaf';
  importerCount: number;
}

interface FileDependenciesNotification {
  uri: string;
  dependencies: string[];
}
```

### Adding a Feature

1. **Define the notification** in the LSP handlers
2. **Create a provider** if it needs UI (hover, code lens, etc.)
3. **Update `package.json`** for commands/settings
4. **Test** in the Extension Development Host

### Example: Adding a New Command

1. Add to `package.json`:
   ```json
   {
     "contributes": {
       "commands": [{
         "command": "unfault.myCommand",
         "title": "Unfault: My Command"
       }]
     }
   }
   ```

2. Register in `extension.ts`:
   ```typescript
   context.subscriptions.push(
     vscode.commands.registerCommand('unfault.myCommand', async () => {
       // Implementation
     })
   );
   ```

## Testing

### Manual Testing

1. Launch Extension Development Host (`F5`)
2. Open a project with supported files
3. Verify features work as expected

### Automated Testing

```bash
npm test
```

Tests live in `src/test/`. Add tests for new functionality.

## Code Guidelines

### TypeScript Style

- Use `async/await` over callbacks
- Type everything explicitly
- Use `const` by default, `let` when mutation is needed

### VS Code API Patterns

```typescript
// Use disposables properly
const disposable = vscode.workspace.onDidChangeTextDocument(handler);
context.subscriptions.push(disposable);

// Handle cancellation
async function doWork(token: vscode.CancellationToken) {
  if (token.isCancellationRequested) return;
  // ...
}

// Show progress for long operations
await vscode.window.withProgress({
  location: vscode.ProgressLocation.Notification,
  title: "Analyzing...",
}, async (progress) => {
  // ...
});
```

### Error Handling

```typescript
try {
  const result = await client.sendRequest('textDocument/hover', params);
} catch (error) {
  // Log but don't crash
  console.error('Hover request failed:', error);
  return null;
}
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(hover): show safeguards in function hover
fix(lsp): handle connection timeout gracefully
docs(readme): update installation steps
```

## Pull Request Process

1. **Fork and branch**: Create a feature branch from `main`
2. **Implement**: Follow code guidelines
3. **Test**: Manual testing + any automated tests
4. **Submit PR**: Clear description with screenshots if UI changes

### PR Checklist

- [ ] Compiles without errors (`npm run compile`)
- [ ] No linting errors (`npm run lint`)
- [ ] Tested in Extension Development Host
- [ ] `package.json` updated if commands/settings changed
- [ ] Commit messages follow conventions

## Debugging

### View Extension Logs

1. Open Output panel (`View > Output`)
2. Select "Unfault" from dropdown

### Debug LSP Communication

Set `unfault.trace.server` to `verbose` in settings, then check the "Unfault Language Server" output channel.

### Common Issues

**Extension doesn't activate**
- Check that `unfault` CLI is in PATH
- Check Output panel for errors

**LSP not connecting**
- Verify CLI is authenticated (`unfault login`)
- Check CLI version compatibility

**Hovers not appearing**
- Ensure file is a supported language
- Wait for initial analysis to complete

## Questions?

- Open a [GitHub Discussion](https://github.com/unfault/vscode/discussions)
- Check existing [issues](https://github.com/unfault/vscode/issues)

Thank you for contributing!
