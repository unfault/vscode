/**
 * Unfault VS Code Extension
 *
 * This extension provides cognitive context for your code by integrating
 * with the Unfault CLI via LSP. The CLI performs client-side parsing and
 * sends analyzed IR to the Unfault API, keeping your source code local.
 *
 * Features:
 * - Function impact hovers (where is this used, what safeguards exist)
 * - Real-time insights via LSP
 * - File centrality awareness in the status bar
 * - Code actions for quick fixes
 * - Welcome panel for onboarding and authentication
 */

import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State,
  TransportKind,
  ExecuteCommandRequest
} from 'vscode-languageclient/node';
import { WelcomePanel } from './welcomePanel';
import { ContextView } from './contextView';

let client: LanguageClient;
let statusBarItem: vscode.StatusBarItem;
let contextView: ContextView | null = null;

// Cache key for cursor-following to avoid redundant API calls
// Cleared on analysis complete to force refresh with new data
let lastFollowedKey: string | null = null;

interface FunctionImpactData {
  name: string;
  callers: Array<{
    name: string;
    file: string;
    depth: number;
    calls?: string;
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
  }>;
  /** Human-friendly insights about issues in downstream callees */
  downstreamInsights?: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
  }>;
}

async function getFunctionImpact(
  lspClient: LanguageClient,
  params: { uri: string; functionName: string; position: { line: number; character: number } },
  token?: vscode.CancellationToken
): Promise<FunctionImpactData | null> {
  const result = await lspClient.sendRequest(
    ExecuteCommandRequest.type,
    {
      command: 'unfault/getFunctionImpact',
      arguments: [params]
    },
    token
  );

  return (result as FunctionImpactData | null) ?? null;
}

/**
 * Request file centrality data from the LSP server
 */
async function getFileCentrality(
  lspClient: LanguageClient,
  uri: string
): Promise<FileCentralityNotification | null> {
  try {
    const result = await lspClient.sendRequest(
      ExecuteCommandRequest.type,
      {
        command: 'unfault/getFileCentrality',
        arguments: [{ uri }]
      }
    );
    return (result as FileCentralityNotification | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Request file dependencies data from the LSP server
 */
async function getFileDependencies(
  lspClient: LanguageClient,
  uri: string
): Promise<FileDependenciesNotification | null> {
  try {
    const result = await lspClient.sendRequest(
      ExecuteCommandRequest.type,
      {
        command: 'unfault/getFileDependencies',
        arguments: [{ uri }]
      }
    );
    return (result as FileDependenciesNotification | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Response from refreshFile command
 */
interface RefreshFileResponse {
  success: boolean;
  finding_count: number;
}

/**
 * Request re-analysis of a single file
 * This triggers full analysis (IR build + API call) and updates findings
 */
async function refreshFile(
  lspClient: LanguageClient,
  uri: string
): Promise<RefreshFileResponse | null> {
  try {
    const result = await lspClient.sendRequest(
      ExecuteCommandRequest.type,
      {
        command: 'unfault/refreshFile',
        arguments: [{ uri }]
      }
    );
    return (result as RefreshFileResponse | null) ?? null;
  } catch {
    return null;
  }
}

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
 * File dependencies notification from the LSP server
 * Shows which files depend on the current file
 */
interface FileDependenciesNotification {
  path: string;
  direct_dependents: string[];
  all_dependents: string[];
  total_count: number;
  summary: string;
}

// Track current centrality for the active file
let currentCentrality: FileCentralityNotification | null = null;

// Track current dependencies for the active file
let currentDependencies: FileDependenciesNotification | null = null;



// Track server state
let serverState: 'starting' | 'running' | 'stopped' | 'error' = 'starting';

// Code lens provider instance (for refreshing on analysis complete)
let codeLensProviderInstance: ImpactCodeLensProvider | null = null;

class ImpactCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    console.log(`[Unfault] provideCodeLenses called for ${document.uri.toString()} (${document.languageId})`);
    
    if (!this.isCodeLensEnabled()) {
      console.log('[Unfault] Code lens disabled in settings');
      return [];
    }

    const supportedLanguages = ['python', 'go', 'rust', 'typescript', 'javascript'];
    if (!supportedLanguages.includes(document.languageId)) {
      console.log(`[Unfault] Language ${document.languageId} not supported`);
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];

    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );

      if (!symbols) {
        console.log('[Unfault] No symbols found');
        return [];
      }

      const functions = this.collectFunctionSymbols(symbols);
      console.log(`[Unfault] Found ${functions.length} functions in ${document.uri.toString()}`);

      for (const func of functions) {
        const position = func.range.start;
        codeLenses.push(new vscode.CodeLens(new vscode.Range(position, position)));
      }
    } catch (error) {
      console.error('[Unfault] Error getting document symbols:', error);
    }

    return codeLenses;
  }

  private collectFunctionSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
    const result: vscode.DocumentSymbol[] = [];
    for (const symbol of symbols) {
      if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
        result.push(symbol);
      }
      if (symbol.children) {
        result.push(...this.collectFunctionSymbols(symbol.children));
      }
    }
    return result;
  }

  async resolveCodeLens(
    codeLens: vscode.CodeLens,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens | null> {
    console.log('[Unfault] resolveCodeLens called at', codeLens.range.start);
    
    if (!client || serverState !== 'running') {
      console.log('[Unfault] Client not ready or server not running', { hasClient: !!client, serverState });
      return codeLens;
    }

    const document = vscode.window.activeTextEditor?.document;
    if (!document) {
      console.log('[Unfault] No active editor document');
      return codeLens;
    }

    try {
      const functionName = await this.getFunctionNameAtPosition(document, codeLens.range.start);
      if (!functionName) {
        console.log('[Unfault] Could not find function name at position', codeLens.range.start);
        return codeLens;
      }

      console.log(`[Unfault] Requesting impact data for function: ${functionName}`);
      
       const impactData = await getFunctionImpact(
         client,
         {
           uri: document.uri.toString(),
           functionName,
           position: { line: codeLens.range.start.line, character: codeLens.range.start.character }
         },
         _token
       );

      console.log('[Unfault] Received impact data:', impactData);

      if (impactData) {
        const config = vscode.workspace.getConfiguration('unfault');
        const clickToOpen = config.get<boolean>('codeLens.clickToOpen', true);

         const parts: string[] = [];

         if (impactData.callers.length > 0) {
           parts.push(`used by ${impactData.callers.length} place${impactData.callers.length > 1 ? 's' : ''}`);
         }

         if (impactData.routes.length > 0) {
           const routeSummary = impactData.routes.map(r => `${r.method} ${r.path}`).join(', ');
           parts.push(`reached by ${routeSummary}`);
         }

         if (impactData.findings.length > 0) {
           parts.push('worth a look');
         }

         codeLens.command = {
           title: parts.length > 0 ? `Unfault: ${parts.join(' · ')}` : 'Unfault: context',
           command: clickToOpen ? 'unfault.openContext' : '',
           arguments: [impactData]
         };
        console.log('[Unfault] Code lens resolved with title:', codeLens.command.title);
      } else {
        console.log('[Unfault] No impact data received');
         codeLens.command = {
           title: 'Unfault: analyzing…',
           command: ''
         };
      }
    } catch (error) {
      console.error('[Unfault] Error resolving code lens:', error);
       codeLens.command = {
         title: 'Unfault: context',
         command: ''
       };
    }

    return codeLens;
  }

  private isCodeLensEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('unfault');
    return config.get<boolean>('codeLens.enabled', true);
  }

  private async getFunctionNameAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<string | null> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );

      if (!symbols) {
        return null;
      }

      const func = this.findFunctionAtPosition(symbols, position);
      return func ? func.name : null;
    } catch (error) {
      console.error('[Unfault] Error finding function at position:', error);
      return null;
    }
  }

  private findFunctionAtPosition(
    symbols: vscode.DocumentSymbol[],
    pos: vscode.Position
  ): vscode.DocumentSymbol | null {
    for (const symbol of symbols) {
      const range = symbol.range;
      if (range.contains(pos)) {
        if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
          return symbol;
        }
        if (symbol.children) {
          const child = this.findFunctionAtPosition(symbol.children, pos);
          if (child) {
            return child;
          }
        }
      }
    }
    return null;
  }

  refresh() {
    this._onDidChangeCodeLenses.fire();
  }
}

async function getFunctionNameAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<string | null> {
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri
    );

    if (!symbols) {
      return null;
    }

    const findFunctionAtPosition = (
      nodes: vscode.DocumentSymbol[],
      pos: vscode.Position
    ): vscode.DocumentSymbol | null => {
      for (const symbol of nodes) {
        if (symbol.range.contains(pos)) {
          if (
            symbol.kind === vscode.SymbolKind.Function ||
            symbol.kind === vscode.SymbolKind.Method
          ) {
            return symbol;
          }
          if (symbol.children) {
            const child = findFunctionAtPosition(symbol.children, pos);
            if (child) {
              return child;
            }
          }
        }
      }
      return null;
    };

    const func = findFunctionAtPosition(symbols, position);
    return func ? func.name : null;
  } catch (error) {
    console.error('[Unfault] Error finding function at position:', error);
    return null;
  }
}

/**
 * Get the path to the unfault binary from configuration.
 */
function getUnfaultPath(): string {
  const config = vscode.workspace.getConfiguration('unfault');
  return config.get('executablePath', 'unfault');
}

function getLspSettingsPayload() {
  const config = vscode.workspace.getConfiguration('unfault');
  return {
    unfault: {
      diagnostics: {
        enabled: config.get<boolean>('diagnostics.enabled', false),
        minSeverity: config.get<string>('diagnostics.minSeverity', 'high')
      }
    }
  };
}

async function pushLspSettings() {
  if (!client) {
    return;
  }

  try {
    await client.sendNotification('workspace/didChangeConfiguration', {
      settings: getLspSettingsPayload()
    });
  } catch (error) {
    console.error('[Unfault] Failed to push LSP settings:', error);
  }
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
    statusBarItem.tooltip = 'Unfault - Cognitive context for your code\nOpen a supported file (Python, Go, Rust, TypeScript, JavaScript) to see insights.';
    statusBarItem.command = 'unfault.showMenu';
    statusBarItem.show();
    return;
  }

  const config = vscode.workspace.getConfiguration('unfault');
  const diagnosticsEnabled = config.get<boolean>('diagnostics.enabled', false);
  const minSeverity = config.get<string>('diagnostics.minSeverity', 'high');

  let text = '$(unfault-logo)';
  const tooltipParts: string[] = ['**Unfault: Context**'];

  statusBarItem.backgroundColor = undefined;

  if (diagnosticsEnabled) {
    const diagnostics = vscode.languages
      .getDiagnostics(editor!.document.uri)
      .filter(d => d.source === 'unfault');

    tooltipParts.push(`Squiggles: on (min severity: ${minSeverity})`);

    if (diagnostics.length > 0) {
      text += ` ${diagnostics.length}`;
    }
  } else {
    tooltipParts.push('Squiggles: off (calm mode)');
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

  if (currentDependencies && currentDependencies.total_count > 0) {
    tooltipParts.push('\n**Dependents**');
    tooltipParts.push(`- ${currentDependencies.total_count} files depend on this`);
  }

  tooltipParts.push('\n---\nClick for menu (Context, Output, Settings)');

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
  contextView?.setCentrality(centrality);
  updateStatusBar();
}

/**
 * Set dependencies for the current file and show info message
 */
function setDependencies(dependencies: FileDependenciesNotification | null) {
  currentDependencies = dependencies;
  contextView?.setDependencies(dependencies);
}

/**
 * Refresh file centrality and dependencies for the given URI by requesting fresh data from LSP
 */
async function refreshFileContext(uri: string): Promise<void> {
  if (!client || serverState !== 'running') {
    return;
  }

  try {
    // Request fresh centrality and dependencies in parallel
    const [centrality, dependencies] = await Promise.all([
      getFileCentrality(client, uri),
      getFileDependencies(client, uri),
    ]);

    setCentrality(centrality);
    setDependencies(dependencies);
  } catch (e) {
    console.error('[Unfault] Failed to refresh file context:', e);
  }
}

/**
 * Trigger full re-analysis of a file (including findings refresh)
 * This is more expensive than refreshFileContext but updates findings
 */
async function refreshFileAnalysis(uri: string): Promise<void> {
  console.log('[Unfault] refreshFileAnalysis called for:', uri, 'client:', !!client, 'serverState:', serverState);
  if (!client || serverState !== 'running') {
    console.log('[Unfault] Skipping refreshFileAnalysis - client not ready');
    return;
  }

  try {
    console.log('[Unfault] Calling refreshFile LSP command');
    const result = await refreshFile(client, uri);
    console.log('[Unfault] refreshFile result:', result);
    if (result) {
      console.log('[Unfault] File refresh complete, success:', result.success, 'findings:', result.finding_count);
    } else {
      console.log('[Unfault] File refresh returned null');
    }
    // Note: The analysisComplete notification will trigger sidebar refresh
  } catch (e) {
    console.error('[Unfault] Failed to refresh file analysis:', e);
  }
}

/**
 * Show a quick pick list of all files that depend on the current file
 */
async function showDependentsList(dependencies: FileDependenciesNotification) {
  const items: vscode.QuickPickItem[] = dependencies.all_dependents.map(path => ({
    label: path.split('/').pop() || path,
    description: path,
    detail: dependencies.direct_dependents.includes(path) ? 'Direct dependent' : 'Transitive dependent'
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `${dependencies.total_count} files depend on ${dependencies.path}`,
    matchOnDescription: true,
  });

  if (selected && selected.description) {
    // Open the selected file
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const filePath = vscode.Uri.joinPath(workspaceFolders[0].uri, selected.description);
      try {
        await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(filePath));
      } catch {
        // File might not exist or be accessible
        vscode.window.showWarningMessage(`Could not open file: ${selected.description}`);
      }
    }
  }
}

/**
 * Register LSP client handlers
 */
function registerClientHandlers(lspClient: LanguageClient) {
  lspClient.onDidChangeState((e) => {
    if (e.newState === State.Running) {
      serverState = 'running';
      contextView?.setServerState(serverState);
      updateStatusBar();
      pushLspSettings();
    } else if (e.newState === State.Stopped) {
      serverState = 'stopped';
      contextView?.setServerState(serverState);
      updateStatusBar();
    }
  });

  lspClient.onNotification('unfault/fileCentrality', (params: FileCentralityNotification) => {
    setCentrality(params);
  });

  lspClient.onNotification('unfault/fileDependencies', (params: FileDependenciesNotification) => {
    setDependencies(params);
  });

  // Listen for analysis complete to refresh code lenses and sidebar
  lspClient.onNotification('unfault/analysisComplete', async (params: { uri: string; finding_count: number }) => {
    console.log('[Unfault] Analysis complete for', params.uri, 'findings:', params.finding_count);

    // Refresh code lenses to show updated finding counts
    codeLensProviderInstance?.refresh();

    // ALWAYS clear the cursor-following cache on ANY analysis complete.
    // This ensures consistency: when f1.py is saved, the sidebar for f3.py
    // (which may show path_findings from f1) will be refreshed.
    if (lastFollowedKey) {
      console.log('[Unfault] Clearing lastFollowedKey (was:', lastFollowedKey, ')');
      lastFollowedKey = null;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || !contextView) {
      console.log('[Unfault] No active editor or contextView');
      return;
    }

    // Always clear pinned state on analysis completion: pinned impact represents
    // a snapshot that becomes stale after edits.
    contextView.clearPinnedImpact();

    // finding_count=0 indicates the LSP server invalidated the cache due to document change.
    // Clear the sidebar immediately to avoid showing stale findings.
    // Only do this if it's for the SAME file being edited.
    if (params.finding_count === 0 && editor.document.uri.toString() === params.uri) {
      console.log('[Unfault] finding_count=0 for current file, clearing sidebar');
      contextView.setActiveImpact(null);
      return;
    }

    // Re-fetch function impact for the CURRENT editor (not the saved file).
    // This ensures path_findings are always fresh after any file is saved.
    const currentUri = editor.document.uri.toString();
    const position = editor.selection.active;
    console.log('[Unfault] Getting function at position', position.line, position.character, 'in', currentUri);
    const functionName = await getFunctionNameAtPosition(editor.document, position);
    console.log('[Unfault] Function name:', functionName);

    // If we can't identify a function at the cursor, clear the active impact to
    // avoid leaving stale findings on screen.
    if (!functionName) {
      console.log('[Unfault] No function name, clearing sidebar');
      contextView.setActiveImpact(null);
      return;
    }

    console.log('[Unfault] Fetching impact for', functionName);
    const impactData = await getFunctionImpact(lspClient, {
      uri: currentUri,
      functionName,
      position: { line: position.line, character: position.character }
    });
    console.log('[Unfault] Got impact data, updating sidebar');
    contextView.setActiveImpact(impactData);
  });
}

export function activate(context: vscode.ExtensionContext) {
  // Create status bar item
  statusBarItem = createStatusBarItem();
  context.subscriptions.push(statusBarItem);

  // Register the Explorer sidebar context view
  contextView = new ContextView(context.extensionUri);
  contextView.setServerState(serverState);
  contextView.setActiveEditor(vscode.window.activeTextEditor ?? null);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('unfault.contextView', contextView)
  );

  // Show initial status
  updateStatusBar();

  // Register code lens provider
  const codeLensProvider = new ImpactCodeLensProvider();
  codeLensProviderInstance = codeLensProvider; // Store for notification handler
  const codeLensRegistration = vscode.languages.registerCodeLensProvider(
    [
      { scheme: 'file', language: 'python' },
      { scheme: 'file', language: 'go' },
      { scheme: 'file', language: 'rust' },
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'javascript' },
    ],
    codeLensProvider
  );
  context.subscriptions.push(codeLensRegistration);

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
    initializationOptions: getLspSettingsPayload(),
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
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      // Clear centrality/dependencies immediately for instant feedback
      currentCentrality = null;
      currentDependencies = null;
      contextView?.setCentrality(null);
      contextView?.setDependencies(null);
      
      contextView?.setActiveEditor(editor ?? null);
      updateStatusBar();

      // Request fresh data from LSP for the new file
      if (editor) {
        const supportedLanguages = ['python', 'go', 'rust', 'typescript', 'javascript'];
        if (supportedLanguages.includes(editor.document.languageId)) {
          refreshFileContext(editor.document.uri.toString());
        }
      }
    })
  );

  // Follow cursor and update the context sidebar
  let followCursorTimer: NodeJS.Timeout | null = null;

  // NOTE: We intentionally do NOT refresh analysis on document change.
  // Analysis reads files from disk, not from VSCode's in-memory buffer.
  // Refreshing on change would re-analyze the OLD disk content, causing
  // findings to flip back to stale state.
  //
  // Instead, analysis only runs on:
  // - did_open (file opened)
  // - did_save (file saved to disk)
  //
  // The sidebar is cleared on document change via the LSP's did_change handler,
  // which sends analysisComplete with finding_count=0. This provides immediate
  // feedback that findings are stale until the file is saved.

  // Clear lastFollowedKey on save to force re-fetch when analysis completes
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      // Clear lastFollowedKey to force re-fetch of function impact when analysis completes
      // The actual refresh happens via the unfault/analysisComplete notification
      if (lastFollowedKey && lastFollowedKey.startsWith(doc.uri.toString())) {
        lastFollowedKey = null;
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      console.log('[Unfault] Selection changed', { 
        hasContextView: !!contextView, 
        hasClient: !!client, 
        serverState,
        languageId: e.textEditor.document.languageId
      });

      if (!contextView || !client || serverState !== 'running') {
        console.log('[Unfault] Skipping - not ready');
        return;
      }

      const supportedLanguages = ['python', 'go', 'rust', 'typescript', 'javascript'];
      if (!supportedLanguages.includes(e.textEditor.document.languageId)) {
        console.log('[Unfault] Skipping - unsupported language');
        return;
      }

      if (followCursorTimer) {
        clearTimeout(followCursorTimer);
      }

      followCursorTimer = setTimeout(async () => {
        try {
          if (contextView?.isPinned()) {
            console.log('[Unfault] Skipping - pinned');
            return;
          }

          const doc = e.textEditor.document;
          const position = e.selections[0]?.active ?? new vscode.Position(0, 0);
          console.log('[Unfault] Getting function at position', { line: position.line, char: position.character });
          
          const functionName = await getFunctionNameAtPosition(doc, position);
          console.log('[Unfault] Function name:', functionName);

          if (!functionName) {
            contextView?.setActiveImpact(null);
            lastFollowedKey = null;
            return;
          }

          const key = `${doc.uri.toString()}::${functionName}`;
          if (key === lastFollowedKey) {
            console.log('[Unfault] Skipping - same function');
            return;
          }
          lastFollowedKey = key;

          console.log('[Unfault] Fetching impact for:', functionName);
          const impactData = await getFunctionImpact(client, {
            uri: doc.uri.toString(),
            functionName,
            position: { line: position.line, character: position.character }
          });
          console.log('[Unfault] Got impact data:', impactData);

          contextView?.setActiveImpact(impactData);
        } catch (error) {
          console.error('[Unfault] Failed to update context view from cursor:', error);
        }
      }, 300);
    })
  );

  // Refresh code lenses when configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('unfault.codeLens')) {
        codeLensProvider.refresh();
      }

      if (e.affectsConfiguration('unfault.diagnostics')) {
        pushLspSettings();
        updateStatusBar();
      }
    })
  );

  // Start the client. This will also launch the server
  client.start().catch((err) => {
    console.error('Failed to start Unfault LSP client:', err);
    serverState = 'error';
    contextView?.setServerState(serverState);
    updateStatusBar();
  });

  // Register command to show welcome panel
  const showWelcomeCommand = vscode.commands.registerCommand('unfault.showWelcome', () => {
    WelcomePanel.createOrShow(context.extensionUri);
  });
  context.subscriptions.push(showWelcomeCommand);

  const openContextCommand = vscode.commands.registerCommand(
    'unfault.openContext',
    async (impactData?: FunctionImpactData) => {
      // Reveal the view (Explorer sidebar)
      await vscode.commands.executeCommand('workbench.view.explorer');
      await vscode.commands.executeCommand('unfault.contextView.focus');

      // IMPORTANT:
      // Do not pin by default. Pinning makes the sidebar intentionally "sticky",
      // which causes stale findings to persist across edits/re-analysis.
      // Users can still pin explicitly via the sidebar button.
      if (impactData) {
        contextView?.setActiveImpact(impactData);
      }
    }
  );
  context.subscriptions.push(openContextCommand);

  // Register command to show menu
  const showMenuCommand = vscode.commands.registerCommand('unfault.showMenu', async () => {
    const items: vscode.QuickPickItem[] = [
      {
        label: '$(unfault-logo) Open Context',
        description: 'Open Unfault: Context in the Explorer sidebar'
      },
      {
        label: '$(home) Welcome & Setup',
        description: 'Open the Unfault welcome panel'
      },
      {
        label: '$(references) Show File Dependents',
        description: 'Show files that depend on this file'
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
        case '$(unfault-logo) Open Context':
          vscode.commands.executeCommand('unfault.openContext');
          break;
        case '$(home) Welcome & Setup':
          WelcomePanel.createOrShow(context.extensionUri);
          break;
        case '$(references) Show File Dependents':
          vscode.commands.executeCommand('unfault.showDependents');
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

  // Register command to show file dependents
  const showDependentsCommand = vscode.commands.registerCommand('unfault.showDependents', async () => {
    if (currentDependencies && currentDependencies.total_count > 0) {
      showDependentsList(currentDependencies);
    } else if (currentDependencies && currentDependencies.total_count === 0) {
      vscode.window.showInformationMessage('No files depend on this file.');
    } else {
      vscode.window.showInformationMessage('Dependency information not available. Make sure the file has been analyzed.');
    }
  });
  context.subscriptions.push(showDependentsCommand);

  // Register command to restart the LSP server
  const restartCommand = vscode.commands.registerCommand('unfault.restartServer', async () => {
    serverState = 'starting';
    contextView?.setServerState(serverState);
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
      contextView?.setServerState(serverState);
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
