/**
 * Unfault VS Code Extension
 *
 * This extension provides production-readiness linting for your code by
 * integrating with the Unfault CLI via LSP. The CLI performs client-side
 * parsing and sends analyzed IR to the Unfault API, keeping your source
 * code local.
 *
 * Features:
 * - Real-time diagnostics via LSP
 * - Code actions for quick fixes
 * - Status bar showing Unfault status and diagnostics count
 * - Welcome panel for onboarding and authentication
 */

import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State,
  TransportKind
} from 'vscode-languageclient/node';
import { WelcomePanel } from './welcomePanel';

let client: LanguageClient;
let statusBarItem: vscode.StatusBarItem;

/**
 * File centrality notification from the LSP server
 */
interface FileCentralityNotification {
  path: string;
  in_degree: number;
  out_degree: number;
  importance_score: number;
  total_files: number;
  label: string;
}

// Track current centrality for the active file
let currentCentrality: FileCentralityNotification | null = null;

// Track server state
let serverState: 'starting' | 'running' | 'stopped' | 'error' = 'starting';

/**
 * Get the path to the unfault binary from configuration.
 */
function getUnfaultPath(): string {
  const config = vscode.workspace.getConfiguration('unfault');
  return config.get('executablePath', 'unfault');
}

/**
 * Create and configure the status bar item
 */
function createStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  item.name = 'Unfault';
  return item;
}

/**
 * Update the status bar based on current state
 */
function updateStatusBar() {
  const editor = vscode.window.activeTextEditor;
  const supportedLanguages = ['python', 'go', 'rust', 'typescript', 'javascript'];
  
  // Check if we're in a supported file
  const isSupported = editor && supportedLanguages.includes(editor.document.languageId);

  // Always show status bar, but with different content based on state
  if (serverState === 'stopped' || serverState === 'error') {
    statusBarItem.text = '$(unfault-logo)';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBarItem.tooltip = serverState === 'error'
      ? 'Unfault LSP server failed to start. Click to see options.'
      : 'Unfault LSP server is not running. Click to restart.';
    statusBarItem.command = 'unfault.showMenu';
    statusBarItem.show();
    return;
  }

  if (serverState === 'starting') {
    statusBarItem.text = '$(unfault-logo) $(loading~spin)';
    statusBarItem.backgroundColor = undefined;
    statusBarItem.tooltip = 'Unfault LSP server is starting...';
    statusBarItem.command = 'unfault.showMenu';
    statusBarItem.show();
    return;
  }

  // Server is running
  if (!isSupported) {
    // Show minimal status bar for unsupported files
    statusBarItem.text = '$(unfault-logo)';
    statusBarItem.backgroundColor = undefined;
    statusBarItem.tooltip = 'Unfault - Production readiness linting\nOpen a supported file (Python, Go, Rust, TypeScript, JavaScript) to see diagnostics.';
    statusBarItem.command = 'unfault.showMenu';
    statusBarItem.show();
    return;
  }

  // Get diagnostics for the current file
  const diagnostics = vscode.languages.getDiagnostics(editor!.document.uri)
    .filter(d => d.source === 'unfault');
  
  const issueCount = diagnostics.length;
  const errorCount = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
  const warningCount = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;

  // Build status text
  let text = '$(unfault-logo)';
  const tooltipParts: string[] = ['**Unfault Status**\n'];

  if (issueCount === 0) {
    text = '$(unfault-logo) ✓';
    statusBarItem.backgroundColor = undefined;
    tooltipParts.push('No issues found in this file');
  } else {
    text = `$(unfault-logo) ${issueCount}`;
    statusBarItem.backgroundColor = errorCount > 0 
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : warningCount > 0 
        ? new vscode.ThemeColor('statusBarItem.warningBackground')
        : undefined;
    
    if (errorCount > 0) {
      tooltipParts.push(`- ${errorCount} error${errorCount > 1 ? 's' : ''}`);
    }
    if (warningCount > 0) {
      tooltipParts.push(`- ${warningCount} warning${warningCount > 1 ? 's' : ''}`);
    }
    const infoCount = issueCount - errorCount - warningCount;
    if (infoCount > 0) {
      tooltipParts.push(`- ${infoCount} info`);
    }
  }

  // Add centrality info if available
  if (currentCentrality) {
    tooltipParts.push('\n**File Importance**');
    tooltipParts.push(`- Imported by: ${currentCentrality.in_degree} files`);
    tooltipParts.push(`- Imports: ${currentCentrality.out_degree} files`);
    
    // Add centrality indicator to text
    if (currentCentrality.in_degree > 10) {
      text += ' $(hub)';
    } else if (currentCentrality.in_degree > 5) {
      text += ' $(star)';
    }
  }

  tooltipParts.push('\n---\nClick for options');

  statusBarItem.text = text;
  statusBarItem.tooltip = new vscode.MarkdownString(tooltipParts.join('\n'));
  statusBarItem.command = 'unfault.showMenu';
  statusBarItem.show();
}

/**
 * Set centrality for the current file
 */
function setCentrality(centrality: FileCentralityNotification | null) {
  currentCentrality = centrality;
  updateStatusBar();
}

/**
 * Register LSP client handlers
 */
function registerClientHandlers(lspClient: LanguageClient) {
  lspClient.onDidChangeState((e) => {
    if (e.newState === State.Running) {
      serverState = 'running';
      updateStatusBar();
    } else if (e.newState === State.Stopped) {
      serverState = 'stopped';
      updateStatusBar();
    }
  });

  lspClient.onNotification('unfault/fileCentrality', (params: FileCentralityNotification) => {
    setCentrality(params);
  });
}

export function activate(context: vscode.ExtensionContext) {
  // Create status bar item
  statusBarItem = createStatusBarItem();
  context.subscriptions.push(statusBarItem);

  // Show initial status
  updateStatusBar();

  // Get the command from configuration
  const command = getUnfaultPath();
  const args = ["lsp"];

  // Server options: run the unfault CLI in LSP mode
  const serverOptions: ServerOptions = {
    run: { command, args, transport: TransportKind.stdio },
    debug: {
      command,
      args: [...args, "--verbose"],
      transport: TransportKind.stdio,
    }
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for supported documents
    documentSelector: [
      { scheme: 'file', language: 'python' },
      { scheme: 'file', language: 'go' },
      { scheme: 'file', language: 'rust' },
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'javascript' },
    ],
    synchronize: {
      // Notify the server about file changes to configuration files
      fileEvents: [
        vscode.workspace.createFileSystemWatcher('**/pyproject.toml'),
        vscode.workspace.createFileSystemWatcher('**/Cargo.toml'),
        vscode.workspace.createFileSystemWatcher('**/package.json'),
        vscode.workspace.createFileSystemWatcher('**/unfault.toml'),
      ]
    }
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    'unfault',
    'Unfault LSP',
    serverOptions,
    clientOptions
  );

  // Register handlers
  registerClientHandlers(client);

  // Update status bar when diagnostics change
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(() => {
      updateStatusBar();
    })
  );

  // Update status bar when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      // Clear centrality when switching files (will be updated by server)
      currentCentrality = null;
      updateStatusBar();
    })
  );

  // Start the client. This will also launch the server
  client.start().catch((err) => {
    console.error('Failed to start Unfault LSP client:', err);
    serverState = 'error';
    updateStatusBar();
  });

  // Register command to show welcome panel
  const showWelcomeCommand = vscode.commands.registerCommand('unfault.showWelcome', () => {
    WelcomePanel.createOrShow(context.extensionUri);
  });
  context.subscriptions.push(showWelcomeCommand);

  // Register command to show menu
  const showMenuCommand = vscode.commands.registerCommand('unfault.showMenu', async () => {
    const items: vscode.QuickPickItem[] = [
      {
        label: '$(home) Welcome & Setup',
        description: 'Open the Unfault welcome panel'
      },
      {
        label: '$(gear) Open Settings',
        description: 'Configure Unfault extension settings'
      },
      {
        label: '$(output) Show Output',
        description: 'Show Unfault LSP output log'
      },
      {
        label: '$(refresh) Restart Server',
        description: 'Restart the Unfault LSP server'
      },
      {
        label: '$(book) Documentation',
        description: 'Open Unfault documentation'
      }
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Unfault - Select an action'
    });

    if (selected) {
      switch (selected.label) {
        case '$(home) Welcome & Setup':
          WelcomePanel.createOrShow(context.extensionUri);
          break;
        case '$(gear) Open Settings':
          vscode.commands.executeCommand('workbench.action.openSettings', 'unfault');
          break;
        case '$(output) Show Output':
          client.outputChannel.show();
          break;
        case '$(refresh) Restart Server':
          vscode.commands.executeCommand('unfault.restartServer');
          break;
        case '$(book) Documentation':
          vscode.env.openExternal(vscode.Uri.parse('https://unfault.dev/docs'));
          break;
      }
    }
  });
  context.subscriptions.push(showMenuCommand);

  // Register command to show output
  const showOutputCommand = vscode.commands.registerCommand('unfault.showOutput', () => {
    client.outputChannel.show();
  });
  context.subscriptions.push(showOutputCommand);

  // Register command to open settings
  const openSettingsCommand = vscode.commands.registerCommand('unfault.openSettings', () => {
    vscode.commands.executeCommand('workbench.action.openSettings', 'unfault');
  });
  context.subscriptions.push(openSettingsCommand);

  // Register command to restart the LSP server
  const restartCommand = vscode.commands.registerCommand('unfault.restartServer', async () => {
    serverState = 'starting';
    updateStatusBar();

    if (client) {
      await client.stop();
    }

    const command = getUnfaultPath();
    const args = ["lsp"];
    const serverOptions: ServerOptions = {
      run: { command, args, transport: TransportKind.stdio },
      debug: {
        command,
        args: [...args, "--verbose"],
        transport: TransportKind.stdio,
      }
    };

    client = new LanguageClient(
      'unfault',
      'Unfault LSP',
      serverOptions,
      clientOptions
    );

    // Re-register handlers
    registerClientHandlers(client);

    client.start().catch((err) => {
      console.error('Failed to restart Unfault LSP client:', err);
      serverState = 'error';
      updateStatusBar();
    });

    vscode.window.showInformationMessage('Unfault LSP server restarted');
  });

  context.subscriptions.push(restartCommand);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
