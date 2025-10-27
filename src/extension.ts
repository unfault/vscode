/**
 * Main extension entry point
 */

import * as vscode from 'vscode';
import { FaultRulesApiClient } from './apiClient';
import { FaultRulesDiagnostics } from './diagnostics';
import { FaultRulesCodeActionProvider } from './codeActions';
import { Finding, SourceFinding } from './types';
import { AuthManager } from './auth';
import { HomeViewProvider } from './homeView';

let apiClient: FaultRulesApiClient;
let authManager: AuthManager;
let diagnostics: FaultRulesDiagnostics;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let homeViewProvider: HomeViewProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('Fault Rules extension activating...');
  
  // Initialize components
  outputChannel = vscode.window.createOutputChannel('Fault Rules');
  authManager = new AuthManager(context, outputChannel);
  apiClient = new FaultRulesApiClient(authManager, outputChannel);
  diagnostics = new FaultRulesDiagnostics();
  homeViewProvider = new HomeViewProvider(context, authManager);
  
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'fault-rules.showHome';
  statusBarItem.text = '$(shield) Fault Rules';
  statusBarItem.tooltip = 'Click to open Fault Rules home';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register code actions provider
  const codeActionProvider = new FaultRulesCodeActionProvider(apiClient);
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file' },
      codeActionProvider,
      {
        providedCodeActionKinds: FaultRulesCodeActionProvider.providedCodeActionKinds,
      }
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('fault-rules.showHome', showHome),
    vscode.commands.registerCommand('fault-rules.login', login),
    vscode.commands.registerCommand('fault-rules.logout', logout),
    vscode.commands.registerCommand('fault-rules.updateApiKey', updateApiKey),
    vscode.commands.registerCommand('fault-rules.analyzeFile', analyzeCurrentFile),
    vscode.commands.registerCommand('fault-rules.analyzeProject', analyzeProject),
    vscode.commands.registerCommand('fault-rules.showReadinessScore', showReadinessScore),
    vscode.commands.registerCommand('fault-rules.explainRule', explainRule),
    vscode.commands.registerCommand('fault-rules.explainBatch', explainBatch),
    vscode.commands.registerCommand('fault-rules.applyFix', applyFix),
    vscode.commands.registerCommand('fault-rules.applyProposedFix', applyProposedFix)
  );

  // Register document save handler
  const config = vscode.workspace.getConfiguration('faultRules');
  if (config.get<boolean>('autoAnalyze', true)) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(onDocumentSave)
    );
  }

  // Initialize authentication and check API health
  initializeAuth();

  context.subscriptions.push(diagnostics);
  context.subscriptions.push(outputChannel);

  console.log('Fault Rules extension activated');
}

export function deactivate() {
  console.log('Fault Rules extension deactivated');
}

/**
 * Initialize authentication
 */
async function initializeAuth() {
  const authStatus = await authManager.initialize();
  
  if (!authStatus.authenticated) {
    outputChannel.appendLine('User is not authenticated');
    
    // Show home screen for authentication
    await homeViewProvider.show();
  } else {
    outputChannel.appendLine(`Authenticated via ${authStatus.method}`);
    // Check API health
    checkApiHealth();
  }
}

/**
 * Show home screen
 */
async function showHome() {
  await homeViewProvider.show();
}

/**
 * Check if API is reachable
 */
async function checkApiHealth() {
  const isHealthy = await apiClient.healthCheck();
  if (!isHealthy) {
    const config = vscode.workspace.getConfiguration('faultRules');
    const endpoint = config.get<string>('apiEndpoint');
    
    vscode.window.showWarningMessage(
      `Cannot connect to Fault Rules API at ${endpoint}. Some features may not work.`,
      'Open Settings'
    ).then(action => {
      if (action === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'faultRules.apiEndpoint');
      }
    });
  }
}

/**
 * Check if user is authenticated, prompt if not
 */
async function ensureAuthenticated(): Promise<boolean> {
  if (authManager.isAuthenticated()) {
    return true;
  }

  const choice = await vscode.window.showWarningMessage(
    'You need to authenticate to use Fault Rules features.',
    'Login Now',
    'Cancel'
  );

  if (choice === 'Login Now') {
    const result = await authManager.promptAuthentication();
    return result.authenticated;
  }

  return false;
}

/**
 * Login command
 */
async function login() {
  const result = await authManager.promptAuthentication();
  if (result.authenticated) {
    // Check API health after successful login
    checkApiHealth();
  }
}

/**
 * Logout command
 */
async function logout() {
  await authManager.logout();
  statusBarItem.text = '$(shield) Fault Rules';
  statusBarItem.tooltip = 'Click to login';
}

/**
 * Update API key command
 */
async function updateApiKey() {
  await authManager.updateApiKey();
}

/**
 * Analyze current file
 */
async function analyzeCurrentFile() {
  // Check authentication first
  if (!(await ensureAuthenticated())) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const document = editor.document;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    vscode.window.showWarningMessage('File is not in a workspace');
    return;
  }

  const relativePath = vscode.workspace.asRelativePath(document.uri);
  outputChannel.appendLine(`Analyzing file: ${relativePath}`);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Analyzing file...',
        cancellable: false,
      },
      async () => {
        const config = vscode.workspace.getConfiguration('faultRules');
        const content = document.getText();
        const result = await apiClient.analyzeFiles({
          files: [{
            path: relativePath,
            content: content
          }],
          options: {
            severity_threshold: config.get('severityThreshold', 'info'),
          },
        });

        diagnostics.updateDiagnostics(
          workspaceFolder.uri.fsPath,
          result.findings
        );

        const count = result.findings.length;
        outputChannel.appendLine(`Found ${count} issue${count !== 1 ? 's' : ''}`);
        
        vscode.window.showInformationMessage(
          `Analysis complete: ${count} issue${count !== 1 ? 's' : ''} found`
        );
      }
    );
  } catch (error: any) {
    outputChannel.appendLine(`Error: ${error.message}`);
    vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
  }
}

/**
 * Analyze entire project
 */
async function analyzeProject() {
  // Check authentication first
  if (!(await ensureAuthenticated())) {
    return;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage('No workspace folder open');
    return;
  }

  const workspaceFolder = workspaceFolders[0];
  outputChannel.appendLine(`Analyzing project: ${workspaceFolder.uri.fsPath}`);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Analyzing project...',
        cancellable: false,
      },
      async () => {
        const config = vscode.workspace.getConfiguration('faultRules');
        const result = await apiClient.analyzeProject({
          root_path: workspaceFolder.uri.fsPath,
          options: {
            exclude_patterns: config.get('excludePatterns', []),
            max_file_size: config.get('maxFileSize', 1048576),
          },
        });

        diagnostics.updateDiagnostics(
          workspaceFolder.uri.fsPath,
          result.findings
        );

        // Update status bar with score
        const score = result.report.overall_score;
        statusBarItem.text = `$(shield) ${score.toFixed(0)}% Ready`;
        statusBarItem.tooltip = result.report.summary;

        // Show summary
        const count = result.findings.length;
        outputChannel.appendLine(`Found ${count} issue${count !== 1 ? 's' : ''}`);
        outputChannel.appendLine(`Production Readiness Score: ${score.toFixed(1)}%`);
        
        vscode.window.showInformationMessage(
          `Analysis complete: ${score.toFixed(0)}% production ready (${count} issues)`
        );

        // Offer to show report
        showReadinessReport(result);
      }
    );
  } catch (error: any) {
    outputChannel.appendLine(`Error: ${error.message}`);
    vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
  }
}

/**
 * Show production readiness score
 */
async function showReadinessScore() {
  await analyzeProject();
}

/**
 * Show detailed readiness report
 */
function showReadinessReport(result: any) {
  const panel = vscode.window.createWebviewPanel(
    'faultRulesReport',
    'Production Readiness Report',
    vscode.ViewColumn.Two,
    { enableScripts: true }
  );

  const report = result.report;
  const score = report.overall_score;
  const scoreColor = score >= 80 ? '#4caf50' : score >= 60 ? '#ff9800' : '#f44336';

  panel.webview.html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          padding: 20px;
        }
        .score {
          font-size: 72px;
          font-weight: bold;
          color: ${scoreColor};
          text-align: center;
          margin: 20px 0;
        }
        .summary {
          text-align: center;
          font-size: 18px;
          margin-bottom: 30px;
        }
        .vital-score {
          margin: 10px 0;
          padding: 10px;
          background: var(--vscode-editor-background);
          border-radius: 4px;
        }
        .vital-name {
          font-weight: bold;
          margin-bottom: 5px;
        }
        .score-bar {
          height: 20px;
          background: var(--vscode-input-background);
          border-radius: 10px;
          overflow: hidden;
        }
        .score-fill {
          height: 100%;
          background: ${scoreColor};
          transition: width 0.3s;
        }
        h2 {
          margin-top: 30px;
          border-bottom: 1px solid var(--vscode-panel-border);
          padding-bottom: 10px;
        }
        .bundle-card {
          margin: 15px 0;
          padding: 15px;
          background: var(--vscode-editor-background);
          border-left: 4px solid var(--vscode-textLink-foreground);
          border-radius: 4px;
        }
        .bundle-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .bundle-priority {
          font-size: 11px;
          font-weight: bold;
          padding: 2px 8px;
          background: var(--vscode-badge-background);
          border-radius: 10px;
        }
        .bundle-tagline {
          color: var(--vscode-descriptionForeground);
          margin-bottom: 10px;
          font-size: 14px;
        }
        .bundle-metrics {
          display: flex;
          gap: 15px;
          font-size: 13px;
          color: var(--vscode-descriptionForeground);
        }
        .bundle-metric {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .metric-icon {
          font-size: 14px;
        }
        .finding {
          margin: 15px 0;
          padding: 15px;
          background: var(--vscode-editor-background);
          border-left: 3px solid;
          border-radius: 4px;
        }
        .finding.critical { border-color: #f44336; }
        .finding.high { border-color: #ff9800; }
        .finding.medium { border-color: #ffeb3b; }
        .finding.low { border-color: #4caf50; }
      </style>
    </head>
    <body>
      <h1>Production Readiness Report</h1>
      <div class="score">${score.toFixed(0)}%</div>
      <div class="summary">${report.summary}</div>

      <h2>🎯 Production Vitals Health Check</h2>
      ${Object.entries(report.vital_scores as Record<string, number>)
        .map(([vital, vitalScore]: [string, number]) => `
          <div class="vital-score">
            <div class="vital-name">${vital}</div>
            <div class="score-bar">
              <div class="score-fill" style="width: ${vitalScore}%"></div>
            </div>
            <div>${vitalScore.toFixed(0)}%</div>
          </div>
        `).join('')}

      ${result.bundles && result.bundles.length > 0 ? `
        <h2>📦 Quick Fix Bundles</h2>
        ${result.bundles
          .map((bundle: any) => {
            const priorityColor = bundle.priority === 'now' ? '#f44336' :
                                  bundle.priority === 'soon' ? '#ff9800' : '#4caf50';
            const priorityIcon = bundle.priority === 'now' ? '🔥' :
                                 bundle.priority === 'soon' ? '⚡' : '💡';
            return `
              <div class="bundle-card">
                <div class="bundle-header">
                  <span class="bundle-priority" style="color: ${priorityColor}">
                    ${priorityIcon} ${bundle.priority?.toUpperCase() || 'LATER'}
                  </span>
                  <strong>${bundle.title}</strong>
                </div>
                <div class="bundle-tagline">${bundle.tagline}</div>
                <div class="bundle-metrics">
                  <span class="bundle-metric">
                    <span class="metric-icon">🔧</span>
                    ${bundle.contains.length} fix${bundle.contains.length !== 1 ? 'es' : ''}
                  </span>
                  ${bundle.estimated_effort_minutes ? `
                    <span class="bundle-metric">
                      <span class="metric-icon">⏱️</span>
                      ${bundle.estimated_effort_minutes} min
                    </span>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
      ` : ''}

      <h2>Critical Findings (${report.critical_findings.length})</h2>
      ${report.critical_findings
        .map((finding: Finding) => `
          <div class="finding ${finding.severity}">
            <strong>${finding.title}</strong>
            <p>${finding.why}</p>
            ${finding.next ? `<p><em>→ ${finding.next}</em></p>` : ''}
          </div>
        `).join('')}
    </body>
    </html>
  `;
}

/**
 * Explain a rule
 */
async function explainRule(ruleId: string) {
  try {
    let explanation = await apiClient.explainItem(ruleId, 'normal');
    
    // Handle JSON-encoded strings (strings with escaped newlines)
    if (typeof explanation === 'string' && explanation.startsWith('"') && explanation.endsWith('"')) {
      try {
        explanation = JSON.parse(explanation);
      } catch {
        // If parsing fails, it might just be a regular string
      }
    }
    
    const panel = vscode.window.createWebviewPanel(
      'faultRulesExplanation',
      `Rule: ${ruleId}`,
      vscode.ViewColumn.Two,
      { enableScripts: false }
    );

    // Convert markdown to HTML (simple conversion)
    const htmlContent = explanation
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/```(\w+)?\n([\s\S]+?)```/g, '<pre><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    panel.webview.html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            padding: 20px;
            line-height: 1.6;
          }
          h1 {
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          h2 {
            margin-top: 30px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 5px;
            margin-bottom: 15px;
          }
          h3 {
            margin-top: 20px;
            margin-bottom: 10px;
          }
          code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
          }
          pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 15px 0;
          }
          pre code {
            background: none;
            padding: 0;
          }
          p {
            margin: 10px 0;
          }
          strong {
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <p>${htmlContent}</p>
      </body>
      </html>
    `;
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to load explanation: ${error.message}`);
  }
}

/**
 * Explain multiple rules at once (batch operation)
 */
async function explainBatch(ruleIds: string[], findings: Finding[]) {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Loading explanations...',
        cancellable: false,
      },
      async () => {
        const explanations = await apiClient.explainBatch(ruleIds, 'normal');
        
        const panel = vscode.window.createWebviewPanel(
          'faultRulesExplanation',
          'Operational Posture Explained',
          vscode.ViewColumn.Two,
          { enableScripts: false }
        );

        // Build combined explanation HTML
        let combinedHtml = '<h1>📚 Operational Posture Explanation</h1>';
        combinedHtml += `<p><em>Explaining ${findings.length} finding${findings.length !== 1 ? 's' : ''} across ${ruleIds.length} rule${ruleIds.length !== 1 ? 's' : ''}</em></p>`;
        
        // Group findings by rule
        const findingsByRule = new Map<string, Finding[]>();
        for (const finding of findings) {
          const ruleId = finding.rule_id || finding.title;
          if (!findingsByRule.has(ruleId)) {
            findingsByRule.set(ruleId, []);
          }
          findingsByRule.get(ruleId)!.push(finding);
        }

        // Display each rule's explanation
        for (const ruleId of ruleIds) {
          const explanation = explanations[ruleId];
          const relatedFindings = findingsByRule.get(ruleId) || [];
          
          if (explanation) {
            combinedHtml += '<div class="rule-section">';
            combinedHtml += `<h2>📋 ${ruleId}</h2>`;
            
            if (relatedFindings.length > 0) {
              combinedHtml += `<div class="finding-count">Found in ${relatedFindings.length} location${relatedFindings.length !== 1 ? 's' : ''}</div>`;
            }
            
            // Convert markdown to HTML
            const htmlContent = explanation
              .replace(/^# (.+)$/gm, '<h3>$1</h3>')
              .replace(/^## (.+)$/gm, '<h4>$1</h4>')
              .replace(/^### (.+)$/gm, '<h5>$1</h5>')
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.+?)\*/g, '<em>$1</em>')
              .replace(/```(\w+)?\n([\s\S]+?)```/g, '<pre><code>$2</code></pre>')
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\n\n/g, '</p><p>')
              .replace(/\n/g, '<br>');
            
            combinedHtml += `<div class="explanation-content"><p>${htmlContent}</p></div>`;
            combinedHtml += '</div>';
          }
        }

        panel.webview.html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                padding: 20px;
                line-height: 1.6;
              }
              h1 {
                border-bottom: 2px solid var(--vscode-panel-border);
                padding-bottom: 10px;
                margin-bottom: 20px;
              }
              h2 {
                margin-top: 40px;
                border-bottom: 1px solid var(--vscode-panel-border);
                padding-bottom: 8px;
                margin-bottom: 15px;
                color: var(--vscode-textLink-foreground);
              }
              h3 {
                margin-top: 20px;
                margin-bottom: 10px;
              }
              h4 {
                margin-top: 15px;
                margin-bottom: 8px;
              }
              h5 {
                margin-top: 10px;
                margin-bottom: 5px;
              }
              .rule-section {
                margin-bottom: 30px;
                padding: 20px;
                background: var(--vscode-editor-background);
                border-radius: 6px;
              }
              .finding-count {
                display: inline-block;
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 12px;
                margin-bottom: 15px;
              }
              .explanation-content {
                margin-top: 15px;
              }
              code {
                background: var(--vscode-textCodeBlock-background);
                padding: 2px 6px;
                border-radius: 3px;
                font-family: var(--vscode-editor-font-family);
              }
              pre {
                background: var(--vscode-textCodeBlock-background);
                padding: 12px;
                border-radius: 4px;
                overflow-x: auto;
                margin: 15px 0;
              }
              pre code {
                background: none;
                padding: 0;
              }
              p {
                margin: 10px 0;
              }
              strong {
                font-weight: bold;
              }
            </style>
          </head>
          <body>
            ${combinedHtml}
          </body>
          </html>
        `;
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to load explanations: ${error.message}`);
  }
}

/**
 * Apply a fix
 */
async function applyFix(finding: Finding, uri: vscode.Uri) {
  try {
    // If we have a diff in the finding, show it and apply
    if (finding.diff) {
      const choice = await vscode.window.showInformationMessage(
        `Apply fix for: ${finding.title}?`,
        { modal: true },
        'Apply',
        'Preview'
      );

      if (choice === 'Preview') {
        const doc = await vscode.workspace.openTextDocument({
          content: finding.diff,
          language: 'diff',
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
        return;
      }

      if (choice === 'Apply') {
        // Apply the diff
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (workspaceFolder && finding.kind === 'source') {
          const sourceFinding = finding as SourceFinding;
          const patchOp = {
            kind: 'unified_diff' as const,
            path: sourceFinding.file,
            content: finding.diff!,
          };
          
          const { applyPatchOp } = await import('./codeActions');
          await applyPatchOp(patchOp, workspaceFolder.uri.fsPath);
        }
      }
    } else {
      vscode.window.showWarningMessage('No fix available for this finding');
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to apply fix: ${error.message}`);
  }
}

/**
 * Apply a proposed fix from proposed_fixes array
 */
async function applyProposedFix(proposedFix: any, finding: Finding, uri: vscode.Uri) {
  try {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      vscode.window.showWarningMessage('File is not in a workspace');
      return;
    }

    // Handle patch_set type
    if (proposedFix.type === 'patch_set') {
      // First, validate with /fixes/preview endpoint (CRITICAL for safety)
      let previewResult;
      try {
        outputChannel.appendLine(`Validating patch: ${proposedFix.id}`);
        
        // Get file path and current content for validation
        const filePath = finding.kind === 'source'
          ? (finding as SourceFinding).file
          : uri.fsPath;
        const document = await vscode.workspace.openTextDocument(uri);
        const currentContent = document.getText();
        
        previewResult = await apiClient.previewPatch(proposedFix.id, filePath, currentContent, true);
        
        // Check if patch can be applied safely
        if (!previewResult.can_apply) {
          const conflicts = previewResult.conflicts.join('\n• ');
          vscode.window.showErrorMessage(
            `Cannot apply fix: ${finding.title}\n\nConflicts detected:\n• ${conflicts}`,
            { modal: true }
          );
          return;
        }
      } catch (error: any) {
        outputChannel.appendLine(`Preview validation failed: ${error.message}`);
        // If preview fails, warn user but allow them to proceed
        const proceed = await vscode.window.showWarningMessage(
          `Could not validate patch safety: ${error.message}\n\nDo you want to proceed anyway?`,
          { modal: true },
          'Proceed Anyway',
          'Cancel'
        );
        
        if (proceed !== 'Proceed Anyway') {
          return;
        }
      }
      
      const choice = await vscode.window.showInformationMessage(
        `Apply fix: ${finding.title}?${proposedFix.estimated_effort_minutes ? ` (~${proposedFix.estimated_effort_minutes} min)` : ''}`,
        { modal: true },
        'Apply',
        'Preview',
        'Cancel'
      );

      if (choice === 'Cancel' || !choice) {
        return;
      }

      if (choice === 'Preview') {
        // Use server-validated preview if available
        let previewContent = `# Fix Preview: ${finding.title}\n\n`;
        
        if (previewResult && previewResult.diffs && previewResult.diffs.length > 0) {
          // Use server-generated preview (validated and safe)
          previewContent += `✅ **Validation Status:** ${previewResult.can_apply ? 'Safe to apply' : 'Conflicts detected'}\n`;
          previewContent += `**Total Changes:** +${previewResult.total_additions} -${previewResult.total_deletions}\n`;
          previewContent += `**Risk:** ${proposedFix.risk || 'unknown'}\n`;
          previewContent += `**Confidence:** ${proposedFix.confidence ? (proposedFix.confidence * 100).toFixed(0) + '%' : 'unknown'}\n\n`;
          
          if (!previewResult.can_apply && previewResult.conflicts.length > 0) {
            previewContent += `## ⚠️ Conflicts\n\n`;
            for (const conflict of previewResult.conflicts) {
              previewContent += `- ${conflict}\n`;
            }
            previewContent += `\n`;
          }
          
          for (const diff of previewResult.diffs) {
            previewContent += `## File: ${diff.file_path}\n\n`;
            previewContent += `Changes: +${diff.additions} -${diff.deletions}\n\n`;
            previewContent += '```diff\n';
            previewContent += diff.diff_content;
            previewContent += '\n```\n\n';
          }
        } else {
          // Fallback to local preview (less safe)
          previewContent += `⚠️ **Validation Status:** Not validated (showing local preview)\n`;
          previewContent += `**Risk:** ${proposedFix.risk || 'unknown'}\n`;
          previewContent += `**Confidence:** ${proposedFix.confidence ? (proposedFix.confidence * 100).toFixed(0) + '%' : 'unknown'}\n`;
          previewContent += `**Estimated effort:** ${proposedFix.estimated_effort_minutes || 'unknown'} minutes\n\n`;
          
          for (const op of proposedFix.ops) {
            previewContent += `## File: ${op.path}\n\n`;
            previewContent += '```diff\n';
            previewContent += op.content;
            previewContent += '\n```\n\n';
          }
        }

        const doc = await vscode.workspace.openTextDocument({
          content: previewContent,
          language: 'markdown',
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
        return;
      }

      if (choice === 'Apply') {
        // Import and apply the patch set
        const { applyPatchSet } = await import('./codeActions');
        await applyPatchSet(proposedFix, workspaceFolder.uri.fsPath);
      }
    }
    // Handle command_set type
    else if (proposedFix.type === 'command_set') {
      const choice = await vscode.window.showWarningMessage(
        `Run commands for: ${finding.title}?\n\nThis will execute ${proposedFix.steps.length} command(s) in your terminal.`,
        { modal: true },
        'Run',
        'Show Commands',
        'Cancel'
      );

      if (choice === 'Cancel' || !choice) {
        return;
      }

      if (choice === 'Show Commands') {
        let commandsContent = `# Commands for: ${finding.title}\n\n`;
        commandsContent += `**Shell:** ${proposedFix.shell || 'bash'}\n`;
        commandsContent += `**Risk:** ${proposedFix.risk || 'unknown'}\n\n`;
        
        for (let i = 0; i < proposedFix.steps.length; i++) {
          const step = proposedFix.steps[i];
          commandsContent += `## Step ${i + 1}${step.name ? `: ${step.name}` : ''}\n\n`;
          commandsContent += '```bash\n';
          commandsContent += step.run;
          commandsContent += '\n```\n\n';
        }

        const doc = await vscode.workspace.openTextDocument({
          content: commandsContent,
          language: 'markdown',
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
        return;
      }

      if (choice === 'Run') {
        // Create a terminal and run commands
        const terminal = vscode.window.createTerminal({
          name: `Fault Rules: ${finding.title}`,
          cwd: workspaceFolder.uri.fsPath,
        });
        terminal.show();

        for (const step of proposedFix.steps) {
          if (step.name) {
            terminal.sendText(`echo "==> ${step.name}"`);
          }
          terminal.sendText(step.run);
        }

        vscode.window.showInformationMessage(
          `Commands sent to terminal. Please verify the results.`
        );
      }
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to apply fix: ${error.message}`);
  }
}

/**
 * Handle document save
 */
async function onDocumentSave(document: vscode.TextDocument) {
  // Skip non-file schemes
  if (document.uri.scheme !== 'file') {
    return;
  }

  // Check if this is a supported language
  const supportedLanguages = ['python', 'javascript', 'typescript', 'go', 'rust', 'java'];
  if (!supportedLanguages.includes(document.languageId)) {
    return;
  }

  // Analyze the saved file
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return;
  }

  const relativePath = vscode.workspace.asRelativePath(document.uri);
  
  try {
    const config = vscode.workspace.getConfiguration('faultRules');
    const content = document.getText();
    const result = await apiClient.analyzeFiles({
      files: [{
        path: relativePath,
        content: content
      }],
      options: {
        severity_threshold: config.get('severityThreshold', 'info'),
      },
    });

    diagnostics.updateDiagnostics(
      workspaceFolder.uri.fsPath,
      result.findings
    );
  } catch (error: any) {
    // Silently fail on auto-save analysis
    outputChannel.appendLine(`Auto-analysis failed: ${error.message}`);
  }
}