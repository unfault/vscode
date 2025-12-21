/**
 * Welcome Panel for Unfault VSCode Extension
 * 
 * Provides a user-friendly onboarding experience with:
 * - Authentication status display
 * - Easy setup for `unfault login` or API key configuration
 * - Links to documentation
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

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
          case 'runLogin':
            // Open terminal and run unfault login
            const terminal = vscode.window.createTerminal('Unfault Login');
            terminal.show();
            terminal.sendText('unfault login');
            return;
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

  private _update() {
    const webview = this._panel.webview;
    this._panel.title = 'Welcome to Unfault';
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getAuthStatus(): { isAuthenticated: boolean; source: string | null; userName: string | null } {
    // Check for config file
    const configPath = path.join(os.homedir(), '.config', 'unfault', 'config.json');
    
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.api_key) {
          return { 
            isAuthenticated: true, 
            source: 'config file',
            userName: config.user_name || null
          };
        }
      }
    } catch {
      // Ignore errors reading config
    }

    // Check for environment variable
    if (process.env.UNFAULT_API_KEY) {
      return { 
        isAuthenticated: true, 
        source: 'environment variable',
        userName: null
      };
    }

    return { isAuthenticated: false, source: null, userName: null };
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const authStatus = this._getAuthStatus();
    const executablePath = vscode.workspace.getConfiguration('unfault').get('executablePath', 'unfault');

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
        
        .status-authenticated {
            color: var(--vscode-terminal-ansiGreen);
        }
        
        .status-unauthenticated {
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
        
        .auth-options {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        
        .auth-option {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            padding: 16px;
        }
        
        .auth-option h3 {
            font-size: 14px;
            font-weight: 600;
            margin: 0 0 8px 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .auth-option p {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
            margin: 0 0 12px 0;
        }
        
        .recommended {
            background: var(--vscode-terminal-ansiGreen);
            color: var(--vscode-editor-background);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
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
        <span class="logo">🛡️</span>
        Unfault
    </h1>
    <p class="tagline">A calm reviewer for thoughtful engineers — Production-readiness linting for your code</p>

    <div class="status-card">
        ${authStatus.isAuthenticated ? `
        <div class="status-header status-authenticated">
            <span class="status-icon">✓</span>
            Authenticated
        </div>
        <div class="status-details">
            ${authStatus.userName ? `Logged in as <strong>${authStatus.userName}</strong>` : 'API key configured'} 
            via ${authStatus.source}
            <br>
            <a href="#" class="refresh-link" onclick="refresh()">Refresh status</a>
        </div>
        ` : `
        <div class="status-header status-unauthenticated">
            <span class="status-icon">!</span>
            Not Authenticated
        </div>
        <div class="status-details">
            Please authenticate to enable code analysis.
            <br>
            <a href="#" class="refresh-link" onclick="refresh()">Refresh status</a>
        </div>
        `}
    </div>

    ${!authStatus.isAuthenticated ? `
    <div class="section">
        <h2>🔐 Authentication</h2>
        <div class="auth-options">
            <div class="auth-option">
                <h3>
                    Device Login
                    <span class="recommended">Recommended</span>
                </h3>
                <p>
                    The easiest way to authenticate. Opens your browser for secure sign-in with your Unfault account.
                </p>
                <div class="code-block">unfault login</div>
                <button onclick="runLogin()">Run unfault login</button>
            </div>
            
            <div class="auth-option">
                <h3>API Key (Manual)</h3>
                <p>
                    Alternatively, you can set an API key directly. Get your API key from the 
                    <a href="https://app.unfault.dev/settings/api-keys">Unfault Dashboard</a>.
                </p>
                <p>Set the <code>UNFAULT_API_KEY</code> environment variable, or create a config file:</p>
                <div class="code-block">~/.config/unfault/config.json</div>
                <div class="code-block">{
  "api_key": "your-api-key-here"
}</div>
            </div>
        </div>
    </div>
    ` : ''}

    <div class="section">
        <h2>⚙️ Configuration</h2>
        <div class="config-info">
            <strong>CLI Executable:</strong> <code>${executablePath}</code>
            <br><br>
            If <code>unfault</code> is not in your PATH, configure the full path in settings.
        </div>
        <button class="secondary" onclick="openSettings()">Open Settings</button>
    </div>

    <div class="section">
        <h2>✨ Features</h2>
        <div class="features">
            <div class="feature">
                <h3>🔍 Real-time Analysis</h3>
                <p>Get diagnostics as you code with automatic analysis on file changes.</p>
            </div>
            <div class="feature">
                <h3>🔧 Quick Fixes</h3>
                <p>Apply suggested fixes with a single click via code actions.</p>
            </div>
            <div class="feature">
                <h3>📊 Status Bar</h3>
                <p>See issues at a glance in the status bar with severity indicators.</p>
            </div>
            <div class="feature">
                <h3>🔒 Privacy First</h3>
                <p>Code is parsed locally — only analysis results are sent to the API.</p>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>📚 Resources</h2>
        <div class="links">
            <a href="https://unfault.dev/docs">Documentation</a>
            <a href="https://unfault.dev/docs/rules">Rules Reference</a>
            <a href="https://github.com/unfault/vscode/issues">Report an Issue</a>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function runLogin() {
            vscode.postMessage({ command: 'runLogin' });
        }
        
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
