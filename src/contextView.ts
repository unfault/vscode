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
      padding: 10px 10px 16px;
      margin: 0;
    }

    .muted { color: var(--vscode-descriptionForeground); }

    .section { margin: 12px 0; }
    .section h2 {
      font-size: 11px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      margin: 0 0 6px;
      color: var(--vscode-descriptionForeground);
    }

    .card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      padding: 8px;
    }

    .row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: baseline;
    }

    .title {
      font-weight: 600;
      margin: 0;
      font-size: 13px;
    }

    .button {
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      border: none;
      background: transparent;
      padding: 0;
      font: inherit;
    }

    .list { margin: 6px 0 0; padding: 0; list-style: none; }
    .list li { margin: 6px 0; }

    .item {
      display: block;
      padding: 6px;
      border-radius: 6px;
      cursor: pointer;
    }
    .item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .badge {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
      white-space: nowrap;
    }

    .divider { height: 1px; background: var(--vscode-widget-border); margin: 10px 0; }

    .signal {
      padding: 6px;
      border-radius: 6px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-left: 3px solid var(--vscode-widget-border);
    }

    .signal.error { border-left-color: var(--vscode-errorForeground); }
    .signal.warning { border-left-color: var(--vscode-editorWarning-foreground); }
    .signal.info { border-left-color: var(--vscode-editorInfo-foreground); }

    .story { margin: 8px 0; line-height: 1.5; }
    .story strong { color: var(--vscode-foreground); }
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
      // Build a human-readable narrative about what we know
      const lines = [];

      const routeCount = (impact.routes && impact.routes.length) || 0;
      const callerCount = (impact.callers && impact.callers.length) || 0;
      const findingCount = (impact.findings && impact.findings.length) || 0;

      // Collect SLO info from routes, tracking which routes have SLOs
      const allSlos = [];
      const routesWithSlos = [];
      if (impact.routes) {
        for (const route of impact.routes) {
          if (route.slos && route.slos.length > 0) {
            routesWithSlos.push(route);
            for (const slo of route.slos) {
              allSlos.push({ ...slo, route: route.method + ' ' + route.path });
            }
          }
        }
      }
      const sloCount = allSlos.length;
      const lowBudgetSlos = allSlos.filter(s => s.error_budget_remaining !== undefined && s.error_budget_remaining < 20);

      // Detect if this is an inherited SLO situation (nested function, not a direct route handler)
      // A function is "nested" if it has callers but also reaches routes (i.e., it's in the call path)
      const isNestedFunction = callerCount > 0 && routeCount > 0;

      // Entry points / routes
      if (routeCount > 0) {
        const routeList = impact.routes.slice(0, 3).map(r => r.method + ' ' + r.path).join(', ');
        if (isNestedFunction) {
          // This function is called by something that eventually reaches a route
          if (routeCount === 1) {
            lines.push('Reachable from <strong>' + esc(routeList) + '</strong>.');
          } else if (routeCount <= 3) {
            lines.push('Reachable from ' + routeCount + ' routes: <strong>' + esc(routeList) + '</strong>.');
          } else {
            lines.push('Reachable from ' + routeCount + ' routes including <strong>' + esc(routeList) + '</strong>.');
          }
        } else {
          // Direct route handler
          if (routeCount === 1) {
            lines.push('This is an entry point: <strong>' + esc(routeList) + '</strong>.');
          } else if (routeCount <= 3) {
            lines.push('Entry point for ' + routeCount + ' routes: <strong>' + esc(routeList) + '</strong>.');
          } else {
            lines.push('Entry point for ' + routeCount + ' routes including <strong>' + esc(routeList) + '</strong>.');
          }
        }
      }

      // SLO monitoring status — different copy for nested vs direct
      if (sloCount > 0) {
        if (isNestedFunction) {
          // Inherited SLO impact — the key feature!
          const routeNames = routesWithSlos.slice(0, 2).map(r => r.method + ' ' + r.path).join(', ');
          if (lowBudgetSlos.length > 0) {
            lines.push('<strong style="color: var(--vscode-editorWarning-foreground);">Heads up:</strong> ' +
              'Changes here could affect ' + sloCount + ' SLO' + (sloCount > 1 ? 's' : '') +
              ' via ' + esc(routeNames) + ' — and ' + lowBudgetSlos.length +
              ' ' + (lowBudgetSlos.length > 1 ? 'are' : 'is') + ' running low on error budget.');
          } else {
            lines.push('Changes here could affect ' + sloCount + ' SLO' + (sloCount > 1 ? 's' : '') +
              ' via <strong>' + esc(routeNames) + '</strong>' +
              (routesWithSlos.length > 2 ? ' and ' + (routesWithSlos.length - 2) + ' more' : '') +
              ' — all healthy for now.');
          }
        } else {
          // Direct route handler with SLOs
          if (lowBudgetSlos.length > 0) {
            const sloNames = lowBudgetSlos.slice(0, 2).map(s => s.name).join(', ');
            lines.push('<strong style="color: var(--vscode-editorWarning-foreground);">Heads up:</strong> ' +
              lowBudgetSlos.length + ' SLO' + (lowBudgetSlos.length > 1 ? 's' : '') +
              ' monitoring this have low error budget (' + esc(sloNames) + ').');
          } else {
            lines.push('Monitored by ' + sloCount + ' SLO' + (sloCount > 1 ? 's' : '') + ' — all looking healthy.');
          }
        }
      } else if (routeCount > 0) {
        if (isNestedFunction) {
          lines.push("I'm not aware of any SLOs watching the routes this reaches.");
        } else {
          lines.push("I'm not aware of any SLOs for this route yet.");
        }
      }

      // Callers / usage
      if (callerCount === 0 && routeCount === 0) {
        lines.push("I haven't seen this called from anywhere yet.");
      } else if (callerCount === 0 && routeCount > 0) {
        lines.push("It's called directly from the route handler.");
      } else if (callerCount === 1) {
        lines.push('Called from <strong>' + esc(impact.callers[0].name) + '</strong>.');
      } else if (callerCount <= 5) {
        lines.push('Called from ' + callerCount + ' places in the codebase.');
      } else {
        lines.push('This is a popular function — called from ' + callerCount + ' places.');
      }

      // Signals / findings
      if (findingCount === 0) {
        lines.push('Nothing flagged here. Looks good to me.');
      } else if (findingCount === 1) {
        lines.push('One thing caught my attention below.');
      } else {
        lines.push(findingCount + ' things worth a look below.');
      }

      return '<div class="muted story">' + lines.join(' ') + '</div>';
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
          ? ("<button class='button' onclick='openLink(" + JSON.stringify(slo.dashboard_url) + ")'>Dashboard</button>")
          : '';

        return "<li>" +
          "<div class='signal " + budgetClass + "'>" +
          "<div class='row'>" +
          "<span><strong>" + esc(slo.name) + "</strong></span>" +
          link +
          "</div>" +
          "<div class='muted'>" +
          esc(slo.provider) + " · watches " + esc(slo.route) +
          (statusLine ? '<br>' + statusLine : '') +
          "</div>" +
          "</div>" +
          "</li>";
      }).join('');

      return "<div class='section'>" +
        "<h2>What's watching this</h2>" +
        "<ul class='list'>" + items + "</ul>" +
        "</div>";
    }

    function render(state) {
      const root = document.getElementById('root');
      if (!root) return;

      const serverLine = state.serverState === 'running'
        ? '<span class="muted">Context ready</span>'
        : '<span class="muted">Server: ' + esc(state.serverState) + '</span>';

      const pinned = state.pinnedImpact;
      const active = pinned || state.activeImpact;

      const pinnedBanner = pinned
        ? '<div class="section">' +
          '<div class="card">' +
          '<div class="row">' +
          '<p class="title">Pinned</p>' +
          '<button class="button" onclick="unpin()">Unpin</button>' +
          '</div>' +
          '<div class="muted">Showing pinned symbol context</div>' +
          '</div>' +
          '</div>'
        : '';

      const dependentsBlock = (state.dependencies && state.dependencies.total_count > 0)
        ? '<div class="divider"></div>' +
          '<div class="row">' +
          '<div>' +
          '<div><strong>' + state.dependencies.total_count + '</strong> files depend on this</div>' +
          '<div class="muted">Direct: ' + state.dependencies.direct_dependents.length + '</div>' +
          '</div>' +
          '<button class="button" onclick="showDependents()">Show</button>' +
          '</div>'
        : '';

      const fileLabel = (state.centrality && state.centrality.label) ? state.centrality.label : '—';
      const filePath = state.centrality ? esc(state.centrality.path) : '';
      const fileMeta = state.centrality
        ? ('Imported by ' + state.centrality.in_degree + ' · Imports ' + state.centrality.out_degree)
        : 'Open a supported file to see context.';

      const fileCard = '<div class="section">' +
        '<h2>File</h2>' +
        '<div class="card">' +
        '<div class="row">' +
        '<p class="title">' + esc(fileLabel) + '</p>' +
        '<span class="badge">' + filePath + '</span>' +
        '</div>' +
        '<div class="muted">' + esc(fileMeta) + '</div>' +
        dependentsBlock +
        '</div>' +
        '</div>';

      const pinButton = !pinned ? '<button class="button" onclick="pinCurrent()">Pin</button>' : '';

      const symbolBody = active
        ? (
          '<div class="row">' +
          '<p class="title">' + esc(active.name) + '</p>' +
          pinButton +
          '</div>' +
          buildSymbolStory(active) +
          renderSlos(active) +
          renderCallers(active) +
          renderSignals(active)
        )
        : '<div class="muted">Move your cursor inside a function to see its context.</div>';

      const symbolCard = '<div class="section">' +
        '<h2>Symbol</h2>' +
        '<div class="card">' +
        symbolBody +
        '</div>' +
        '</div>';

      root.innerHTML = '<div class="section">' + serverLine + '</div>' + pinnedBanner + fileCard + symbolCard;
    }

    function renderCallers(impact) {
      if (!impact.callers || impact.callers.length === 0) return '';

      const top = impact.callers.slice(0, 8);
      const items = top.map(c => {
        return "<li>" +
          "<span class='item' onclick='openFile(" + JSON.stringify(c.file) + ")'>" +
          "<div class='row'>" +
          "<span>" + esc(c.name) + "</span>" +
          "<span class='badge'>d" + esc(c.depth) + "</span>" +
          "</div>" +
          "<div class='muted'>" + esc(c.file) + "</div>" +
          "</span>" +
          "</li>";
      }).join('');

      return "<div class='section'>" +
        "<h2>Where it's called from</h2>" +
        "<ul class='list'>" + items + "</ul>" +
        "</div>";
    }

    function renderSignals(impact) {
      if (!impact.findings || impact.findings.length === 0) {
        return '';  // Story already says "looks good"
      }

      const items = impact.findings.slice(0, 6).map(f => {
        const sev = f.severity || 'info';
        const link = f.learnMore
          ? ("<button class='button' onclick='openLink(" + JSON.stringify(f.learnMore) + ")'>Learn</button>")
          : '';

        return "<li>" +
          "<div class='signal " + esc(sev) + "'>" +
          "<div class='row'>" +
          "<span>" + esc(f.message) + "</span>" +
          link +
          "</div>" +
          "</div>" +
          "</li>";
      }).join('');

      return "<div class='section'>" +
        "<h2>Worth a look</h2>" +
        "<ul class='list'>" + items + "</ul>" +
        "</div>";
    }



    function openFile(filePath) {
      vscode.postMessage({ command: 'openFile', filePath });
    }

    function openLink(url) {
      vscode.postMessage({ command: 'openLink', url });
    }

    function pinCurrent() {
      if (!window.__lastState || !window.__lastState.activeImpact) return;
      vscode.postMessage({ command: 'pinImpact', impact: window.__lastState.activeImpact });
    }

    function unpin() {
      vscode.postMessage({ command: 'unpinImpact' });
    }

    function showDependents() {
      vscode.postMessage({ command: 'showDependents' });
    }

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
