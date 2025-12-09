/**
 * Unfault VS Code Extension
 *
 * This extension provides production-readiness linting for your code by
 * integrating with the Unfault API server.
 */

import * as vscode from "vscode";
import { UnfaultClient, Logger, SubscriptionWarning, SubscriptionStatusResponse } from "./client";
import { DiagnosticConverter } from "./diagnostics";
import { configExists, getApiKey, getBaseUrl } from "./config";
import { WelcomePanel, checkConfigurationAndShowWelcome } from "./welcome";

// Supported languages
const SUPPORTED_LANGUAGES = ["python", "go", "rust", "typescript", "javascript"];

// Extension state
let client: UnfaultClient | null = null;
let diagnosticCollection: vscode.DiagnosticCollection;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
const debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
let isConfigured = false;
let subscriptionWarning: SubscriptionWarning | null = null;
let lastSubscriptionCheck: number = 0;
const SUBSCRIPTION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const shownNotifications: Set<string> = new Set(); // Track shown notifications per session

/**
 * Logger that writes to the VS Code output channel.
 */
function createLogger(): Logger {
  return {
    log: (msg: string) => {
      const timestamp = new Date().toISOString();
      outputChannel.appendLine(`[${timestamp}] ${msg}`);
      console.log(`[Unfault] ${msg}`);
    },
    error: (msg: string) => {
      const timestamp = new Date().toISOString();
      outputChannel.appendLine(`[${timestamp}] ERROR: ${msg}`);
      console.error(`[Unfault] ERROR: ${msg}`);
    },
  };
}

/**
 * Activate the extension.
 */
export function activate(context: vscode.ExtensionContext): void {
  // Create output channel first for logging
  outputChannel = vscode.window.createOutputChannel("Unfault");
  context.subscriptions.push(outputChannel);

  log("Unfault extension is activating...");

  // Create diagnostic collection
  diagnosticCollection = vscode.languages.createDiagnosticCollection("unfault");
  context.subscriptions.push(diagnosticCollection);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "unfault.showWelcome";
  context.subscriptions.push(statusBarItem);

  // Check for existing configuration
  isConfigured = checkConfiguration();
  log(`Configuration check: ${isConfigured ? "configured" : "not configured"}`);
  updateStatusBar();

  // Create API client if configured
  if (isConfigured) {
    initializeClient();
    // Check subscription status on activation
    checkSubscriptionStatus();
  }

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("unfault.analyzeFile", () => {
      if (!ensureConfigured(context)) {
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        analyzeDocument(editor.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("unfault.analyzeWorkspace", () => {
      if (!ensureConfigured(context)) {
        return;
      }
      // Analyze all open documents
      vscode.workspace.textDocuments.forEach((document) => {
        if (isSupportedDocument(document)) {
          analyzeDocumentDebounced(document);
        }
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("unfault.clearDiagnostics", () => {
      diagnosticCollection.clear();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("unfault.showWelcome", () => {
      WelcomePanel.createOrShow(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("unfault.refreshConfig", () => {
      isConfigured = checkConfiguration();
      updateStatusBar();
      if (isConfigured) {
        initializeClient();
        vscode.window.showInformationMessage("Unfault configuration refreshed");
        // Re-analyze open documents
        vscode.workspace.textDocuments.forEach((document) => {
          if (isSupportedDocument(document)) {
            analyzeDocumentDebounced(document);
          }
        });
      } else {
        client = null;
        diagnosticCollection.clear();
        WelcomePanel.createOrShow(context.extensionUri);
      }
    })
  );

  // Register code action provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      SUPPORTED_LANGUAGES.map((lang) => ({ language: lang })),
      new UnfaultCodeActionProvider(),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
      }
    )
  );

  // Watch for document events
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (!isConfigured) {
        return;
      }
      const config = vscode.workspace.getConfiguration("unfault");
      if (config.get<boolean>("enable", true) && config.get<boolean>("analyzeOnOpen", true)) {
        analyzeDocumentDebounced(document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!isConfigured) {
        return;
      }
      const config = vscode.workspace.getConfiguration("unfault");
      if (config.get<boolean>("enable", true) && config.get<boolean>("analyzeOnSave", true)) {
        analyzeDocumentDebounced(document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnosticCollection.delete(document.uri);
    })
  );

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("unfault.apiUrl")) {
        initializeClient();
      }
    })
  );

  // Show welcome panel if not configured
  if (!isConfigured) {
    // Show welcome panel after a short delay to let VS Code finish loading
    setTimeout(() => {
      checkConfigurationAndShowWelcome(context.extensionUri);
    }, 1000);
  } else {
    // Analyze all open documents on activation
    const config = vscode.workspace.getConfiguration("unfault");
    if (config.get<boolean>("enable", true) && config.get<boolean>("analyzeOnOpen", true)) {
      vscode.workspace.textDocuments.forEach((document) => {
        if (isSupportedDocument(document)) {
          analyzeDocumentDebounced(document);
        }
      });
    }
  }

  log("Unfault extension activated");
}

/**
 * Log a message to the output channel.
 */
function log(message: string): void {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] ${message}`);
  console.log(`[Unfault] ${message}`);
}

/**
 * Deactivate the extension.
 */
export function deactivate(): void {
  // Clear all debounce timers
  debounceTimers.forEach((timer) => clearTimeout(timer));
  debounceTimers.clear();

  log("Unfault extension deactivated");
}

/**
 * Check if the extension is configured.
 */
function checkConfiguration(): boolean {
  return configExists() && getApiKey() !== null;
}

/**
 * Update the status bar item.
 */
function updateStatusBar(): void {
  if (!isConfigured) {
    statusBarItem.text = "$(warning) Unfault";
    statusBarItem.tooltip = "Unfault: Not configured - Click to setup";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  } else if (subscriptionWarning?.type === "trial_expired") {
    // Expired trial - show warning
    statusBarItem.text = "$(warning) Unfault (Limited)";
    statusBarItem.tooltip = `Unfault: ${subscriptionWarning.message}\nClick to subscribe`;
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  } else if (subscriptionWarning?.type === "trial_ending") {
    // Trial ending soon - show info badge
    const days = subscriptionWarning.days_remaining;
    statusBarItem.text = `$(shield) Unfault (${days}d)`;
    statusBarItem.tooltip = `Unfault: ${subscriptionWarning.message}\nClick for details`;
    statusBarItem.backgroundColor = undefined;
  } else {
    // Normal state
    statusBarItem.text = "$(shield) Unfault";
    statusBarItem.tooltip = "Unfault: Ready - Click to open settings";
    statusBarItem.backgroundColor = undefined;
  }
  statusBarItem.show();
}

/**
 * Ensure the extension is configured, showing welcome panel if not.
 */
function ensureConfigured(context: vscode.ExtensionContext): boolean {
  if (!isConfigured) {
    WelcomePanel.createOrShow(context.extensionUri);
    return false;
  }
  return true;
}

/**
 * Initialize the API client.
 */
function initializeClient(): void {
  // Priority: VS Code setting > config file > environment variable > default
  const vsCodeConfig = vscode.workspace.getConfiguration("unfault");
  const vsCodeApiUrl = vsCodeConfig.get<string>("apiUrl");

  // Use VS Code setting if explicitly set, otherwise use config file/env
  const apiUrl = vsCodeApiUrl || getBaseUrl();

  // Get API key from config
  const apiKey = getApiKey();

  client = new UnfaultClient(apiUrl, apiKey, createLogger());
  log(`Client initialized with API URL: ${apiUrl}, API key: ${apiKey ? "configured" : "not configured"}`);
}

/**
 * Check subscription status and show appropriate notifications.
 * This is rate-limited to once per 24 hours to avoid spamming the API.
 */
async function checkSubscriptionStatus(): Promise<void> {
  if (!client || !isConfigured) {
    return;
  }

  // Rate limit subscription checks
  const now = Date.now();
  if (now - lastSubscriptionCheck < SUBSCRIPTION_CHECK_INTERVAL_MS) {
    log("Subscription check skipped (rate limited)");
    return;
  }
  lastSubscriptionCheck = now;

  try {
    log("Checking subscription status...");
    const status = await client.getSubscriptionStatus();
    subscriptionWarning = client.buildSubscriptionWarning(status);

    // Update status bar with subscription info
    updateStatusBar();

    // Show notification if there's a warning
    if (subscriptionWarning) {
      showSubscriptionNotification(subscriptionWarning);
    }

    log(
      `Subscription status: ${status.subscription_status}, warning: ${subscriptionWarning?.type || "none"}`
    );
  } catch (error) {
    // Don't block on subscription check failures
    log(`Failed to check subscription status: ${error}`);
  }
}

/**
 * Show a non-blocking notification for subscription warnings.
 * Uses behavioral science principles: nudge but don't block.
 */
function showSubscriptionNotification(warning: SubscriptionWarning): void {
  // Only show notification once per session for trial_ending (not every check)
  const notificationKey = `subscription_${warning.type}`;

  if (shownNotifications.has(notificationKey) && warning.type === "trial_ending") {
    return; // Only show trial_ending notification once per session
  }

  if (warning.type === "trial_expired") {
    // Warning notification for expired trial
    vscode.window
      .showWarningMessage(
        warning.message,
        "Subscribe Now",
        "Dismiss"
      )
      .then((selection) => {
        if (selection === "Subscribe Now") {
          vscode.env.openExternal(vscode.Uri.parse(warning.upgrade_url));
        }
      });
  } else if (warning.type === "trial_ending") {
    // Info notification for trial ending soon
    vscode.window
      .showInformationMessage(
        warning.message,
        "Subscribe Now",
        "Remind Me Later"
      )
      .then((selection) => {
        if (selection === "Subscribe Now") {
          vscode.env.openExternal(vscode.Uri.parse(warning.upgrade_url));
        }
      });
  }

  // Mark as shown for this session (to avoid nagging)
  shownNotifications.add(notificationKey);
}

/**
 * Check if a document is supported.
 */
function isSupportedDocument(document: vscode.TextDocument): boolean {
  return SUPPORTED_LANGUAGES.includes(document.languageId);
}

/**
 * Get the language ID for the API.
 */
function getLanguageId(document: vscode.TextDocument): string {
  // Map VS Code language IDs to API language IDs
  const languageMap: Record<string, string> = {
    python: "python",
    go: "go",
    rust: "rust",
    typescript: "typescript",
    javascript: "javascript",
  };
  return languageMap[document.languageId] || document.languageId;
}

/**
 * Analyze a document with debouncing.
 */
function analyzeDocumentDebounced(document: vscode.TextDocument): void {
  if (!isSupportedDocument(document) || !isConfigured) {
    return;
  }

  const uri = document.uri.toString();
  const config = vscode.workspace.getConfiguration("unfault");
  const debounceMs = config.get<number>("debounceMs", 500);

  // Clear existing timer
  const existingTimer = debounceTimers.get(uri);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Set new timer
  const timer = setTimeout(() => {
    debounceTimers.delete(uri);
    analyzeDocument(document);
  }, debounceMs);

  debounceTimers.set(uri, timer);
}

/**
 * Analyze a document and update diagnostics.
 */
async function analyzeDocument(document: vscode.TextDocument): Promise<void> {
  if (!isSupportedDocument(document) || !client) {
    return;
  }

  const config = vscode.workspace.getConfiguration("unfault");
  if (!config.get<boolean>("enable", true)) {
    return;
  }

  log(`Analyzing: ${document.uri.fsPath} (${document.languageId})`);

  try {
    const languageId = getLanguageId(document);
    const profile = config.get<string>("profile", "auto");
    const profileOverride = profile === "auto" ? undefined : profile;

    const response = await client.getDiagnostics(
      document.uri.toString(),
      document.getText(),
      languageId,
      profileOverride
    );

    // Convert API diagnostics to VS Code diagnostics
    const diagnostics = response.diagnostics.map((d) =>
      DiagnosticConverter.toDiagnostic(d)
    );

    diagnosticCollection.set(document.uri, diagnostics);
    log(`Analysis complete: ${diagnostics.length} diagnostics for ${document.uri.fsPath}`);
  } catch (error) {
    // Check if it's an authentication error
    if (error instanceof Error && error.message.includes("401")) {
      log(`Authentication error for ${document.uri.fsPath}`);
      vscode.window.showErrorMessage(
        "Unfault: Authentication failed. Please check your API key.",
        "Open Setup"
      ).then((selection) => {
        if (selection === "Open Setup") {
          vscode.commands.executeCommand("unfault.showWelcome");
        }
      });
    } else {
      log(`Analysis failed for ${document.uri.fsPath}: ${error}`);
    }
  }
}

/**
 * Code action provider for quick fixes.
 */
class UnfaultCodeActionProvider implements vscode.CodeActionProvider {
  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeAction[]> {
    if (!client) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    // Get unfault diagnostics in the range
    const unfaultDiagnostics = context.diagnostics.filter(
      (d) => d.source === "unfault"
    );

    for (const diagnostic of unfaultDiagnostics) {
      // Get the finding ID from the diagnostic
      const findingId = (diagnostic as vscode.Diagnostic & { findingId?: string }).findingId;
      if (!findingId) {
        continue;
      }

      try {
        const response = await client.getCodeActions(
          document.uri.toString(),
          document.getText(),
          findingId
        );

        for (const apiAction of response.actions) {
          const action = new vscode.CodeAction(
            apiAction.title,
            vscode.CodeActionKind.QuickFix
          );

          action.diagnostics = [diagnostic];
          action.isPreferred = apiAction.is_preferred;

          // Create workspace edit
          const edit = new vscode.WorkspaceEdit();
          for (const textEdit of apiAction.edits) {
            const range = new vscode.Range(
              textEdit.range.start.line,
              textEdit.range.start.character,
              textEdit.range.end.line,
              textEdit.range.end.character
            );
            edit.replace(document.uri, range, textEdit.new_text);
          }
          action.edit = edit;

          actions.push(action);
        }
      } catch (error) {
        log(`Failed to get code actions: ${error}`);
      }
    }

    return actions;
  }
}