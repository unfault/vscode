/**
 * Welcome Webview
 *
 * Provides a landing page for the Unfault extension that allows users to:
 * - Enter and store their API key
 * - Run `unfault login` via the CLI
 * - View their current configuration status
 */

import * as vscode from "vscode";
import { configExists, getApiKey, saveConfig, getBaseUrl } from "./config";

/**
 * Welcome panel for Unfault extension setup.
 */
export class WelcomePanel {
  public static currentPanel: WelcomePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "saveApiKey":
            await this._saveApiKey(message.apiKey);
            return;
          case "runLogin":
            await this._runLogin();
            return;
          case "refresh":
            this._update();
            return;
        }
      },
      null,
      this._disposables
    );
  }

  /**
   * Create or show the welcome panel.
   */
  public static createOrShow(extensionUri: vscode.Uri): void {
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
      "unfaultWelcome",
      "Unfault Setup",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
      }
    );

    WelcomePanel.currentPanel = new WelcomePanel(panel, extensionUri);
  }

  /**
   * Save the API key to the config file.
   */
  private async _saveApiKey(apiKey: string): Promise<void> {
    if (!apiKey || !apiKey.trim()) {
      vscode.window.showErrorMessage("Please enter a valid API key");
      return;
    }

    try {
      saveConfig({
        api_key: apiKey.trim(),
        stored_base_url: getBaseUrl(),
      });

      vscode.window.showInformationMessage(
        "API key saved successfully! Unfault is now ready to use."
      );

      // Refresh the panel to show the new status
      this._update();

      // Trigger a re-analysis of open files
      vscode.commands.executeCommand("unfault.analyzeWorkspace");
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to save API key: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Run the unfault login command in the terminal.
   */
  private async _runLogin(): Promise<void> {
    const terminal = vscode.window.createTerminal("Unfault Login");
    terminal.show();
    terminal.sendText("unfault login");

    vscode.window.showInformationMessage(
      "Running 'unfault login' in the terminal. Follow the instructions to authenticate."
    );
  }

  /**
   * Update the webview content.
   */
  private _update(): void {
    const webview = this._panel.webview;
    this._panel.title = "Unfault Setup";
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  /**
   * Get the HTML content for the webview.
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const isConfigured = configExists();
    const apiKey = getApiKey();
    const baseUrl = getBaseUrl();

    // Mask the API key for display
    const maskedKey = apiKey
      ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`
      : null;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
    <title>Unfault Setup</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
        }
        
        h1 {
            color: var(--vscode-titleBar-activeForeground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        
        h2 {
            color: var(--vscode-titleBar-activeForeground);
            margin-top: 30px;
        }
        
        .status-card {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .status-configured {
            border-left: 4px solid var(--vscode-testing-iconPassed);
        }
        
        .status-not-configured {
            border-left: 4px solid var(--vscode-testing-iconFailed);
        }
        
        .status-icon {
            font-size: 24px;
            margin-right: 10px;
        }
        
        .status-title {
            font-size: 18px;
            font-weight: bold;
            display: flex;
            align-items: center;
        }
        
        .status-details {
            margin-top: 10px;
            color: var(--vscode-descriptionForeground);
        }
        
        .input-group {
            margin: 20px 0;
        }
        
        .input-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
        }
        
        .input-group input {
            width: 100%;
            padding: 10px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 14px;
        }
        
        .input-group input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        
        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        button {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
        }
        
        .button-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .button-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .button-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .button-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .divider {
            display: flex;
            align-items: center;
            margin: 30px 0;
        }
        
        .divider::before,
        .divider::after {
            content: '';
            flex: 1;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .divider span {
            padding: 0 20px;
            color: var(--vscode-descriptionForeground);
        }
        
        .info-box {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textLink-foreground);
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 4px 4px 0;
        }
        
        .info-box code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
        }
        
        a {
            color: var(--vscode-textLink-foreground);
        }
        
        a:hover {
            color: var(--vscode-textLink-activeForeground);
        }
        
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        
        .feature {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 8px;
        }
        
        .feature h3 {
            margin-top: 0;
            color: var(--vscode-titleBar-activeForeground);
        }
        
        .feature p {
            margin-bottom: 0;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <h1>🛡️ Unfault</h1>
    <p>Production-readiness linter for your code. Catch stability, reliability, and performance issues before they reach production.</p>
    
    <div class="status-card ${isConfigured ? "status-configured" : "status-not-configured"}">
        <div class="status-title">
            <span class="status-icon">${isConfigured ? "✅" : "⚠️"}</span>
            ${isConfigured ? "Configured" : "Not Configured"}
        </div>
        <div class="status-details">
            ${
              isConfigured
                ? `
                <p><strong>API Key:</strong> ${maskedKey}</p>
                <p><strong>API URL:</strong> ${baseUrl}</p>
            `
                : `
                <p>Unfault needs an API key to analyze your code. Choose one of the options below to get started.</p>
            `
            }
        </div>
    </div>

    ${
      !isConfigured
        ? `
    <h2>Option 1: Enter API Key</h2>
    <p>If you already have an API key, enter it below:</p>
    
    <div class="input-group">
        <label for="apiKey">API Key</label>
        <input type="password" id="apiKey" placeholder="uf_live_..." />
    </div>
    
    <div class="button-group">
        <button class="button-primary" onclick="saveApiKey()">Save API Key</button>
    </div>
    
    <div class="divider"><span>OR</span></div>
    
    <h2>Option 2: Login via CLI</h2>
    <p>Use the Unfault CLI to authenticate with your browser:</p>
    
    <div class="info-box">
        <p>This will open a terminal and run <code>unfault login</code>. Follow the instructions to authenticate via your browser.</p>
    </div>
    
    <div class="button-group">
        <button class="button-secondary" onclick="runLogin()">Run unfault login</button>
    </div>
    
    <div class="info-box">
        <p><strong>Don't have the CLI installed?</strong></p>
        <p>Install it with: <code>cargo install unfault</code></p>
        <p>Or visit <a href="https://unfault.dev">unfault.dev</a> to get started.</p>
    </div>
    `
        : `
    <h2>You're all set! 🎉</h2>
    <p>Unfault is configured and ready to analyze your code. Open any supported file to see diagnostics.</p>
    
    <div class="button-group">
        <button class="button-primary" onclick="vscode.postMessage({ command: 'refresh' })">Refresh Status</button>
    </div>
    
    <h2>Update API Key</h2>
    <p>Need to update your API key? Enter a new one below:</p>
    
    <div class="input-group">
        <label for="apiKey">New API Key</label>
        <input type="password" id="apiKey" placeholder="uf_live_..." />
    </div>
    
    <div class="button-group">
        <button class="button-secondary" onclick="saveApiKey()">Update API Key</button>
    </div>
    `
    }
    
    <h2>Features</h2>
    <div class="features">
        <div class="feature">
            <h3>🔍 Real-time Analysis</h3>
            <p>Get instant feedback as you code with diagnostics that appear in your editor.</p>
        </div>
        <div class="feature">
            <h3>🔧 Quick Fixes</h3>
            <p>Apply suggested fixes with a single click using VS Code's code actions.</p>
        </div>
        <div class="feature">
            <h3>🌐 Multi-language</h3>
            <p>Support for Python, Go, Rust, TypeScript, and JavaScript.</p>
        </div>
        <div class="feature">
            <h3>⚡ Fast</h3>
            <p>Powered by a Rust engine for blazing-fast analysis.</p>
        </div>
    </div>
    
    <h2>Supported Languages</h2>
    <ul>
        <li>Python (.py)</li>
        <li>Go (.go)</li>
        <li>Rust (.rs)</li>
        <li>TypeScript (.ts, .tsx)</li>
        <li>JavaScript (.js, .jsx)</li>
    </ul>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function saveApiKey() {
            const apiKey = document.getElementById('apiKey').value;
            vscode.postMessage({ command: 'saveApiKey', apiKey: apiKey });
        }
        
        function runLogin() {
            vscode.postMessage({ command: 'runLogin' });
        }
        
        // Allow Enter key to submit
        document.getElementById('apiKey')?.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                saveApiKey();
            }
        });
    </script>
</body>
</html>`;
  }

  /**
   * Dispose of the panel.
   */
  public dispose(): void {
    WelcomePanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

/**
 * Check if the extension is configured and show welcome panel if not.
 *
 * @param extensionUri The extension's URI
 * @returns true if configured, false if welcome panel was shown
 */
export function checkConfigurationAndShowWelcome(
  extensionUri: vscode.Uri
): boolean {
  if (!configExists() || !getApiKey()) {
    WelcomePanel.createOrShow(extensionUri);
    return false;
  }
  return true;
}