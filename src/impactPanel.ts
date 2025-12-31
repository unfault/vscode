/**
 * Impact Panel for showing detailed function impact information
 */

import * as vscode from 'vscode';

/**
 * Impact data structure
 */
export interface FunctionImpactData {
  name: string;
  callers: Array<{
    name: string;
    file: string;
    depth: number;
  }>;
  routes: Array<{
    method: string;
    path: string;
  }>;
  findings: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    learnMore?: string;
  }>;
}

export class ImpactPanel {
  public static currentPanel: ImpactPanel | undefined;
  public static readonly viewType = 'unfault.impact';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, impactData: FunctionImpactData) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    const panel = vscode.window.createWebviewPanel(
      ImpactPanel.viewType,
      `Impact: ${impactData.name}`,
      column || vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: true
      }
    );

    ImpactPanel.currentPanel = new ImpactPanel(panel, extensionUri, impactData);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, impactData: FunctionImpactData) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._update(impactData);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'openFile':
            if (message.filePath) {
              const workspaceFolders = vscode.workspace.workspaceFolders;
              if (workspaceFolders && workspaceFolders.length > 0) {
                const filePath = vscode.Uri.joinPath(workspaceFolders[0].uri, message.filePath);
                try {
                  const doc = await vscode.workspace.openTextDocument(filePath);
                  await vscode.window.showTextDocument(doc);
                } catch {
                  vscode.window.showWarningMessage(`Could not open file: ${message.filePath}`);
                }
              }
            }
            break;
          case 'openLink':
            if (message.url) {
              vscode.env.openExternal(vscode.Uri.parse(message.url));
            }
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public dispose() {
    ImpactPanel.currentPanel = undefined;
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _update(impactData: FunctionImpactData) {
    this._panel.title = `Impact: ${impactData.name}`;
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, impactData);
  }

  private _getHtmlForWebview(webview: vscode.Webview, impactData: FunctionImpactData): string {
    const severityIcon = {
      error: '🔴',
      warning: '🟡',
      info: 'ℹ️'
    };

    const callersHtml = impactData.callers.length > 0
      ? impactData.callers.map(caller => `
          <div class="caller-item" onclick="openFile('${caller.file}')">
            <span class="caller-name">${caller.name}</span>
            <span class="caller-depth">Depth: ${caller.depth}</span>
            <span class="caller-file">${caller.file}</span>
          </div>
        `).join('')
      : '<div class="empty-state">No callers found</div>';

    const routesHtml = impactData.routes.length > 0
      ? impactData.routes.map(route => `
          <div class="route-item">
            <span class="route-method">${route.method}</span>
            <span class="route-path">${route.path}</span>
          </div>
        `).join('')
      : '<div class="empty-state">Not used by routes</div>';

    const findingsHtml = impactData.findings.length > 0
      ? impactData.findings.map(finding => `
          <div class="finding-item severity-${finding.severity}">
            <span class="finding-icon">${severityIcon[finding.severity]}</span>
            <span class="finding-message">${finding.message}</span>
            ${finding.learnMore ? `<a href="#" onclick="openLink('${finding.learnMore}')" class="finding-link">Learn more</a>` : ''}
          </div>
        `).join('')
      : '<div class="empty-state">No findings</div>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Impact: ${impactData.name}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            max-width: 600px;
            margin: 0 auto;
        }
        
        h1 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 20px;
            border-bottom: 1px solid var(--vscode-widget-border);
            padding-bottom: 12px;
        }
        
        .section {
            margin-bottom: 24px;
        }
        
        .section h2 {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .caller-item, .route-item {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            padding: 10px 12px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        .caller-item:hover {
            background: var(--vscode-editor-selectionBackground);
        }
        
        .route-item {
            cursor: default;
        }
        
        .caller-name {
            font-weight: 600;
            display: block;
        }
        
        .caller-depth, .caller-file {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-left: 0;
        }
        
        .caller-file {
            display: block;
            margin-top: 4px;
        }
        
        .route-method {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: 600;
            margin-right: 8px;
        }
        
        .route-path {
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
        }
        
        .finding-item {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            padding: 10px 12px;
            margin-bottom: 8px;
            border-left: 3px solid var(--vscode-editor-selectionBackground);
        }
        
        .finding-item.severity-error {
            border-left-color: var(--vscode-errorForeground);
        }
        
        .finding-item.severity-warning {
            border-left-color: var(--vscode-editorWarning-foreground);
        }
        
        .finding-item.severity-info {
            border-left-color: var(--vscode-editorInfo-foreground);
        }
        
        .finding-icon {
            margin-right: 8px;
        }
        
        .finding-message {
            font-size: 13px;
        }
        
        .finding-link {
            font-size: 12px;
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            margin-left: 8px;
        }
        
        .finding-link:hover {
            text-decoration: underline;
        }
        
        .empty-state {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            font-size: 13px;
            padding: 10px 12px;
        }
        
        .stats {
            display: flex;
            gap: 16px;
            margin-bottom: 20px;
        }
        
        .stat-item {
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 10px 16px;
            border-radius: 6px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 20px;
            font-weight: 600;
            display: block;
        }
        
        .stat-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
        }
    </style>
</head>
<body>
    <h1>📊 ${impactData.name}</h1>
    
    <div class="stats">
        <div class="stat-item">
            <span class="stat-value">${impactData.callers.length}</span>
            <span class="stat-label">Callers</span>
        </div>
        <div class="stat-item">
            <span class="stat-value">${impactData.routes.length}</span>
            <span class="stat-label">Routes</span>
        </div>
        <div class="stat-item">
            <span class="stat-value">${impactData.findings.length}</span>
            <span class="stat-label">Findings</span>
        </div>
    </div>
    
    <div class="section">
        <h2>🔗 Callers</h2>
        ${callersHtml}
    </div>
    
    <div class="section">
        <h2>🛤️ Routes</h2>
        ${routesHtml}
    </div>
    
    <div class="section">
        <h2>💡 Findings</h2>
        ${findingsHtml}
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function openFile(filePath) {
            vscode.postMessage({ command: 'openFile', filePath });
        }
        
        function openLink(url) {
            vscode.postMessage({ command: 'openLink', url });
        }
    </script>
</body>
</html>`;
  }
}
