import * as vscode from 'vscode';
import * as childProcess from 'child_process';
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

export interface HttpCallAtPositionData {
  library: string;
  method: string;
  url: string | null;
  urlExpr?: {
    text: string;
    kind: string;
    envVar?: string | null;
  } | null;
  startByte: number;
  endByte: number;
}

type ServerState = 'starting' | 'running' | 'stopped' | 'error';

type FaultTemplateId =
  | 'latency_tail_normal'
  | 'latency_tail_spikes_pareto'
  | 'latency_brownout_window'
  | 'jitter_light_ingress'
  | 'jitter_bidirectional'
  | 'bandwidth_server_ingress_64_kbps'
  | 'bandwidth_client_both_48_kbps_plus_latency'
  | 'mobile_edge_3g'
  | 'packet_loss_constant'
  | 'packet_loss_burst'
  | 'blackhole_constant'
  | 'blackhole_window';

interface FaultPanelState {
  baseUrl: string;
  status: 'idle' | 'running' | 'done' | 'error';
  lastRun?: {
    templateId: FaultTemplateId;
    title: string;
    exitCode: number | null;
    startedAtIso: string;
    finishedAtIso?: string;
    faultCommand: string;
    curlCommand: string;
  };
  lastError?: string;
}

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
  activeHttpCall: HttpCallAtPositionData | null;
  fault: FaultPanelState;
}

export class ContextView implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private serverState: ServerState = 'starting';
  private activeEditor: vscode.TextEditor | null = null;
  private centrality: FileCentralityNotification | null = null;
  private dependencies: FileDependenciesNotification | null = null;
  private activeImpact: FunctionImpactData | null = null;
  private pinnedImpact: FunctionImpactData | null = null;
  private activeHttpCall: HttpCallAtPositionData | null = null;

  private faultState: FaultPanelState;
  private lastFaultTerminal: vscode.Terminal | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {
    const config = vscode.workspace.getConfiguration('unfault');
    const baseUrl = config.get('fault.baseUrl', 'http://127.0.0.1:8000');

    this.faultState = {
      baseUrl,
      status: 'idle'
    };
  }

  setServerState(state: ServerState) {
    this.serverState = state;
    this.postState();
  }

  setActiveEditor(editor: vscode.TextEditor | null) {
    this.activeEditor = editor;
    this.activeImpact = null;
    this.pinnedImpact = null;
    this.activeHttpCall = null;
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

  setActiveHttpCall(call: HttpCallAtPositionData | null) {
    this.activeHttpCall = call;
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
        case 'faultRun':
          await this.runFaultFromWebview(message);
          break;
        case 'faultGenerateScenarioFile':
          await vscode.commands.executeCommand('unfault.generateFaultScenarios');
          break;
      }
    });
  }

  // Scenario generation is handled by the Unfault LSP.

  focusFaultInjection() {
    if (!this.view) {
      return;
    }

    this.view.webview.postMessage({
      type: 'focusFaultInjection'
    });
  }

  private async runFaultFromWebview(message: any) {
    const rawTemplateId = message?.templateId as FaultTemplateId | string | undefined;
    if (!rawTemplateId) {
      vscode.window.showWarningMessage('Missing fault template.');
      return;
    }
    const templateId = this.normalizeFaultTemplateId(rawTemplateId);

    if (!templateId) {
      vscode.window.showWarningMessage('Missing fault template.');
      return;
    }

    const mode = message?.mode === 'egress' ? 'egress' : 'ingress';

    if (mode === 'egress') {
      await this.runEgressFaultInjection(templateId);
      return;
    }

    const impact = this.pinnedImpact ?? this.activeImpact;
    if (!impact) {
      vscode.window.showInformationMessage('Move your cursor inside a function to run a fault injection.');
      return;
    }

    const titleBits: string[] = [];
    titleBits.push(this.getFaultTemplateTitle(templateId));

    const route = impact.routes?.[0];
    if (route?.method && route.path) {
      titleBits.push(`${route.method.toUpperCase()} ${route.path}`);
    }

    const title = titleBits.join(' - ') || 'Fault injection';

    const baseUrl = this.faultState.baseUrl || 'http://127.0.0.1:8000';
    const remote = this.getRemoteTargetFromBaseUrl(baseUrl);
    const path = route?.path || '/';
    const curlUrl = `http://127.0.0.1:9090${path.startsWith('/') ? path : `/${path}`}`;
    const method = (route?.method ? String(route.method) : 'GET').trim().toUpperCase() || 'GET';
    try {
      await this.stopActiveFaultProxyIfRunning();

      this.faultState = {
        ...this.faultState,
        status: 'running',
        lastError: undefined
      };
      this.postState();

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const config = vscode.workspace.getConfiguration('unfault');
      const faultPath = config.get('fault.executablePath', 'fault');

      const ok = await this.ensureFaultAvailable(faultPath);
      if (!ok) {
        this.faultState = {
          ...this.faultState,
          status: 'idle'
        };
        this.postState();
        return;
      }

      const localPort = 9090;
      const faultArgs = this.buildFaultRunArgs({
        templateId,
        localPort,
        remote
      });

      const faultCommand = `${faultPath} ${faultArgs.map(a => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`;
      const curlCommand = this.buildCurlCommand({ method, url: curlUrl });

      const faultTerminal = vscode.window.createTerminal({
        name: `fault (proxy)`,
        cwd: workspaceFolder?.uri.fsPath
      });
      this.lastFaultTerminal = faultTerminal;

      const curlTerminal = vscode.window.createTerminal({
        name: 'curl (via fault)',
        cwd: workspaceFolder?.uri.fsPath,
        location: { parentTerminal: faultTerminal }
      });

      this.faultState = {
        ...this.faultState,
        status: 'running',
        lastRun: {
          templateId,
          title,
          exitCode: null,
          startedAtIso: new Date().toISOString(),
          faultCommand,
          curlCommand
        },
        lastError: undefined
      };
      this.postState();

      // Run the proxy; keep focus for the curl terminal.
      faultTerminal.show(true);
      faultTerminal.sendText(faultCommand, true);

      // Don't run the curl command automatically, just prefill it.
      // Use preserveFocus=false so the terminal panel re-opens if it was closed.
      curlTerminal.show(false);
      curlTerminal.sendText(curlCommand, false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.faultState = {
        ...this.faultState,
        status: 'error',
        lastError: msg
      };
      this.postState();
      vscode.window.showErrorMessage(`Failed to start fault proxy: ${msg}`);
    }
  }

  private async runEgressFaultInjection(templateId: FaultTemplateId) {
    const httpCall = this.activeHttpCall;
    if (!httpCall) {
      vscode.window.showInformationMessage('Move your cursor onto an outbound HTTP call to run an egress fault injection.');
      return;
    }

    let envVar = httpCall.urlExpr?.envVar ?? null;
    if (!envVar && httpCall.urlExpr?.text) {
      envVar = this.inferEnvVarFromTemplateText(httpCall.urlExpr.text);
    }
    if (!envVar) {
      envVar =
        (await vscode.window.showInputBox({
          title: 'Env var to override',
          prompt:
            'Enter the environment variable name that controls the outbound URL (e.g., KITCHEN_URL).',
          placeHolder: 'KITCHEN_URL'
        })) || null;
    }
    if (!envVar) {
      vscode.window.showWarningMessage(
        'No env var selected. To enable egress fault injection, make the outbound URL configurable via an env var (os.getenv/process.env) or provide an env var name here.'
      );
      return;
    }

    // Determine the remote target origin.
    let remote = '';
    if (httpCall.url) {
      remote = this.getRemoteTargetFromBaseUrl(httpCall.url);
    } else {
      let envValue = process.env[envVar];

      // If the env var already points to the local proxy, we cannot infer the real remote.
      if (envValue && (envValue.includes('127.0.0.1:9090') || envValue.includes('localhost:9090'))) {
        envValue = undefined;
      }

      if (!envValue) {
        const entered = await vscode.window.showInputBox({
          title: 'Remote URL for outbound call',
          prompt: `Enter the current value of ${envVar} (the real remote URL). We'll start a proxy to that origin, then you can set ${envVar}=http://127.0.0.1:9090 when running your app.`,
          placeHolder: 'https://api.example.com'
        });
        if (!entered) {
          return;
        }
        envValue = entered;
      }

      remote = this.getRemoteTargetFromBaseUrl(envValue);
    }

    const baseUrl = this.faultState.baseUrl || 'http://127.0.0.1:8000';

    const impact = this.pinnedImpact ?? this.activeImpact;
    const route = impact?.routes?.[0];
    const method = route?.method ? String(route.method).trim().toUpperCase() : null;
    const path = route?.path ? String(route.path) : null;
    const displayPath = path ? path.replace(/\{([^}]+)\}/g, '<$1>') : null;
    const appUrl = method && displayPath ? this.joinUrl(baseUrl, displayPath) : null;

    const titleBits: string[] = [];
    titleBits.push(this.getFaultTemplateTitle(templateId));
    titleBits.push(`egress via ${envVar}`);
    const title = titleBits.join(' - ');

    try {
      await this.stopActiveFaultProxyIfRunning();

      this.faultState = {
        ...this.faultState,
        status: 'running',
        lastError: undefined
      };
      this.postState();

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const config = vscode.workspace.getConfiguration('unfault');
      const faultPath = config.get('fault.executablePath', 'fault');

      const ok = await this.ensureFaultAvailable(faultPath);
      if (!ok) {
        this.faultState = {
          ...this.faultState,
          status: 'idle'
        };
        this.postState();
        return;
      }

      const localPort = 9090;
      const faultArgs = this.buildFaultRunArgs({
        templateId,
        localPort,
        remote
      });

      const faultCommand = `${faultPath} ${faultArgs.map(a => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`;
      const exportCmd = `export ${envVar}=http://127.0.0.1:${localPort}`;

      // For egress, the env var must be applied to the *application process* (restart required).
      // We still optionally provide a curl command to trigger the code path once the app is running.
      const curlCommand = appUrl && method ? this.buildCurlCommand({ method, url: appUrl }) : null;
      const instructions = [
        exportCmd,
        '# Restart your app process so it picks up the env var.',
        '# Then trigger the code path that performs the outbound call.',
        curlCommand ? curlCommand : '# (No route selected in the sidebar; trigger the outbound call however you normally do.)'
      ].join('\n');

      const faultTerminal = vscode.window.createTerminal({
        name: `fault (proxy)`,
        cwd: workspaceFolder?.uri.fsPath
      });
      this.lastFaultTerminal = faultTerminal;

      const triggerTerminal = vscode.window.createTerminal({
        name: 'egress (instructions)',
        cwd: workspaceFolder?.uri.fsPath,
        location: { parentTerminal: faultTerminal }
      });

      this.faultState = {
        ...this.faultState,
        status: 'running',
        lastRun: {
          templateId,
          title,
          exitCode: null,
          startedAtIso: new Date().toISOString(),
          faultCommand,
          curlCommand: instructions
        },
        lastError: undefined
      };
      this.postState();

      faultTerminal.show(true);
      faultTerminal.sendText(faultCommand, true);

      vscode.window.showInformationMessage(
        `Egress fault proxy started. Set ${envVar}=http://127.0.0.1:${localPort} in your app's environment (restart required).`
      );

      // Prefill but do not auto-run.
      triggerTerminal.show(false);
      triggerTerminal.sendText(instructions, false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.faultState = {
        ...this.faultState,
        status: 'error',
        lastError: msg
      };
      this.postState();
      vscode.window.showErrorMessage(`Failed to start fault proxy: ${msg}`);
    }
  }

  private joinUrl(baseUrl: string, path: string): string {
    // URL() will percent-encode route placeholders like {id}, which is confusing
    // in user-facing curl examples. Use a simple join when placeholders exist.
    const hasPlaceholders = path.includes('{') || path.includes('}') || path.includes('<') || path.includes('>');
    if (hasPlaceholders) {
      const b = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      const p = path.startsWith('/') ? path : `/${path}`;
      return `${b}${p}`;
    }

    try {
      return new URL(path, baseUrl).toString();
    } catch {
      const b = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      const p = path.startsWith('/') ? path : `/${path}`;
      return `${b}${p}`;
    }
  }

  private inferEnvVarFromTemplateText(text: string): string | null {
    // Best-effort: support Python f-strings ({NAME}) and JS template literals (${NAME}).
    const vars = new Set<string>();

    const pyRe = /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g;
    const jsRe = /\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g;

    let m: RegExpExecArray | null;
    while ((m = pyRe.exec(text)) !== null) {
      vars.add(m[1]);
    }
    while ((m = jsRe.exec(text)) !== null) {
      vars.add(m[1]);
    }

    if (vars.size === 1) {
      return Array.from(vars)[0] ?? null;
    }

    const all = Array.from(vars);
    const envLike = all.filter((v) => /^[A-Z][A-Z0-9_]*$/.test(v));
    const urlish = envLike.filter((v) => /(^|_)(URL|URI|HOST|ENDPOINT)(_|$)/.test(v));

    if (urlish.length === 1) {
      return urlish[0] ?? null;
    }

    if (urlish.length > 1) {
      const exact = urlish.find((v) => /(^|_)URL$/.test(v) || /_URL_/.test(v));
      return exact ?? urlish[0] ?? null;
    }

    if (envLike.length === 1) {
      return envLike[0] ?? null;
    }

    return null;
  }

  private async stopActiveFaultProxyIfRunning(): Promise<void> {
    const terminal = this.lastFaultTerminal;
    if (!terminal) {
      return;
    }

    // If we already have an exit status, the proxy isn't running anymore.
    if (terminal.exitStatus) {
      return;
    }

    // Best effort: interrupt then dispose (frees port 9090).
    try {
      terminal.sendText('\u0003', false);
    } catch {
      // ignore
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      terminal.dispose();
    } catch {
      // ignore
    }

    this.lastFaultTerminal = null;
  }

  private async ensureFaultAvailable(faultPath: string): Promise<boolean> {
    const exists = await this.checkCommandWorks(faultPath, ['--version']);
    if (exists) {
      return true;
    }

    const action = await vscode.window.showErrorMessage(
      `fault CLI not found (configured as '${faultPath}').`,
      'Install fault',
      'Open settings'
    );

    if (action === 'Install fault') {
      const terminal = vscode.window.createTerminal({ name: 'unfault addon install' });
      terminal.show(false);
      terminal.sendText('unfault addon install fault', true);
    }

    if (action === 'Open settings') {
      await vscode.commands.executeCommand('unfault.openSettings');
    }

    return false;
  }

  private async checkCommandWorks(command: string, args: string[]): Promise<boolean> {
    return await new Promise((resolve) => {
      try {
        const child = childProcess.spawn(command, args, {
          stdio: 'ignore'
        });

        const timeout = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          resolve(false);
        }, 2000);

        child.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });

        child.on('exit', (code) => {
          clearTimeout(timeout);
          resolve(code === 0);
        });
      } catch {
        resolve(false);
      }
    });
  }

  handleTerminalStateChanged(terminal: vscode.Terminal) {
    if (!this.lastFaultTerminal || terminal !== this.lastFaultTerminal) {
      return;
    }

    if (!terminal.exitStatus) {
      return;
    }

    const code = terminal.exitStatus.code ?? null;
    const lastRun = this.faultState.lastRun;

    this.faultState = {
      ...this.faultState,
      status: code === 0 ? 'done' : 'error',
      lastRun: lastRun
        ? { ...lastRun, exitCode: code, finishedAtIso: new Date().toISOString() }
        : lastRun,
      lastError: code === 0 ? undefined : `fault exited with code ${code ?? 'unknown'}`
    };
    this.postState();
  }

  private buildFaultRunArgs(params: {
    templateId: FaultTemplateId;
    localPort: number;
    remote: string;
  }): string[] {
    const mapping = `${params.localPort}=${params.remote}`;
    const args: string[] = ['run', '--disable-http-proxy', '--proxy', mapping, '--duration', '2m'];

    if (params.templateId === 'latency_tail_normal') {
      args.push(
        '--with-latency',
        '--latency-direction',
        'ingress',
        '--latency-distribution',
        'normal',
        '--latency-mean',
        '350',
        '--latency-stddev',
        '50'
      );
    } else if (params.templateId === 'latency_tail_spikes_pareto') {
      args.push(
        '--with-latency',
        '--latency-direction',
        'ingress',
        '--latency-distribution',
        'pareto',
        '--latency-scale',
        '20',
        '--latency-shape',
        '1.5'
      );
    } else if (params.templateId === 'latency_brownout_window') {
      args.push(
        '--with-latency',
        '--latency-direction',
        'ingress',
        '--latency-distribution',
        'normal',
        '--latency-mean',
        '350',
        '--latency-stddev',
        '50',
        '--latency-sched',
        'start:20%,duration:30%'
      );
    } else if (params.templateId === 'jitter_light_ingress') {
      args.push(
        '--with-jitter',
        '--jitter-direction',
        'ingress',
        '--jitter-amplitude',
        '30',
        '--jitter-frequency',
        '5'
      );
    } else if (params.templateId === 'jitter_bidirectional') {
      args.push(
        '--with-jitter',
        '--jitter-direction',
        'both',
        '--jitter-amplitude',
        '30',
        '--jitter-frequency',
        '8'
      );
    } else if (params.templateId === 'bandwidth_server_ingress_64_kbps') {
      args.push(
        '--with-bandwidth',
        '--bandwidth-side',
        'server',
        '--bandwidth-direction',
        'ingress',
        '--bandwidth-rate',
        '64',
        '--bandwidth-unit',
        'KBps'
      );
    } else if (params.templateId === 'bandwidth_client_both_48_kbps_plus_latency') {
      args.push(
        '--with-bandwidth',
        '--bandwidth-side',
        'client',
        '--bandwidth-direction',
        'both',
        '--bandwidth-rate',
        '48',
        '--bandwidth-unit',
        'KBps',
        '--with-latency',
        '--latency-distribution',
        'normal',
        '--latency-mean',
        '200',
        '--latency-stddev',
        '50'
      );
    } else if (params.templateId === 'mobile_edge_3g') {
      args.push(
        '--with-bandwidth',
        '--bandwidth-side',
        'client',
        '--bandwidth-direction',
        'both',
        '--bandwidth-rate',
        '48',
        '--bandwidth-unit',
        'KBps',
        '--with-latency',
        '--latency-distribution',
        'normal',
        '--latency-mean',
        '200',
        '--latency-stddev',
        '50',
        '--with-jitter',
        '--jitter-direction',
        'both',
        '--jitter-amplitude',
        '30',
        '--jitter-frequency',
        '8'
      );
    } else if (params.templateId === 'packet_loss_constant') {
      args.push('--with-packet-loss', '--packet-loss-direction', 'ingress');
    } else if (params.templateId === 'packet_loss_burst') {
      args.push(
        '--with-packet-loss',
        '--packet-loss-direction',
        'ingress',
        '--packet-loss-sched',
        'start:25%,duration:20%'
      );
    } else if (params.templateId === 'blackhole_constant') {
      args.push('--with-blackhole', '--blackhole-direction', 'ingress');
    } else if (params.templateId === 'blackhole_window') {
      args.push(
        '--with-blackhole',
        '--blackhole-direction',
        'ingress',
        '--blackhole-sched',
        'start:10%,duration:20%'
      );
    }

    return args;
  }

  private buildCurlCommand(params: { method: string; url: string }): string {
    const method = params.method.toUpperCase();
    const url = params.url;

    const parts: string[] = ['curl', '-i', '-X', method, url];

    if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
      parts.push('-H', 'Content-Type: application/json', '-d', '{}');
    }

    return parts.map(p => (p.includes(' ') ? JSON.stringify(p) : p)).join(' ');
  }

  private normalizeFaultTemplateId(id: string | undefined): FaultTemplateId {
    const normalized = id?.trim();

    // Backwards-compatible migrations from earlier template IDs.
    if (normalized === 'latency') return 'latency_tail_normal';
    if (normalized === 'packet_loss') return 'packet_loss_constant';
    if (normalized === 'blackhole') return 'blackhole_constant';

    const allowed: FaultTemplateId[] = [
      'latency_tail_normal',
      'latency_tail_spikes_pareto',
      'latency_brownout_window',
      'jitter_light_ingress',
      'jitter_bidirectional',
      'bandwidth_server_ingress_64_kbps',
      'bandwidth_client_both_48_kbps_plus_latency',
      'mobile_edge_3g',
      'packet_loss_constant',
      'packet_loss_burst',
      'blackhole_constant',
      'blackhole_window'
    ];

    return (allowed.includes(normalized as FaultTemplateId)
      ? (normalized as FaultTemplateId)
      : 'latency_tail_normal');
  }

  private getFaultTemplateTitle(templateId: FaultTemplateId): string {
    switch (templateId) {
      case 'latency_tail_normal':
        return 'Latency: tail (350ms +/- 50ms)';
      case 'latency_tail_spikes_pareto':
        return 'Latency: tail spikes (pareto)';
      case 'latency_brownout_window':
        return 'Latency: brownout window (sched)';
      case 'jitter_light_ingress':
        return 'Jitter: light ingress (30ms @ 5Hz)';
      case 'jitter_bidirectional':
        return 'Jitter: bidirectional (30ms @ 8Hz)';
      case 'bandwidth_server_ingress_64_kbps':
        return 'Bandwidth: server ingress (64 KBps)';
      case 'bandwidth_client_both_48_kbps_plus_latency':
        return 'Bandwidth: client both (48 KBps) + latency';
      case 'mobile_edge_3g':
        return 'Mobile edge: 48 KBps + 200ms + jitter';
      case 'packet_loss_constant':
        return 'Packet loss: constant';
      case 'packet_loss_burst':
        return 'Packet loss: burst window (sched)';
      case 'blackhole_constant':
        return 'Blackhole: constant';
      case 'blackhole_window':
        return 'Blackhole: outage window (sched)';
    }
  }

  private getRemoteTargetFromBaseUrl(baseUrl: string): string {
    try {
      const u = new URL(baseUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      // Base URL may already be an origin, or even host:port.
      return baseUrl;
    }
  }

  private getState(): ContextViewState {
    const config = vscode.workspace.getConfiguration('unfault');
    const baseUrl = config.get('fault.baseUrl', 'http://127.0.0.1:8000');
    this.faultState = {
      ...this.faultState,
      baseUrl
    };

    return {
      serverState: this.serverState,
      activeFile: {
        uri: this.activeEditor?.document.uri.toString() ?? null,
        languageId: this.activeEditor?.document.languageId ?? null
      },
      centrality: this.centrality,
      dependencies: this.dependencies,
      activeImpact: this.activeImpact,
      pinnedImpact: this.pinnedImpact,
      activeHttpCall: this.activeHttpCall,
      fault: this.faultState
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

    .code {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 4px;
      padding: 6px 8px;
      white-space: pre-wrap;
      word-break: break-word;
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

    .help {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      border-radius: 999px;
      border: 1px solid var(--vscode-widget-border);
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
      line-height: 1;
      background: transparent;
      cursor: default;
      user-select: none;
    }

    .steps {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .step {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      line-height: 1.3;
    }
    .step-n {
      width: 16px;
      height: 16px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--vscode-widget-border);
      color: var(--vscode-foreground);
      font-size: 10px;
      flex: 0 0 auto;
    }
    .step-body {
      flex: 1;
    }

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

    /* Fault injection form */
    .form-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin-top: 8px;
    }

    .field label {
      display: block;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }

    .input,
    .select {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: 12px;
    }

    .input:focus,
    .select:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 0;
    }

    .button-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    .pill {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid var(--vscode-widget-border);
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
    }

    @keyframes faultFlash {
      0% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); }
      20% { box-shadow: 0 0 0 2px var(--vscode-focusBorder); }
      100% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); }
    }

    .flash {
      animation: faultFlash 1.2s ease-out;
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

    function getPersistedState() {
      return vscode.getState() || {};
    }

    let faultForm = getPersistedState().faultForm || {
      inboundTemplateId: 'latency_tail_normal',
      outboundTemplateId: 'latency_tail_normal'
    };

    // Backwards compat for older stored state
    if (faultForm && faultForm.templateId && !faultForm.inboundTemplateId) {
      faultForm = {
        inboundTemplateId: faultForm.templateId,
        outboundTemplateId: faultForm.templateId
      };
    }

    function setFaultForm(updates) {
      faultForm = { ...faultForm, ...updates };
      const current = getPersistedState();
      vscode.setState({ ...current, faultForm });
    }

    function getRemoteOrigin(baseUrl) {
      try {
        return new URL(baseUrl).origin;
      } catch {
        return baseUrl;
      }
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
            statusLine = budget.toFixed(1) + '% error budget remaining - getting tight';
          } else if (budget > 80) {
            statusLine = 'Healthy - ' + budget.toFixed(0) + '% error budget available';
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

    function renderFaultCard(state, impact, funcName) {
      const faultState = state.fault || { baseUrl: 'http://127.0.0.1:8000', status: 'idle' };
      const baseUrl = faultState.baseUrl || 'http://127.0.0.1:8000';
      const outbound = state.activeHttpCall || null;

      if (!impact && !outbound) {
        const inboundHelp = 'Inbound fault injection runs a local proxy between your client (curl) and your app server. Use it to validate timeouts, retries, and error handling at the API boundary.';
        const outboundHelp = 'Outbound fault injection runs a local proxy between your app and a remote HTTP dependency. Set the dependency URL env var to the proxy address and restart your app.';

        return '<div class="section" id="fault-injection-inbound">' +
          '<div class="section-label">INBOUND FAULT INJECTION <span class="help" title="' + esc(inboundHelp) + '">?</span></div>' +
          '<div class="card"><div class="muted">Move your cursor inside a function that is reachable from a route to enable inbound injection.</div></div>' +
          '</div>' +
          '<div class="section" id="fault-injection-outbound">' +
          '<div class="section-label">OUTBOUND FAULT INJECTION <span class="help" title="' + esc(outboundHelp) + '">?</span></div>' +
          '<div class="card"><div class="muted">Move your cursor onto an outbound HTTP call (e.g. httpx.get/post, requests.get/post, fetch) to enable outbound injection.</div></div>' +
          '</div>';
      }

      const route = (impact && impact.routes && impact.routes.length > 0) ? impact.routes[0] : null;
      const routePath = route && route.path ? String(route.path) : '/';
      const proxyUrl = 'http://127.0.0.1:9090' + (routePath.startsWith('/') ? routePath : ('/' + routePath));
      const remoteOrigin = getRemoteOrigin(baseUrl);

      const knownTemplates = [
        'latency_tail_normal',
        'latency_tail_spikes_pareto',
        'latency_brownout_window',
        'jitter_light_ingress',
        'jitter_bidirectional',
        'bandwidth_server_ingress_64_kbps',
        'bandwidth_client_both_48_kbps_plus_latency',
        'mobile_edge_3g',
        'packet_loss_constant',
        'packet_loss_burst',
        'blackhole_constant',
        'blackhole_window'
      ];

      function normalizeTemplateId(raw) {
        const id = raw || 'latency_tail_normal';
        return knownTemplates.includes(id) ? id : 'latency_tail_normal';
      }

      const inboundTemplateId = normalizeTemplateId(faultForm.inboundTemplateId || faultForm.templateId);
      const outboundTemplateId = normalizeTemplateId(faultForm.outboundTemplateId || faultForm.templateId);

      const isRunning = faultState.status === 'running';
      const canRun = !!impact;

      function opt(selectedId, id, label) {
        const selected = selectedId === id ? ' selected' : '';
        return '<option value="' + esc(id) + '"' + selected + '>' + esc(label) + '</option>';
      }

      const statusPill = (() => {
        if (faultState.status === 'running') {
          return '<span class="pill">Running...</span>';
        }
        if (faultState.lastRun) {
          const code = faultState.lastRun.exitCode;
          return '<span class="pill">Exit ' + esc(code === null ? 'unknown' : String(code)) + '</span>';
        }
        return '<span class="pill">Idle</span>';
      })();

      const errorLine = faultState.lastError
        ? '<div class="signal warning" style="margin-top: 8px;"><span class="signal-content">' + esc(faultState.lastError) + '</span></div>'
        : '';

      function templateIntentFor(templateId) {
        if (templateId === 'latency_tail_normal') {
          return 'Intent: expose timeout handling and tail-latency amplification (steady slow upstream).';
        }
        if (templateId === 'latency_tail_spikes_pareto') {
          return 'Intent: simulate rare latency spikes to validate p99 behavior and backpressure.';
        }
        if (templateId === 'latency_brownout_window') {
          return 'Intent: simulate a brownout window and validate degradation mode + recovery.';
        }
        if (templateId === 'jitter_light_ingress') {
          return 'Intent: introduce variable delays to test jitter sensitivity and retry timing.';
        }
        if (templateId === 'jitter_bidirectional') {
          return 'Intent: stress interactive flows with jitter both ways.';
        }
        if (templateId === 'bandwidth_server_ingress_64_kbps') {
          return 'Intent: throttle downloads/responses to validate streaming, pagination, and timeouts.';
        }
        if (templateId === 'bandwidth_client_both_48_kbps_plus_latency') {
          return 'Intent: simulate a slow client link to validate UX and payload sizing.';
        }
        if (templateId === 'mobile_edge_3g') {
          return 'Intent: emulate a sluggish mobile connection (low bandwidth + latency + jitter).';
        }
        if (templateId === 'packet_loss_constant') {
          return 'Intent: simulate flaky networks to reveal retry storms and hidden timeouts.';
        }
        if (templateId === 'packet_loss_burst') {
          return 'Intent: simulate intermittent loss bursts to validate resilience and recovery.';
        }
        if (templateId === 'blackhole_constant') {
          return 'Intent: force a hang/timeout path to validate cancellation and circuit breakers.';
        }
        if (templateId === 'blackhole_window') {
          return 'Intent: simulate a temporary outage and verify recovery behavior.';
        }
        return '';
      }

      const inboundHelp = 'Inbound fault injection runs a local proxy between your client (curl) and your app server. Use it to validate timeouts, retries, and error handling at the API boundary.';
      const outboundHelp = 'Outbound fault injection runs a local proxy between your app and a remote HTTP dependency. Set the dependency URL env var to the proxy address and restart your app.';

      const inboundTitle = impact ? (funcName || 'Current function') : 'Current function';

      const inboundBody =
        '<div class="card-header">' +
        '<span class="card-title">' + esc(inboundTitle) + '</span>' +
        '<span>' + statusPill + '</span>' +
        '</div>' +
        '<div class="muted" style="margin-top: 4px; line-height: 1.3;">Client → proxy → app (tests the API boundary).</div>' +
        '<div class="form-grid" style="margin-top: 8px;">' +
        '<div class="field">' +
        '<label for="fault-template-inbound">Fault type</label>' +
        '<select class="select" id="fault-template-inbound">' +
        opt(inboundTemplateId, 'latency_tail_normal', 'Latency: tail (350ms +/- 50ms)') +
        opt(inboundTemplateId, 'latency_tail_spikes_pareto', 'Latency: tail spikes (pareto)') +
        opt(inboundTemplateId, 'latency_brownout_window', 'Latency: brownout window (sched)') +
        opt(inboundTemplateId, 'jitter_light_ingress', 'Jitter: light ingress (30ms @ 5Hz)') +
        opt(inboundTemplateId, 'jitter_bidirectional', 'Jitter: bidirectional (30ms @ 8Hz)') +
        opt(inboundTemplateId, 'bandwidth_server_ingress_64_kbps', 'Bandwidth: server ingress (64 KBps)') +
        opt(inboundTemplateId, 'bandwidth_client_both_48_kbps_plus_latency', 'Bandwidth: client both (48 KBps) + latency') +
        opt(inboundTemplateId, 'mobile_edge_3g', 'Mobile edge: 48 KBps + 200ms + jitter') +
        opt(inboundTemplateId, 'packet_loss_constant', 'Packet loss: constant') +
        opt(inboundTemplateId, 'packet_loss_burst', 'Packet loss: burst window (sched)') +
        opt(inboundTemplateId, 'blackhole_constant', 'Blackhole: constant') +
        opt(inboundTemplateId, 'blackhole_window', 'Blackhole: outage window (sched)') +
        '</select>' +
        '<div class="muted" style="margin-top: 6px; line-height: 1.3;">' + esc(templateIntentFor(inboundTemplateId)) + '</div>' +
        '</div>' +
        '</div>' +
        '<div class="button-row" style="margin-top: 8px;">' +
        '<button class="button" data-action="faultRunInbound"' + (canRun ? '' : ' disabled') + '>' + (isRunning ? 'Restart proxy' : 'Start proxy') + '</button>' +
        '<button class="button" data-action="faultGenerateScenarioFile"' + (canRun ? '' : ' disabled') + '>Generate scenario file</button>' +
        '</div>' +
        '<div class="steps">' +
        '<div class="step"><span class="step-n">1</span><div class="step-body">Start the proxy for <span style="font-family: var(--vscode-editor-font-family);">' + esc(remoteOrigin) + '</span>.</div></div>' +
        '<div class="step"><span class="step-n">2</span><div class="step-body">Send your request via the proxy: <span style="font-family: var(--vscode-editor-font-family);">' + esc(proxyUrl) + '</span>.</div></div>' +
        '<div class="step"><span class="step-n">3</span><div class="step-body">Observe behavior: timeouts, retries, fallbacks, error messages.</div></div>' +
        '</div>' +
        '<div class="muted" style="margin-top: 8px; line-height: 1.3;">HTTP error templates are not available in streaming proxy mode.</div>' +
        (isRunning ? '<div class="muted" style="margin-top: 6px; line-height: 1.3;">Restart proxy will stop the current proxy and start a new one.</div>' : '') +
        errorLine;

      const egressCard = (() => {
        if (!outbound) {
          return '';
        }

        const detectedEnvVar = outbound.urlExpr && outbound.urlExpr.envVar ? String(outbound.urlExpr.envVar) : '';
        const inferredEnvVar = (!detectedEnvVar && outbound.urlExpr && outbound.urlExpr.text)
          ? inferEnvVarFromTemplateText(String(outbound.urlExpr.text))
          : '';
        const envVar = detectedEnvVar || inferredEnvVar;
        const canRunEgress = true;
        const urlLabel = outbound.url
          ? String(outbound.url)
          : (outbound.urlExpr ? String(outbound.urlExpr.text) : '');

        const remoteHint = outbound.url
          ? getRemoteOrigin(String(outbound.url))
          : (envVar ? ('$' + envVar + ' (needs current value)') : '');

        const exportLine = envVar
          ? ('export ' + envVar + '=http://127.0.0.1:9090')
          : 'export YOUR_DEP_URL=http://127.0.0.1:9090';

        let triggerLine = '';
        if (route && routePath) {
          try {
            const method = String(route.method || 'GET').toUpperCase();
            const prettyPath = String(routePath).replace(/\{([^}]+)\}/g, '<$1>');
            triggerLine = 'curl -i -X ' + esc(method) + ' ' + esc(joinUrlRaw(baseUrl, prettyPath));
          } catch {
            triggerLine = '';
          }
        }

        const steps =
          '<div class="steps">' +
          '<div class="step"><span class="step-n">1</span><div class="step-body">Start the proxy for the remote dependency: <span style="font-family: var(--vscode-editor-font-family);">' + esc(remoteHint || 'your dependency origin') + '</span>.</div></div>' +
          '<div class="step"><span class="step-n">2</span><div class="step-body">Point your app at the proxy (restart required):</div></div>' +
          '<div class="code" style="margin-left: 24px;">' + esc(exportLine) + '</div>' +
          '<div class="step"><span class="step-n">3</span><div class="step-body">Trigger the code path that performs the outbound call.' + (triggerLine ? ' (Example curl provided.)' : '') + '</div></div>' +
          (triggerLine ? ('<div class="code" style="margin-left: 24px;">' + esc(triggerLine) + '</div>') : '') +
          '</div>';

        const hint =
          'App → proxy → remote (tests resilience to dependency failures).';

        return '<div class="card" style="margin-top: 8px;">' +
          '<div class="card-header">' +
          '<span class="card-title">Outbound fault injection</span>' +
          '<span class="pill">Outbound</span>' +
          '</div>' +
          '<div class="muted" style="margin-top: 4px; line-height: 1.3;">' + esc(hint) + '</div>' +
          '<div class="muted" style="margin-top: 4px; line-height: 1.3;">' +
          esc(outbound.library + ' ' + outbound.method + ' ' + urlLabel) +
          '</div>' +
          (envVar ? (
            '<div class="muted" style="margin-top: 6px;">' +
            (detectedEnvVar
              ? 'Detected env var: '
              : 'Inferred env var: ') +
            '<span style="font-family: var(--vscode-editor-font-family);">' + esc(envVar) + '</span>' +
            '</div>'
          ) : ('<div class="muted" style="margin-top: 6px;">Env var: <span style="font-family: var(--vscode-editor-font-family);">(not detected)</span> — you will be prompted.</div>')) +
          '<div class="form-grid" style="margin-top: 8px;">' +
          '<div class="field">' +
          '<label for="fault-template-outbound">Fault type</label>' +
          '<select class="select" id="fault-template-outbound">' +
          opt(outboundTemplateId, 'latency_tail_normal', 'Latency: tail (350ms +/- 50ms)') +
          opt(outboundTemplateId, 'latency_tail_spikes_pareto', 'Latency: tail spikes (pareto)') +
          opt(outboundTemplateId, 'latency_brownout_window', 'Latency: brownout window (sched)') +
          opt(outboundTemplateId, 'jitter_light_ingress', 'Jitter: light ingress (30ms @ 5Hz)') +
          opt(outboundTemplateId, 'jitter_bidirectional', 'Jitter: bidirectional (30ms @ 8Hz)') +
          opt(outboundTemplateId, 'bandwidth_server_ingress_64_kbps', 'Bandwidth: server ingress (64 KBps)') +
          opt(outboundTemplateId, 'bandwidth_client_both_48_kbps_plus_latency', 'Bandwidth: client both (48 KBps) + latency') +
          opt(outboundTemplateId, 'mobile_edge_3g', 'Mobile edge: 48 KBps + 200ms + jitter') +
          opt(outboundTemplateId, 'packet_loss_constant', 'Packet loss: constant') +
          opt(outboundTemplateId, 'packet_loss_burst', 'Packet loss: burst window (sched)') +
          opt(outboundTemplateId, 'blackhole_constant', 'Blackhole: constant') +
          opt(outboundTemplateId, 'blackhole_window', 'Blackhole: outage window (sched)') +
          '</select>' +
          '<div class="muted" style="margin-top: 6px; line-height: 1.3;">' + esc(templateIntentFor(outboundTemplateId)) + '</div>' +
          '</div>' +
          '</div>' +
          '<div class="button-row" style="margin-top: 8px;">' +
          '<button class="button" data-action="faultRunOutbound"' + (canRunEgress ? '' : ' disabled') + '>' + (isRunning ? 'Restart proxy' : 'Start proxy') + '</button>' +
          '</div>' +
          '<div style="margin-top: 8px;">' + steps + '</div>' +
          '</div>';
      })();

      const inboundSection = '<div class="section" id="fault-injection-inbound">' +
        '<div class="section-label">INBOUND FAULT INJECTION <span class="help" title="' + esc(inboundHelp) + '">?</span></div>' +
        '<div class="card">' + inboundBody + '</div>' +
        '</div>';

      const outboundSection = egressCard
        ? ('<div class="section" id="fault-injection-outbound">' +
          '<div class="section-label">OUTBOUND FAULT INJECTION <span class="help" title="' + esc(outboundHelp) + '">?</span></div>' +
          egressCard +
          '</div>')
        : ('<div class="section" id="fault-injection-outbound">' +
          '<div class="section-label">OUTBOUND FAULT INJECTION <span class="help" title="' + esc(outboundHelp) + '">?</span></div>' +
          '<div class="card"><div class="muted">Move your cursor onto an outbound HTTP call to enable outbound injection.</div></div>' +
          '</div>');

      return inboundSection + outboundSection;
    }

    function inferEnvVarFromTemplateText(text) {
      // Best-effort: Python f-strings use {NAME}, JS template literals use \${NAME}.
      const vars = new Set();
      const pyRe = /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g;
      const jsRe = /\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g;
      let m;
      while ((m = pyRe.exec(text)) !== null) {
        vars.add(m[1]);
      }
      while ((m = jsRe.exec(text)) !== null) {
        vars.add(m[1]);
      }

      if (vars.size === 1) {
        return Array.from(vars)[0] || '';
      }

      // If there are multiple placeholders, prefer one that looks like an env var / base URL.
      const all = Array.from(vars);
      const envLike = all.filter(v => /^[A-Z][A-Z0-9_]*$/.test(v));

      const urlish = envLike.filter(v => /(^|_)(URL|URI|HOST|ENDPOINT)(_|$)/.test(v));
      if (urlish.length === 1) {
        return urlish[0];
      }
      if (urlish.length > 1) {
        // Prefer *_URL
        const exact = urlish.find(v => /(^|_)URL$/.test(v) || /_URL_/.test(v));
        return exact || urlish[0] || '';
      }

      if (envLike.length === 1) {
        return envLike[0];
      }

      return '';
    }

    function joinUrlRaw(baseUrl, path) {
      const b = String(baseUrl || '').replace(/\/+$/, '');
      const p0 = String(path || '');
      const p = p0.startsWith('/') ? p0 : ('/' + p0);
      return b + p;
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

      const faultCard = renderFaultCard(state, active, funcName);

      root.innerHTML = serverLine + fileCard + symbolCard + faultCard;
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
        case 'faultRunInbound': {
          const templateEl = document.getElementById('fault-template-inbound');
          if (!templateEl) {
            return;
          }
          const templateId = templateEl.value;
          setFaultForm({ inboundTemplateId: templateId });
          vscode.postMessage({
            command: 'faultRun',
            mode: 'ingress',
            templateId
          });
          break;
        }
        case 'faultRunOutbound': {
          const templateEl = document.getElementById('fault-template-outbound');
          if (!templateEl) {
            return;
          }
          const templateId = templateEl.value;
          setFaultForm({ outboundTemplateId: templateId });
          vscode.postMessage({
            command: 'faultRun',
            mode: 'egress',
            templateId
          });
          break;
        }
        case 'faultGenerateScenarioFile':
          vscode.postMessage({ command: 'faultGenerateScenarioFile' });
          break;
      }
    });

    document.addEventListener('input', (event) => {
      const el = event.target;
      if (!el || !el.id) return;
      // no text inputs
    });

    document.addEventListener('change', (event) => {
      const el = event.target;
      if (!el || !el.id) return;
      if (el.id === 'fault-template-inbound') {
        setFaultForm({ inboundTemplateId: el.value });
      }
      if (el.id === 'fault-template-outbound') {
        setFaultForm({ outboundTemplateId: el.value });
      }

      if (window.__lastState) {
        render(window.__lastState);
      }
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message) return;

      if (message.type === 'state') {
        window.__lastState = message.state;
        render(message.state);
        return;
      }

      if (message.type === 'focusFaultInjection') {
        const section = document.getElementById('fault-injection-inbound');
        if (section) {
          section.scrollIntoView({ block: 'center' });
          section.classList.remove('flash');
          // Force reflow so the animation reliably re-triggers
          void section.offsetWidth;
          section.classList.add('flash');
        }

        const templateEl = document.getElementById('fault-template-inbound');
        if (templateEl && typeof templateEl.focus === 'function') {
          templateEl.focus();
        }
      }
    });
  </script>
</body>
</html>`;
  }
}
