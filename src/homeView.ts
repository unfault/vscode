/**
 * Home screen webview for Unfault extension
 */

import * as vscode from 'vscode';
import { AuthManager, AuthStatus } from './auth';

export class HomeViewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private authManager: AuthManager;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext, authManager: AuthManager) {
    this.context = context;
    this.authManager = authManager;
  }

  /**
   * Show the home view
   */
  async show() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      await this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'unfaultHome',
      'Unfault',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        await this.handleMessage(message);
      },
      undefined,
      this.context.subscriptions
    );

    await this.refresh();
  }

  /**
   * Refresh the webview content
   */
  async refresh() {
    if (!this.panel) {
      return;
    }

    const authStatus = await this.authManager.initialize();
    const config = vscode.workspace.getConfiguration('unfault');

    this.panel.webview.html = this.getHtmlContent(authStatus, config);
  }

  /**
   * Handle messages from the webview
   */
  private async handleMessage(message: any) {
    switch (message.command) {
      case 'submitApiKey':
        const apiKey = message.apiKey;
        if (!apiKey || (!apiKey.startsWith('sk_live_') && !apiKey.startsWith('sk_test_'))) {
          this.panel?.webview.postMessage({
            command: 'showError',
            message: 'Invalid API key format. Key should start with "sk_live_" or "sk_test_"'
          });
          return;
        }

        // Store API key securely
        await this.context.secrets.store('unfault.apiKey', apiKey);
        await this.context.globalState.update('unfault.authMethod', 'api_key');
        
        vscode.window.showInformationMessage('Successfully authenticated!');
        await this.refresh();
        break;

      case 'openTerminal':
        const terminal = vscode.window.createTerminal('Unfault - CLI Login');
        terminal.show();
        terminal.sendText('unfault login');
        break;

      case 'verifyCliAuth':
        const cliStatus = await this.authManager.initialize();
        if (cliStatus.authenticated && cliStatus.method === 'cli') {
          vscode.window.showInformationMessage('Successfully authenticated via CLI!');
          await this.refresh();
        } else {
          this.panel?.webview.postMessage({
            command: 'showError',
            message: 'CLI authentication not detected. Please complete the login process.'
          });
        }
        break;

      case 'logout':
        await this.authManager.logout();
        await this.refresh();
        break;

      case 'updateApiKey':
        await this.authManager.updateApiKey();
        await this.refresh();
        break;

      case 'updateSetting':
        const settingConfig = vscode.workspace.getConfiguration('unfault');
        await settingConfig.update(
          message.setting,
          message.value,
          vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(`Updated ${message.setting}`);
        await this.refresh();
        break;

      case 'analyzeProject':
        vscode.commands.executeCommand('fault-rules.analyzeProject');
        break;

      case 'analyzeFile':
        vscode.commands.executeCommand('fault-rules.analyzeFile');
        break;

      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'unfault');
        break;

      case 'refresh':
        await this.refresh();
        break;
    }
  }

  /**
   * Generate HTML content for the webview
   */
  private getHtmlContent(authStatus: AuthStatus, config: vscode.WorkspaceConfiguration): string {
    const authenticated = authStatus.authenticated;
    const authMethod = authStatus.method;
    const apiEndpoint = config.get<string>('apiEndpoint', 'http://localhost:8080/api/v1');
    const autoAnalyze = config.get<boolean>('autoAnalyze', true);
    const severityThreshold = config.get<string>('severityThreshold', 'info');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>unfault</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Timmana&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      line-height: 1.6;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid var(--vscode-panel-border);
    }

    .logo {
      font-size: 48px;
    }

    .header-text h1 {
      font-family: 'Timmana', sans-serif;
      font-size: 32px;
      margin-bottom: 5px;
      color: #facc2e;
    }

    .header-text p {
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }

    .section {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 15px;
    }

    .section-icon {
      font-size: 24px;
    }

    .section-title {
      font-size: 18px;
      font-weight: 600;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 15px;
    }

    .status-authenticated {
      background-color: rgba(76, 175, 80, 0.15);
      color: #4caf50;
    }

    .status-not-authenticated {
      background-color: rgba(244, 67, 54, 0.15);
      color: #f44336;
    }

    .auth-method {
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
      margin-bottom: 15px;
    }

    .button-group {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 15px;
    }

    button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-family: var(--vscode-font-family);
      transition: background-color 0.2s;
    }

    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    button.secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button.secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    button.danger {
      background-color: rgba(244, 67, 54, 0.2);
      color: #f44336;
    }

    button.danger:hover {
      background-color: rgba(244, 67, 54, 0.3);
    }

    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .setting-row:last-child {
      border-bottom: none;
    }

    .setting-label {
      flex: 1;
    }

    .setting-label-text {
      font-weight: 500;
      margin-bottom: 4px;
    }

    .setting-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .setting-control {
      margin-left: 20px;
    }

    input[type="text"],
    select {
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 6px 10px;
      border-radius: 4px;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      min-width: 200px;
    }

    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .quick-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 15px;
    }

    .action-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 15px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .action-card:hover {
      border-color: var(--vscode-focusBorder);
      transform: translateY(-2px);
    }

    .action-icon {
      font-size: 32px;
      margin-bottom: 10px;
    }

    .action-title {
      font-weight: 500;
      margin-bottom: 5px;
    }

    .action-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .info-box {
      background-color: rgba(33, 150, 243, 0.1);
      border-left: 4px solid #2196f3;
      padding: 12px;
      border-radius: 4px;
      margin-top: 15px;
      font-size: 13px;
    }

    .auth-tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      border-bottom: 2px solid var(--vscode-panel-border);
    }

    .auth-tab {
      background: none;
      border: none;
      padding: 12px 20px;
      cursor: pointer;
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: all 0.2s;
    }

    .auth-tab:hover {
      background: none;
      color: var(--vscode-foreground);
    }

    .auth-tab.active {
      color: var(--vscode-foreground);
      border-bottom-color: var(--vscode-focusBorder);
      font-weight: 500;
    }

    .auth-panel {
      display: none;
    }

    .auth-panel.active {
      display: block;
    }

    .form-group {
      margin-bottom: 15px;
    }

    .form-label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      font-size: 14px;
    }

    .form-input {
      width: 100%;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 10px 12px;
      border-radius: 4px;
      font-family: var(--vscode-font-family);
      font-size: 14px;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .form-hint {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 6px;
    }

    .error-message {
      background-color: rgba(244, 67, 54, 0.15);
      color: #f44336;
      padding: 10px;
      border-radius: 4px;
      font-size: 13px;
      margin-top: 10px;
    }

    .cli-instructions {
      padding: 20px 0;
    }

    .instruction-step {
      display: flex;
      gap: 15px;
      margin-bottom: 25px;
    }

    .step-number {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
    }

    .step-content {
      flex: 1;
    }

    .step-content strong {
      display: block;
      margin-bottom: 8px;
    }

    .code-block {
      background-color: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-panel-border);
      padding: 10px 12px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      margin-top: 8px;
      color: var(--vscode-textPreformat-foreground);
    }

    .refresh-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🛡️</div>
      <div class="header-text">
        <h1>unfault</h1>
        <p>Production readiness analysis for your code</p>
      </div>
    </div>

    <!-- Authentication Section -->
    <div class="section">
      <div class="section-header">
        <span class="section-icon">🔐</span>
        <h2 class="section-title">Authentication</h2>
      </div>

      ${authenticated ? `
        <div class="status-badge status-authenticated">
          <span>✓</span>
          <span>Authenticated</span>
        </div>
        <div class="auth-method">
          Method: <strong>${authMethod === 'api_key' ? 'API Key' : 'CLI'}</strong>
        </div>
        <div class="button-group">
          <button class="secondary" onclick="updateApiKey()">Update API Key</button>
          <button class="danger" onclick="logout()">Logout</button>
        </div>
      ` : `
        <div class="status-badge status-not-authenticated">
          <span>⚠️</span>
          <span>Not Authenticated</span>
        </div>
        <p style="margin-bottom: 20px; color: var(--vscode-descriptionForeground);">
          Please authenticate to start analyzing your code
        </p>

        <!-- Auth Method Tabs -->
        <div class="auth-tabs">
          <button class="auth-tab active" onclick="switchAuthTab('api-key')">
            🔑 API Key
          </button>
          <button class="auth-tab" onclick="switchAuthTab('cli')">
            💻 CLI
          </button>
        </div>

        <!-- API Key Auth Form -->
        <div id="auth-api-key" class="auth-panel active">
          <form onsubmit="submitApiKey(event)" style="margin-top: 20px;">
            <div class="form-group">
              <label for="apiKeyInput" class="form-label">Enter your API Key</label>
              <input
                type="password"
                id="apiKeyInput"
                placeholder="sk_live_xxxxxxxxxx"
                class="form-input"
                required
              />
              <div class="form-hint">
                Keys start with "sk_live_" or "sk_test_" and can be generated at
                <a href="https://app.unfault.io/settings/api-keys" style="color: var(--vscode-textLink-foreground);">
                  app.unfault.io
                </a>
              </div>
            </div>
            <div id="error-message" class="error-message" style="display: none;"></div>
            <button type="submit" style="margin-top: 15px;">
              Authenticate with API Key
            </button>
          </form>
        </div>

        <!-- CLI Auth Instructions -->
        <div id="auth-cli" class="auth-panel">
          <div class="cli-instructions">
            <h3 style="margin-bottom: 15px;">Authenticate with unfault CLI</h3>
            
            <div class="instruction-step">
              <div class="step-number">1</div>
              <div class="step-content">
                <strong>Install the unfault CLI</strong>
                <div class="code-block">npm install -g unfault-cli</div>
                <div class="form-hint">Or visit <a href="https://docs.unfault.io/cli/installation" style="color: var(--vscode-textLink-foreground);">installation docs</a> for other methods</div>
              </div>
            </div>

            <div class="instruction-step">
              <div class="step-number">2</div>
              <div class="step-content">
                <strong>Run the login command</strong>
                <div class="code-block">unfault login</div>
                <button class="secondary" onclick="openTerminal()" style="margin-top: 10px;">
                  Open Terminal & Run Command
                </button>
              </div>
            </div>

            <div class="instruction-step">
              <div class="step-number">3</div>
              <div class="step-content">
                <strong>Complete authentication in browser</strong>
                <div class="form-hint">Follow the browser prompts to complete login</div>
              </div>
            </div>

            <div class="instruction-step">
              <div class="step-number">4</div>
              <div class="step-content">
                <strong>Verify authentication</strong>
                <button onclick="verifyCliAuth()" style="margin-top: 10px;">
                  ✓ I've Completed CLI Login
                </button>
              </div>
            </div>
          </div>
        </div>
      `}
    </div>

    ${authenticated ? `
      <!-- Quick Actions -->
      <div class="section">
        <div class="section-header">
          <span class="section-icon">⚡</span>
          <h2 class="section-title">Quick Actions</h2>
        </div>
        <div class="quick-actions">
          <div class="action-card" onclick="analyzeProject()">
            <div class="action-icon">📊</div>
            <div class="action-title">Analyze Project</div>
            <div class="action-description">Scan entire workspace for issues</div>
          </div>
          <div class="action-card" onclick="analyzeFile()">
            <div class="action-icon">📄</div>
            <div class="action-title">Analyze File</div>
            <div class="action-description">Scan current open file</div>
          </div>
        </div>
      </div>
    ` : ''}

    <!-- Settings Section -->
    <div class="section">
      <div class="section-header">
        <span class="section-icon">⚙️</span>
        <h2 class="section-title">Settings</h2>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="setting-label-text">API Endpoint</div>
          <div class="setting-description">Backend API URL</div>
        </div>
        <div class="setting-control">
          <input 
            type="text" 
            value="${apiEndpoint}" 
            onchange="updateSetting('apiEndpoint', this.value)"
          />
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="setting-label-text">Auto-analyze on Save</div>
          <div class="setting-description">Automatically scan files when saved</div>
        </div>
        <div class="setting-control">
          <input 
            type="checkbox" 
            ${autoAnalyze ? 'checked' : ''} 
            onchange="updateSetting('autoAnalyze', this.checked)"
          />
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="setting-label-text">Severity Threshold</div>
          <div class="setting-description">Minimum severity level to display</div>
        </div>
        <div class="setting-control">
          <select onchange="updateSetting('severityThreshold', this.value)">
            <option value="info" ${severityThreshold === 'info' ? 'selected' : ''}>Info</option>
            <option value="low" ${severityThreshold === 'low' ? 'selected' : ''}>Low</option>
            <option value="medium" ${severityThreshold === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${severityThreshold === 'high' ? 'selected' : ''}>High</option>
            <option value="critical" ${severityThreshold === 'critical' ? 'selected' : ''}>Critical</option>
          </select>
        </div>
      </div>

      <div class="button-group" style="margin-top: 20px;">
        <button class="secondary" onclick="openSettings()">Open Advanced Settings</button>
      </div>
    </div>
  </div>

  <button class="refresh-button" onclick="refresh()" title="Refresh">
    🔄
  </button>

  <script>
    const vscode = acquireVsCodeApi();

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'showError':
          const errorDiv = document.getElementById('error-message');
          if (errorDiv) {
            errorDiv.textContent = message.message;
            errorDiv.style.display = 'block';
          }
          break;
      }
    });

    function switchAuthTab(tab) {
      // Update tab buttons
      document.querySelectorAll('.auth-tab').forEach(btn => {
        btn.classList.remove('active');
      });
      event.target.classList.add('active');

      // Update panels
      document.querySelectorAll('.auth-panel').forEach(panel => {
        panel.classList.remove('active');
      });
      document.getElementById('auth-' + tab).classList.add('active');

      // Clear any errors
      const errorDiv = document.getElementById('error-message');
      if (errorDiv) {
        errorDiv.style.display = 'none';
      }
    }

    function submitApiKey(event) {
      event.preventDefault();
      const apiKey = document.getElementById('apiKeyInput').value.trim();
      
      // Clear any previous errors
      const errorDiv = document.getElementById('error-message');
      if (errorDiv) {
        errorDiv.style.display = 'none';
      }

      if (!apiKey) {
        if (errorDiv) {
          errorDiv.textContent = 'Please enter an API key';
          errorDiv.style.display = 'block';
        }
        return;
      }

      if (!apiKey.startsWith('sk_live_') && !apiKey.startsWith('sk_test_')) {
        if (errorDiv) {
          errorDiv.textContent = 'Invalid API key format. Key should start with "sk_live_" or "sk_test_"';
          errorDiv.style.display = 'block';
        }
        return;
      }

      vscode.postMessage({
        command: 'submitApiKey',
        apiKey: apiKey
      });
    }

    function openTerminal() {
      vscode.postMessage({ command: 'openTerminal' });
    }

    function verifyCliAuth() {
      vscode.postMessage({ command: 'verifyCliAuth' });
    }

    function logout() {
      if (confirm('Are you sure you want to logout?')) {
        vscode.postMessage({ command: 'logout' });
      }
    }

    function updateApiKey() {
      vscode.postMessage({ command: 'updateApiKey' });
    }

    function updateSetting(setting, value) {
      vscode.postMessage({ 
        command: 'updateSetting',
        setting: setting,
        value: value
      });
    }

    function analyzeProject() {
      vscode.postMessage({ command: 'analyzeProject' });
    }

    function analyzeFile() {
      vscode.postMessage({ command: 'analyzeFile' });
    }

    function openSettings() {
      vscode.postMessage({ command: 'openSettings' });
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }
  </script>
</body>
</html>`;
  }
}