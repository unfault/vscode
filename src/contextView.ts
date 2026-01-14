import * as vscode from 'vscode';

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
    slos?: Array<{
      name: string;
      provider: string;
      target_percent?: number;
      error_budget_remaining?: number;
      dashboard_url?: string;
    }>;
  }>;
  findings: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    learnMore?: string;
  }>;
  insights?: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
  }>;
  /** @deprecated Use upstreamInsights and downstreamInsights instead */
  pathInsights?: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
  }>;
  /** Human-friendly insights about issues in upstream callers */
  upstreamInsights?: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    /** Optional: detailed title of the underlying finding */
    title?: string;
    /** Optional: full description explaining the issue */
    description?: string;
    /** Optional: file path where the issue occurs */
    file?: string;
    /** Optional: line number (1-based) */
    line?: number;
    /** Optional: rule ID for documentation lookup */
    ruleId?: string;
  }>;
  /** Human-friendly insights about issues in downstream callees */
  downstreamInsights?: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    /** Optional: detailed title of the underlying finding */
    title?: string;
    /** Optional: full description explaining the issue */
    description?: string;
    /** Optional: file path where the issue occurs */
    file?: string;
    /** Optional: line number (1-based) */
    line?: number;
    /** Optional: rule ID for documentation lookup */
    ruleId?: string;
  }>;
}

export interface FileCentralityNotification {
  path: string;
  in_degree: number;
  out_degree: number;
  importance_score: number;
  total_files: number;
  label: string;
}

export interface FileDependenciesNotification {
  path: string;
  direct_dependents: string[];
  all_dependents: string[];
  total_count: number;
  summary: string;
}

type ServerState = 'starting' | 'running' | 'stopped' | 'error';

interface ContextViewState {
  serverState: ServerState;
  activeFile: {
    uri: string | null;
    languageId: string | null;
  };
  centrality: FileCentralityNotification | null;
  dependencies: FileDependenciesNotification | null;
  activeImpact: FunctionImpactData | null;
  pinnedImpact: FunctionImpactData | null;
}

export class ContextView implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private serverState: ServerState = 'starting';
  private activeEditor: vscode.TextEditor | null = null;
  private centrality: FileCentralityNotification | null = null;
  private dependencies: FileDependenciesNotification | null = null;
  private activeImpact: FunctionImpactData | null = null;
  private pinnedImpact: FunctionImpactData | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {}

  setServerState(state: ServerState) {
    this.serverState = state;
    this.postState();
  }

  setActiveEditor(editor: vscode.TextEditor | null) {
    this.activeEditor = editor;
    this.activeImpact = null;
    this.pinnedImpact = null;
    this.postState();
  }

  setCentrality(centrality: FileCentralityNotification | null) {
    this.centrality = centrality;
    this.postState();
  }

  setDependencies(dependencies: FileDependenciesNotification | null) {
    this.dependencies = dependencies;
    this.postState();
  }

  setActiveImpact(impact: FunctionImpactData | null) {
    this.activeImpact = impact;
    this.postState();
  }

  setPinnedImpact(impact: FunctionImpactData | null) {
    this.pinnedImpact = impact;
    this.postState();
  }

  clearPinnedImpact() {
    this.pinnedImpact = null;
    this.postState();
  }

  isPinned(): boolean {
    return this.pinnedImpact !== null;
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'openFile':
          if (typeof message.filePath === 'string') {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
              const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, message.filePath);
              try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(doc);
              } catch {
                vscode.window.showWarningMessage(`Could not open file: ${message.filePath}`);
              }
            }
          }
          break;
        case 'openLink':
          if (typeof message.url === 'string') {
            vscode.env.openExternal(vscode.Uri.parse(message.url));
          }
          break;
        case 'pinImpact':
          if (message.impact) {
            this.setPinnedImpact(message.impact as FunctionImpactData);
          }
          break;
        case 'unpinImpact':
          this.clearPinnedImpact();
          break;
        case 'showDependents':
          vscode.commands.executeCommand('unfault.showDependents');
          break;
        case 'ready':
          // The webview script is loaded; send the current state now.
          this.postState();
          break;
      }
    });
  }

  private getState(): ContextViewState {
    return {
      serverState: this.serverState,
      activeFile: {
        uri: this.activeEditor?.document.uri.toString() ?? null,
        languageId: this.activeEditor?.document.languageId ?? null
      },
      centrality: this.centrality,
      dependencies: this.dependencies,
      activeImpact: this.activeImpact,
      pinnedImpact: this.pinnedImpact
    };
  }

  private postState() {
    if (!this.view) {
      return;
    }

    this.view.webview.postMessage({
      type: 'state',
      state: this.getState()
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = String(Date.now());

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Unfault: Context</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 8px;
      margin: 0;
      font-size: 12px;
    }

    .muted { color: var(--vscode-descriptionForeground); }

    .section { margin-bottom: 8px; }
    .section-label {
      font-size: 9px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin: 0 0 6px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .section-hint {
      font-size: 8px;
      text-transform: lowercase;
      letter-spacing: normal;
      opacity: 0.7;
    }

    .card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 4px;
      padding: 8px 10px;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 2px;
    }

    .card-title {
      font-weight: 500;
      margin: 0;
      font-size: 12px;
      color: var(--vscode-foreground);
    }

    .card-subtitle {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
    }

    .card-meta {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: baseline;
    }

    .button {
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      border: none;
      background: transparent;
      padding: 0;
      font-size: 10px;
      font-family: inherit;
    }
    .button:hover { text-decoration: underline; }

    .divider { 
      height: 1px; 
      background: var(--vscode-widget-border); 
      margin: 8px 0; 
    }

    .deps-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .deps-count {
      font-size: 11px;
      color: var(--vscode-foreground);
    }
    .deps-count strong {
      font-weight: 600;
    }

    .deps-direct {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    /* Symbol card */
    .symbol-name {
      font-weight: 500;
      font-family: var(--vscode-editor-font-family);
      color: #dcdcaa;
      font-size: 12px;
    }

    .story { 
      margin: 6px 0; 
      line-height: 1.5; 
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .story strong { color: var(--vscode-foreground); }

    /* Caller table */
    .caller-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 11px;
    }
    .caller-table th {
      text-align: left;
      font-weight: 500;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      padding: 2px 6px;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .caller-table th:last-child {
      text-align: right;
      width: 40px;
    }
    .caller-table tr {
      cursor: pointer;
    }
    .caller-table tr:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .caller-table td {
      padding: 3px 6px;
    }
    .caller-name-cell {
      font-family: var(--vscode-editor-font-family);
      color: var(--vscode-foreground);
    }
    .caller-depth-cell {
      text-align: right;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
    }

    /* Importers list */
    .importers-list {
      margin-top: 6px;
      border-top: 1px solid var(--vscode-widget-border);
      padding-top: 6px;
    }
    .importer-item {
      padding: 2px 6px;
      cursor: pointer;
      border-radius: 3px;
      font-size: 11px;
    }
    .importer-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .importer-item.muted {
      cursor: default;
      color: var(--vscode-descriptionForeground);
    }
    .importer-item.muted:hover {
      background: transparent;
    }
    .importer-name {
      font-family: var(--vscode-editor-font-family);
      color: var(--vscode-foreground);
    }

    /* Callers list */
    .callers-list {
      margin-top: 4px;
    }

    .caller-item {
      display: block;
      padding: 4px 6px;
      border-radius: 4px;
      cursor: pointer;
      margin-bottom: 2px;
    }
    .caller-item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .caller-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }

    .caller-name {
      font-size: 11px;
      color: var(--vscode-foreground);
    }

    .caller-depth {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
    }

    .caller-file {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    /* Call Tree */
    .call-tree {
      margin-top: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
    }

    .caller-tree-item {
      padding: 2px 6px;
      cursor: pointer;
      border-radius: 4px;
    }

    .caller-tree-item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .caller-tree-item.route-item {
      cursor: default;
      font-weight: 500;
    }

    .caller-tree-item.route-item:hover {
      background: transparent;
    }

    .route-method {
      font-size: 10px;
      font-weight: 600;
      color: var(--vscode-charts-green);
      text-transform: uppercase;
    }

    .route-path {
      color: var(--vscode-foreground);
    }

    .caller-tree-item.target {
      color: var(--vscode-textLink-foreground);
      cursor: default;
    }

    .caller-tree-item.target:hover {
      background: transparent;
    }

    .tree-indent {
      color: var(--vscode-descriptionForeground);
    }

    /* SLOs */
    .slo-list {
      margin: 4px 0 8px 6px;
      padding-left: 8px;
      border-left: 2px solid var(--vscode-charts-yellow);
    }

    .slo-item {
      padding: 4px 6px;
      border-radius: 4px;
      margin-bottom: 2px;
    }

    .slo-link {
      text-decoration: none;
      display: block;
    }

    .slo-link:hover .slo-item {
      background: var(--vscode-list-hoverBackground);
    }

    .slo-name {
      font-size: 11px;
      color: var(--vscode-foreground);
    }

    .slo-meta {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    .slo-item.low-budget {
      border-left: 2px solid var(--vscode-charts-red);
      padding-left: 4px;
    }

    .slo-item.low-budget .slo-meta {
      color: var(--vscode-charts-red);
    }

    /* Signals/Findings */
    .signals-list {
      margin-top: 4px;
    }

    .signal {
      padding: 4px 6px;
      border-radius: 0 4px 4px 0;
      border-left: 3px solid var(--vscode-widget-border);
      font-size: 11px;
      margin-bottom: 4px;
    }

    .signal.error { border-left-color: var(--vscode-errorForeground); }
    .signal.warning { border-left-color: #cca700; }
    .signal.info { border-left-color: var(--vscode-editorInfo-foreground); }

    .signal-content {
      color: var(--vscode-foreground);
    }

    .signal.expandable {
      cursor: pointer;
    }

    .signal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .signal-toggle {
      font-size: 8px;
      color: var(--vscode-descriptionForeground);
      transition: transform 0.15s ease;
    }

    .signal.expanded .signal-toggle {
      transform: rotate(90deg);
    }

    .signal-detail {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid var(--vscode-widget-border);
      font-size: 11px;
    }

    .detail-title {
      font-weight: 500;
      margin-bottom: 4px;
      color: var(--vscode-foreground);
    }

    .detail-desc {
      color: var(--vscode-descriptionForeground);
      line-height: 1.4;
      margin-bottom: 6px;
      white-space: pre-wrap;
    }

    .detail-loc {
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      font-family: var(--vscode-editor-font-family);
    }

    .detail-loc:hover {
      text-decoration: underline;
    }

    /* Pinned banner */
    .pinned-banner {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 4px;
      padding: 6px 10px;
      margin-bottom: 8px;
    }

    .status-line {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div id="root"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Ask the extension for the latest state once the script is ready.
    vscode.postMessage({ command: 'ready' });

    function esc(s) {
      return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function buildSymbolStory(impact) {
      // Build a concise summary with route info and caller table
      let html = '';

      const routeCount = (impact.routes && impact.routes.length) || 0;
      const callers = impact.callers || [];

      // Route info
      if (routeCount > 0) {
        const firstRoute = impact.routes[0];
        const routeStr = firstRoute.method + ' ' + firstRoute.path;
        if (routeCount === 1) {
          html += '<p class="story">Reachable from <strong>' + esc(routeStr) + '</strong></p>';
        } else {
          html += '<p class="story">Reachable from <strong>' + esc(routeStr) + '</strong> + ' + (routeCount - 1) + ' more</p>';
        }
      }

      // Caller table
      if (callers.length > 0) {
        html += '<table class="caller-table">';
        html += '<thead><tr><th>Caller</th><th>Hops</th></tr></thead>';
        html += '<tbody>';
        for (const c of callers) {
          const funcName = c.name || c.function || 'unknown';
          html += '<tr data-action="openFile" data-file="' + esc(c.file) + '">';
          html += '<td class="caller-name-cell">' + esc(funcName) + '()</td>';
          html += '<td class="caller-depth-cell">' + c.depth + '</td>';
          html += '</tr>';
        }
        html += '</tbody></table>';
      } else if (routeCount === 0) {
        html += '<p class="story muted">No call paths found yet.</p>';
      }

      return html;
    }

    function renderSlos(impact) {
      // Collect SLOs from all routes
      const allSlos = [];
      if (impact.routes) {
        for (const route of impact.routes) {
          if (route.slos && route.slos.length > 0) {
            for (const slo of route.slos) {
              allSlos.push({ ...slo, route: route.method + ' ' + route.path });
            }
          }
        }
      }

      if (allSlos.length === 0) return '';

      const items = allSlos.slice(0, 5).map(slo => {
        const budget = slo.error_budget_remaining;
        const isLow = budget !== undefined && budget < 20;
        const budgetClass = isLow ? 'warning' : 'info';

        // Build a friendly status line
        let statusLine = '';
        if (budget !== undefined) {
          if (isLow) {
            statusLine = budget.toFixed(1) + '% error budget remaining — getting tight';
          } else if (budget > 80) {
            statusLine = 'Healthy — ' + budget.toFixed(0) + '% error budget available';
          } else {
            statusLine = budget.toFixed(0) + '% error budget remaining';
          }
        } else if (slo.target_percent !== undefined) {
          statusLine = 'Targeting ' + slo.target_percent + '% availability';
        }

        const link = slo.dashboard_url
          ? ("<button class='button' data-action='openLink' data-url='" + esc(slo.dashboard_url) + "'>Dashboard</button>")
          : '';

        return "<li>" +
          "<div class='slo-item " + budgetClass + "'>" +
          "<div class='row'>" +
          "<span style='font-size: 11px;'><strong>" + esc(slo.name) + "</strong></span>" +
          link +
          "</div>" +
          "<div class='muted' style='font-size: 10px;'>" +
          esc(slo.provider) + " · watches " + esc(slo.route) +
          (statusLine ? '<br>' + statusLine : '') +
          "</div>" +
          "</div>" +
          "</li>";
      }).join('');

      return "<div style='margin-top: 10px;'>" +
        "<div class='section-label'>What's watching this</div>" +
        "<ul class='list'>" + items + "</ul>" +
        "</div>";
    }

    function render(state) {
      const root = document.getElementById('root');
      if (!root) return;

      // Only show status if not running (error states)
      const serverLine = state.serverState !== 'running'
        ? '<div class="status-line">Server: ' + esc(state.serverState) + '</div>'
        : '';

      const pinned = state.pinnedImpact;
      const active = pinned || state.activeImpact;



      // === FILE CARD ===
      const fileName = state.centrality ? state.centrality.path.split('/').pop() : '';
      
      // Build user-friendly file label
      // - "Important file" for high centrality/many importers
      // - Otherwise just show the filename without confusing graph terms
      function buildFileLabel(centrality) {
        if (!centrality) return '';
        
        // Check if it's an important/central file (high in_degree or importance)
        const isImportant = centrality.importance_score > 0.5 || centrality.in_degree >= 5;
        if (isImportant) {
          return 'Important file';
        }
        
        // For regular files, don't show confusing labels like "Leaf file"
        // Just return empty and we'll show just the filename
        return '';
      }
      
      const fileLabel = buildFileLabel(state.centrality);
      const fileMeta = state.centrality
        ? ('Imports ' + state.centrality.out_degree)
        : '';

      // Build importers section (files that import this file)
      function buildImportersBlock() {
        if (!state.dependencies || state.dependencies.total_count === 0) return '';
        
        const importers = state.dependencies.direct_dependents || [];
        const totalCount = state.dependencies.total_count;
        
        let html = '<div class="divider"></div>';
        html += '<div class="deps-row">';
        html += '<div class="deps-count">Imported by <strong>' + totalCount + '</strong> ' + 
          (totalCount === 1 ? 'file' : 'files') + '</div>';
        html += '<button class="button" data-action="toggleImporters">Show</button>';
        html += '</div>';
        
        // Collapsible importer list (hidden by default)
        html += '<div id="importers-list" class="importers-list" style="display: none;">';
        for (const file of importers) {
          const fileName = file.split('/').pop() || file;
          html += '<div class="importer-item" data-action="openFile" data-file="' + esc(file) + '">';
          html += '<span class="importer-name">' + esc(fileName) + '</span>';
          html += '</div>';
        }
        if (totalCount > importers.length) {
          html += '<div class="importer-item muted">+' + (totalCount - importers.length) + ' more (transitive)</div>';
        }
        html += '</div>';
        
        return html;
      }

      const importersBlock = buildImportersBlock();

      const fileCardContent = state.centrality
        ? '<div class="card-header">' +
          '<span class="card-title">' + (fileLabel ? esc(fileLabel) : esc(fileName)) + '</span>' +
          (fileLabel ? '<span class="card-subtitle">' + esc(fileName) + '</span>' : '') +
          '</div>' +
          '<div class="card-meta">' + fileMeta + '</div>' +
          importersBlock
        : '<div class="muted">Open a supported file to see context.</div>';

      const fileCard = '<div class="section">' +
        '<div class="section-label">FILE</div>' +
        '<div class="card">' +
        fileCardContent +
        '</div>' +
        '</div>';

      // === FUNCTION CARD ===
      // Extract just the function name (remove file: prefix if present)
      function getFunctionName(fullName) {
        if (!fullName) return '';
        const parts = fullName.split(':');
        return parts.length > 1 ? parts[parts.length - 1] : fullName;
      }
      
      const funcName = active ? getFunctionName(active.name) : '';

      const symbolBody = active
        ? (
          '<div class="card-header">' +
          '<span class="symbol-name">' + esc(funcName) + '</span>' +
          '</div>' +
          buildSymbolStory(active) +
          renderSignals(active) +
          renderCallers(active) +
          renderPathInsights(active)
        )
        : '<div class="muted">Move your cursor inside a function to see its context.</div>';

      const symbolCard = '<div class="section">' +
        '<div class="section-label">FUNCTION</div>' +
        '<div class="card">' +
        symbolBody +
        '</div>' +
        '</div>';

      root.innerHTML = serverLine + fileCard + symbolCard;
    }

    function renderCallers(impact) {
      const hasCallers = impact.callers && impact.callers.length > 0;
      const hasRoutes = impact.routes && impact.routes.length > 0;
      
      // If no callers and no routes, nothing to show
      if (!hasCallers && !hasRoutes) return '';

      // Build a tree from the 'calls' field
      // Each caller has: name, file, depth, calls (the function it calls)
      const callers = impact.callers || [];
      const callersByName = new Map();
      for (const c of callers) {
        callersByName.set(c.name, c);
      }

      // Find root callers (highest depth = furthest from target)
      // Sort by depth descending to get the entry points first
      const sortedCallers = [...callers].sort((a, b) => b.depth - a.depth);
      
      // Build the call chain: start from highest depth, follow 'calls' to target
      function buildChain(callerName, visited = new Set()) {
        if (visited.has(callerName)) return [];
        visited.add(callerName);
        
        const caller = callersByName.get(callerName);
        if (!caller) return [];
        
        const chain = [caller];
        if (caller.calls && callersByName.has(caller.calls)) {
          chain.push(...buildChain(caller.calls, visited));
        }
        return chain;
      }

      // Get the root (entry point with highest depth)
      const rootCaller = sortedCallers[0];
      
      // Build chain from root caller, or empty if no callers
      const chain = rootCaller ? buildChain(rootCaller.name) : [];
      
      // Extract target function name (remove file: prefix if present)
      const targetFullName = impact.name || 'target';
      const targetParts = targetFullName.split(':');
      const targetFile = targetParts.length > 1 ? targetParts[0] : '';
      const targetFunc = targetParts.length > 1 ? targetParts[targetParts.length - 1] : targetFullName;

      // Render as a tree
      let treeHtml = '';
      
      // Show route at the top if available
      if (impact.routes && impact.routes.length > 0) {
        const route = impact.routes[0];
        treeHtml += "<div class='caller-tree-item route-item'>" +
          "<span class='route-method'>" + esc(route.method) + "</span> " +
          "<span class='route-path'>" + esc(route.path) + "</span>" +
          "</div>";
        
        // Show SLOs that might be impacted (deduplicate by name)
        if (route.slos && route.slos.length > 0) {
          const seenSlos = new Set();
          const uniqueSlos = route.slos.filter(slo => {
            if (seenSlos.has(slo.name)) return false;
            seenSlos.add(slo.name);
            return true;
          });
          
          treeHtml += "<div class='slo-list'>";
          for (const slo of uniqueSlos) {
            const budgetClass = slo.error_budget_remaining != null && slo.error_budget_remaining < 20 ? 'low-budget' : '';
            const budgetText = slo.error_budget_remaining != null 
              ? esc(slo.error_budget_remaining.toFixed(1)) + '% budget left'
              : '';
            const targetText = slo.target_percent != null
              ? esc(slo.target_percent.toFixed(2)) + '% target'
              : '';
            const meta = [targetText, budgetText].filter(Boolean).join(' · ');
            
            const sloContent = "<div class='slo-item " + budgetClass + "'>" +
              "<div class='slo-name'>" + esc(slo.name) + "</div>" +
              (meta ? "<div class='slo-meta'>" + meta + "</div>" : "") +
              "</div>";
            
            if (slo.dashboard_url) {
              treeHtml += "<a class='slo-link' href='" + esc(slo.dashboard_url) + "' target='_blank'>" + sloContent + "</a>";
            } else {
              treeHtml += sloContent;
            }
          }
          treeHtml += "</div>";
        }
      }

      // Render each caller in the chain
      chain.forEach((c, idx) => {
        // Indent increases for each level; first level has no connector if route shown
        const hasRoute = impact.routes && impact.routes.length > 0;
        const indentLevel = hasRoute ? idx : idx;
        const indent = '&nbsp;&nbsp;'.repeat(indentLevel);
        const connector = (idx === 0 && !hasRoute) ? '' : '└─ ';
        
        treeHtml += "<div class='caller-tree-item' data-action='openFile' data-file='" + esc(c.file) + "'>" +
          "<span class='tree-indent'>" + indent + connector + "</span>" +
          "<span class='caller-name'>" + esc(c.name) + "()</span>" +
          "</div>";
      });

      // Add the target function at the bottom with file:func() format
      const hasRoute = impact.routes && impact.routes.length > 0;
      const targetIndentLevel = hasRoute ? chain.length : chain.length;
      const targetIndent = '&nbsp;&nbsp;'.repeat(targetIndentLevel);
      const targetConnector = chain.length > 0 || hasRoute ? '└─ ' : '';
      const targetDisplay = targetFile ? targetFile + ':' + targetFunc : targetFunc;
      
      treeHtml += "<div class='caller-tree-item target'>" +
        "<span class='tree-indent'>" + targetIndent + targetConnector + "</span>" +
        "<span class='caller-name'>" + esc(targetDisplay) + "() ← you are here</span>" +
        "</div>";

      return "<div style='margin-top: 8px;'>" +
        "<div class='section-label'>CALL PATH</div>" +
        "<div class='call-tree'>" + treeHtml + "</div>" +
        "</div>";
    }

    function renderSignals(impact) {
      // Use pre-summarized insights from the CLI (preferred)
      // Fall back to raw findings if insights not available
      const insights = impact.insights || [];
      
      if (insights.length === 0) {
        return '';
      }

      const items = insights.map(i => {
        const sev = i.severity || 'info';
        return "<div class='signal " + esc(sev) + "'>" +
          "<span class='signal-content'>" + esc(i.message) + "</span>" +
          "</div>";
      }).join('');

      return "<div style='margin-top: 8px;'>" +
        "<div class='section-label'>HEADS UP</div>" +
        "<div class='signals-list'>" + items + "</div>" +
        "</div>";
    }

    function renderInsightsList(insights, label, icon) {
      if (!insights || insights.length === 0) {
        return '';
      }

      const items = insights.map((i, idx) => {
        const sev = i.severity || 'info';
        const hasDetails = i.title || i.description || i.file;
        const detailId = label.replace(/\\s+/g, '-').toLowerCase() + '-detail-' + idx;
        
        let html = "<div class='signal " + sev + (hasDetails ? " expandable" : "") + "'>";
        
        if (hasDetails) {
          // Clickable header that expands details
          html += "<div class='signal-header' data-action='toggleDetail' data-detail-id='" + detailId + "'>";
          html += "<span class='signal-content'>" + esc(i.message) + "</span>";
          html += "<span class='signal-toggle'>▶</span>";
          html += "</div>";
          
          // Collapsible detail section
          html += "<div id='" + detailId + "' class='signal-detail' style='display: none;'>";
          
          if (i.title && i.title !== i.message) {
            html += "<div class='detail-title'>" + esc(i.title) + "</div>";
          }
          
          if (i.description) {
            html += "<div class='detail-desc'>" + esc(i.description) + "</div>";
          }
          
          if (i.file) {
            const loc = i.line ? i.file + ':' + i.line : i.file;
            html += "<div class='detail-loc' data-action='openFile' data-file='" + esc(i.file) + "'>";
            html += "📍 " + esc(loc);
            html += "</div>";
          }
          
          html += "</div>";
        } else {
          html += "<span class='signal-content'>" + esc(i.message) + "</span>";
        }
        
        html += "</div>";
        return html;
      }).join('');

      return "<div style='margin-top: 8px;'>" +
        "<div class='section-label'>" + icon + " " + esc(label) + "</div>" +
        "<div class='signals-list'>" + items + "</div>" +
        "</div>";
    }

    function renderPathInsights(impact) {
      // New format: upstream and downstream insights (human-friendly summaries)
      const upstreamHtml = renderInsightsList(
        impact.upstreamInsights, 
        "UPSTREAM", 
        "↑"
      );
      const downstreamHtml = renderInsightsList(
        impact.downstreamInsights, 
        "DOWNSTREAM", 
        "↓"
      );

      // Fallback to legacy pathInsights if new format not available
      if (!upstreamHtml && !downstreamHtml) {
        const pathInsights = impact.pathInsights || [];
        if (pathInsights.length === 0) {
          return '';
        }

        const items = pathInsights.map(i => {
          const sev = i.severity || 'info';
          return "<div class='signal " + esc(sev) + "'>" +
            "<span class='signal-content'>" + esc(i.message) + "</span>" +
            "</div>";
        }).join('');

        return "<div style='margin-top: 8px;'>" +
          "<div class='section-label'>ALONG THE WAY</div>" +
          "<div class='signals-list'>" + items + "</div>" +
          "</div>";
      }

      return upstreamHtml + downstreamHtml;
    }

    // Event delegation for all clickable elements (CSP-safe, no inline onclick)
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      
      const action = target.dataset.action;
      
      switch (action) {
        case 'openFile':
          vscode.postMessage({ command: 'openFile', filePath: target.dataset.file });
          break;
        case 'openLink':
          vscode.postMessage({ command: 'openLink', url: target.dataset.url });
          break;
        case 'pin':
          if (window.__lastState && window.__lastState.activeImpact) {
            vscode.postMessage({ command: 'pinImpact', impact: window.__lastState.activeImpact });
          }
          break;
        case 'unpin':
          vscode.postMessage({ command: 'unpinImpact' });
          break;
        case 'showDependents':
          vscode.postMessage({ command: 'showDependents' });
          break;
        case 'toggleImporters':
          const list = document.getElementById('importers-list');
          if (list) {
            const isHidden = list.style.display === 'none';
            list.style.display = isHidden ? 'block' : 'none';
            target.textContent = isHidden ? 'Hide' : 'Show';
          }
          break;
        case 'toggleDetail':
          const detailId = target.dataset.detailId;
          const detail = document.getElementById(detailId);
          const signal = target.closest('.signal');
          if (detail && signal) {
            const isHidden = detail.style.display === 'none';
            detail.style.display = isHidden ? 'block' : 'none';
            signal.classList.toggle('expanded', isHidden);
          }
          break;
      }
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || message.type !== 'state') return;
      window.__lastState = message.state;
      render(message.state);
    });
  </script>
</body>
</html>`;
  }
}
