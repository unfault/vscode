/**
 * Welcome Panel for Unfault VSCode Extension
 *
 * Provides a user-friendly onboarding experience with:
 * - Binary detection and version display
 * - Feature overview (code lenses, context sidebar, fault injection, diagnostics)
 * - Configuration guidance
 * - Links to documentation
 */

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Manages the Unfault Welcome webview panel
 */
export class WelcomePanel {
  public static currentPanel: WelcomePanel | undefined;
  public static readonly viewType = 'unfault.welcome';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (WelcomePanel.currentPanel) {
      WelcomePanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      WelcomePanel.viewType,
      'Welcome to Unfault',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri]
      }
    );

    WelcomePanel.currentPanel = new WelcomePanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'openSettings':
            vscode.commands.executeCommand('workbench.action.openSettings', 'unfault');
            return;
          case 'openDocs':
            vscode.env.openExternal(vscode.Uri.parse('https://unfault.dev/docs'));
            return;
          case 'refresh':
            this._update();
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public dispose() {
    WelcomePanel.currentPanel = undefined;

    // Clean up resources
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private async _update() {
    const webview = this._panel.webview;
    this._panel.title = 'Welcome to Unfault';
    this._panel.webview.html = await this._getHtmlForWebview(webview);
  }

  private async _getBinaryStatus(executablePath: string): Promise<{ found: boolean; version: string | null }> {
    try {
      const { stdout } = await execFileAsync(executablePath, ['--version'], { timeout: 5000 });
      const version = stdout.trim().replace(/^unfault\s+/, '');
      return { found: true, version: version || null };
    } catch {
      return { found: false, version: null };
    }
  }

  private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
    const executablePath = vscode.workspace.getConfiguration('unfault').get('executablePath', 'unfault');
    const binaryStatus = await this._getBinaryStatus(executablePath as string);

    // Get the logo URI for the webview
    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'images', 'icon.png')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Unfault</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px 40px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            max-width: 800px;
            margin: 0 auto;
        }
        
        h1 {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .logo {
            width: 32px;
            height: 32px;
        }
        
        .tagline {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 24px;
            font-size: 14px;
        }
        
        .status-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            padding: 16px 20px;
            margin-bottom: 24px;
        }
        
        .status-header {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .status-ok {
            color: var(--vscode-terminal-ansiGreen);
        }
        
        .status-missing {
            color: var(--vscode-terminal-ansiYellow);
        }
        
        .status-icon {
            font-size: 18px;
        }
        
        .status-details {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }
        
        .section {
            margin-bottom: 24px;
        }
        
        .section h2 {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 12px;
            border-bottom: 1px solid var(--vscode-widget-border);
            padding-bottom: 8px;
        }
        
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }
        
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        
        .code-block {
            background: var(--vscode-textCodeBlock-background);
            padding: 8px 12px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            margin: 8px 0;
            overflow-x: auto;
        }
        
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
        }
        
        .feature {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            padding: 16px;
        }
        
        .feature h3 {
            font-size: 14px;
            font-weight: 600;
            margin: 0 0 8px 0;
        }
        
        .feature p {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
            margin: 0;
        }
        
        .config-info {
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
            padding: 12px 16px;
            margin: 16px 0;
            font-size: 13px;
        }
        
        .install-steps {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin: 12px 0;
        }

        .install-step {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
        }

        .links {
            display: flex;
            gap: 16px;
            margin-top: 24px;
        }
        
        a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        
        a:hover {
            text-decoration: underline;
        }
        
        .refresh-link {
            font-size: 12px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <h1>
        <img class="logo" src="${logoUri}" alt="Unfault Logo">
        Unfault
    </h1>
    <p class="tagline">A cognitive context engine. Understand what your code means and does while you're writing it.</p>

    <div class="status-card">
        ${binaryStatus.found ? `
        <div class="status-header status-ok">
            <span class="status-icon">✓</span>
            CLI ready
        </div>
        <div class="status-details">
            <code>${executablePath}</code>${binaryStatus.version ? ` &mdash; version ${binaryStatus.version}` : ''}
            <br>
            <a href="#" class="refresh-link" onclick="refresh()">Refresh</a>
        </div>
        ` : `
        <div class="status-header status-missing">
            <span class="status-icon">!</span>
            CLI not found
        </div>
        <div class="status-details">
            <code>${executablePath}</code> was not found. Install the CLI or set the correct path in settings.
            <br>
            <a href="#" class="refresh-link" onclick="refresh()">Refresh</a>
        </div>
        `}
    </div>

    ${!binaryStatus.found ? `
    <div class="section">
        <h2>Install the CLI</h2>
        <div class="install-steps">
            <div class="install-step">macOS (arm64):</div>
            <div class="code-block">curl -Lo unfault https://github.com/unfault/unfault/releases/latest/download/unfault-latest-macos-arm64
chmod +x unfault &amp;&amp; mv unfault /usr/local/bin/</div>
            <div class="install-step">Linux (x86_64):</div>
            <div class="code-block">curl -Lo unfault https://github.com/unfault/unfault/releases/latest/download/unfault-latest-linux-x86_64
chmod +x unfault &amp;&amp; mv unfault /usr/local/bin/</div>
            <div class="install-step">From source:</div>
            <div class="code-block">cargo install unfault</div>
        </div>
        <p style="font-size:13px; color: var(--vscode-descriptionForeground);">
            If <code>unfault</code> is installed in a non-standard location, set the full path in settings.
        </p>
        <button class="secondary" onclick="openSettings()">Open Settings</button>
    </div>
    ` : ''}

    <div class="section">
        <h2>Configuration</h2>
        <div class="config-info">
            <strong>CLI Executable:</strong> <code>${executablePath}</code>
            <br><br>
            All analysis runs locally — no API key or account required.
            If <code>unfault</code> is not in your PATH, set the full path in settings.
        </div>
        <button class="secondary" onclick="openSettings()">Open Settings</button>
    </div>

    <div class="section">
        <h2>Features</h2>
        <div class="features">
            <div class="feature">
                <h3>Function Impact</h3>
                <p>Code lenses above functions show impact summary at a glance. Click to open detailed panel with callers, routes, and findings.</p>
            </div>
            <div class="feature">
                <h3>File Centrality</h3>
                <p>Status bar shows how central a file is. Hub files that many others depend on are highlighted.</p>
            </div>
            <div class="feature">
                <h3>Dependency Awareness</h3>
                <p>Get notified when you open a file that other parts of your codebase depend on.</p>
            </div>
            <div class="feature">
                <h3>Inline Insights</h3>
                <p>See contextual information about code behavior patterns as you write.</p>
            </div>
            <div class="feature">
                <h3>Quick Fixes</h3>
                <p>Apply suggested improvements with a single click via code actions.</p>
            </div>
            <div class="feature">
                <h3>Fully Local</h3>
                <p>All parsing and analysis happens on your machine. No source code or data ever leaves your machine.</p>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>Resources</h2>
        <div class="links">
            <a href="https://unfault.dev/docs">Documentation</a>
            <a href="https://unfault.dev/docs/rules">Rules Reference</a>
            <a href="https://github.com/unfault/vscode/issues">Report an Issue</a>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function openSettings() {
            vscode.postMessage({ command: 'openSettings' });
        }
        
        function openDocs() {
            vscode.postMessage({ command: 'openDocs' });
        }
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;
  }
}
