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
 * - Status bar showing file importance/centrality
 */

import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

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

/**
 * Get the path to the unfault binary from configuration.
 */
function getUnfaultPath(): string {
  const config = vscode.workspace.getConfiguration('unfault');
  return config.get('executablePath', 'unfault');
}

/**
 * Create and configure the status bar item for file centrality
 */
function createStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  item.name = 'Unfault File Centrality';
  item.tooltip = 'File importance in the codebase';
  return item;
}

/**
 * Update the status bar with file centrality information
 */
function updateStatusBar(centrality: FileCentralityNotification | null) {
  if (!centrality) {
    statusBarItem.hide();
    return;
  }

  // Format the status bar text
  const icon = centrality.in_degree > 10 ? '$(hub)' :
               centrality.in_degree > 5 ? '$(star)' :
               centrality.in_degree > 0 ? '$(file-symlink-file)' :
               '$(file)';

  statusBarItem.text = `${icon} ${centrality.label}`;
  statusBarItem.tooltip = new vscode.MarkdownString(
    `**File Importance**\n\n` +
    `- Imported by: ${centrality.in_degree} files\n` +
    `- Imports: ${centrality.out_degree} files\n` +
    `- Importance score: ${centrality.importance_score}\n` +
    `- Total files: ${centrality.total_files}`
  );
  statusBarItem.show();
}

export function activate(context: vscode.ExtensionContext) {
  // Create status bar item
  statusBarItem = createStatusBarItem();
  context.subscriptions.push(statusBarItem);

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

  // Handle custom notifications from the server
  client.onNotification('unfault/fileCentrality', (params: FileCentralityNotification) => {
    updateStatusBar(params);
  });

  // Clear status bar when active editor changes to unsupported file
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        updateStatusBar(null);
        return;
      }

      const lang = editor.document.languageId;
      const supportedLanguages = ['python', 'go', 'rust', 'typescript', 'javascript'];
      if (!supportedLanguages.includes(lang)) {
        updateStatusBar(null);
      }
      // For supported languages, we'll get a notification from the server
    })
  );

  // Start the client. This will also launch the server
  client.start();

  // Register command to restart the LSP server
  const restartCommand = vscode.commands.registerCommand('unfault.restartServer', async () => {
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

    // Re-register notification handler
    client.onNotification('unfault/fileCentrality', (params: FileCentralityNotification) => {
      updateStatusBar(params);
    });

    client.start();
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
