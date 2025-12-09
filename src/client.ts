/**
 * Unfault API Client
 *
 * HTTP client for communicating with the Unfault API server.
 */

// Logger interface for dependency injection
export interface Logger {
  log(message: string): void;
  error(message: string): void;
}

// Default console logger
const defaultLogger: Logger = {
  log: (msg) => console.log(`[Unfault] ${msg}`),
  error: (msg) => console.error(`[Unfault] ${msg}`),
};

/**
 * Position in a text document (0-indexed).
 */
export interface Position {
  line: number;
  character: number;
}

/**
 * Range in a text document.
 */
export interface Range {
  start: Position;
  end: Position;
}

/**
 * Diagnostic severity levels (LSP spec).
 */
export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

/**
 * A diagnostic from the API.
 */
export interface ApiDiagnostic {
  range: Range;
  severity: DiagnosticSeverity;
  code: string;
  source: string;
  message: string;
  rule_id: string;
  finding_id: string;
}

/**
 * Response from the diagnostics endpoint.
 */
export interface DiagnosticsResponse {
  uri: string;
  diagnostics: ApiDiagnostic[];
  analysis_time_ms: number;
}

/**
 * A text edit.
 */
export interface TextEdit {
  range: Range;
  new_text: string;
}

/**
 * A code action from the API.
 */
export interface ApiCodeAction {
  title: string;
  kind: string;
  is_preferred: boolean;
  edits: TextEdit[];
}

/**
 * Response from the code-actions endpoint.
 */
export interface CodeActionsResponse {
  actions: ApiCodeAction[];
}

/**
 * Subscription warning for nudging users about trial status.
 */
export interface SubscriptionWarning {
  type: "trial_ending" | "trial_expired";
  message: string;
  days_remaining: number | null;
  subscription_status: string;
  upgrade_url: string;
}

/**
 * Response from the subscription status endpoint.
 */
export interface SubscriptionStatusResponse {
  is_subscribed: boolean;
  subscription_status: "trial" | "active" | "expired" | "cancelled" | "past_due";
  trial_ends_at: string | null;
  days_remaining: number | null;
  features: string[];
}

/**
 * HTTP client for the Unfault API.
 */
export class UnfaultClient {
  private baseUrl: string;
  private apiKey: string | null;
  private logger: Logger;

  constructor(baseUrl: string, apiKey: string | null = null, logger: Logger = defaultLogger) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = apiKey;
    this.logger = logger;
  }

  /**
   * Build headers for API requests.
   * Includes Authorization header if API key is configured.
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Get diagnostics for a file.
   */
  async getDiagnostics(
    uri: string,
    content: string,
    languageId: string,
    profile?: string
  ): Promise<DiagnosticsResponse> {
    const url = `${this.baseUrl}/api/v1/lsp/diagnostics`;
    const body = {
      uri,
      content,
      language_id: languageId,
      profile: profile || null,
    };

    this.logger.log(
      `POST ${url} - uri=${uri}, language=${languageId}, content_length=${content.length}`
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`API error: ${response.status} - ${error}`);
        throw new Error(`API error: ${response.status} - ${error}`);
      }

      const result = (await response.json()) as DiagnosticsResponse;
      this.logger.log(
        `Response: ${result.diagnostics.length} diagnostics in ${result.analysis_time_ms?.toFixed(2) ?? "?"}ms`
      );
      return result;
    } catch (error) {
      this.logger.error(`Request failed: ${error}`);
      throw error;
    }
  }

  /**
   * Get code actions for a finding.
   */
  async getCodeActions(
    uri: string,
    content: string,
    findingId: string
  ): Promise<CodeActionsResponse> {
    const url = `${this.baseUrl}/api/v1/lsp/code-actions`;
    const body = {
      uri,
      content,
      finding_id: findingId,
    };

    this.logger.log(`POST ${url} - finding_id=${findingId}`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`API error: ${response.status} - ${error}`);
        throw new Error(`API error: ${response.status} - ${error}`);
      }

      const result = (await response.json()) as CodeActionsResponse;
      this.logger.log(`Response: ${result.actions.length} code actions`);
      return result;
    } catch (error) {
      this.logger.error(`Request failed: ${error}`);
      throw error;
    }
  }

  /**
   * Get subscription status for the authenticated user.
   */
  async getSubscriptionStatus(): Promise<SubscriptionStatusResponse> {
    const url = `${this.baseUrl}/api/v1/subscription/status`;

    this.logger.log(`GET ${url}`);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`API error: ${response.status} - ${error}`);
        throw new Error(`API error: ${response.status} - ${error}`);
      }

      const result = (await response.json()) as SubscriptionStatusResponse;
      this.logger.log(
        `Subscription status: ${result.subscription_status}, days_remaining: ${result.days_remaining}`
      );
      return result;
    } catch (error) {
      this.logger.error(`Request failed: ${error}`);
      throw error;
    }
  }

  /**
   * Build a subscription warning from subscription status.
   * Returns null if no warning is needed.
   */
  buildSubscriptionWarning(
    status: SubscriptionStatusResponse
  ): SubscriptionWarning | null {
    // No warning for active paid subscribers
    if (status.subscription_status === "active") {
      return null;
    }

    // Handle trial status with <= 7 days remaining
    if (
      status.subscription_status === "trial" &&
      status.days_remaining !== null &&
      status.days_remaining <= 7
    ) {
      let message: string;
      if (status.days_remaining === 0) {
        message =
          "Your trial expires today. Subscribe to continue using Unfault.";
      } else if (status.days_remaining === 1) {
        message =
          "Your trial expires tomorrow. Subscribe to continue using Unfault.";
      } else {
        message = `Your trial expires in ${status.days_remaining} days. Subscribe to continue using Unfault.`;
      }

      return {
        type: "trial_ending",
        message,
        days_remaining: status.days_remaining,
        subscription_status: status.subscription_status,
        upgrade_url: "https://app.unfault.dev/billing",
      };
    }

    // Handle expired trial
    if (status.subscription_status === "expired") {
      return {
        type: "trial_expired",
        message:
          "Your trial has expired. Subscribe for full analysis results.",
        days_remaining: null,
        subscription_status: status.subscription_status,
        upgrade_url: "https://app.unfault.dev/billing",
      };
    }

    return null;
  }
}