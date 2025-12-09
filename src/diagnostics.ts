/**
 * Diagnostic Converter
 *
 * Converts API diagnostics to VS Code diagnostics.
 */

import * as vscode from "vscode";
import { ApiDiagnostic, DiagnosticSeverity } from "./client";

/**
 * Extended VS Code diagnostic with finding ID.
 */
export interface UnfaultDiagnostic extends vscode.Diagnostic {
  findingId: string;
}

/**
 * Converts API diagnostics to VS Code diagnostics.
 */
export class DiagnosticConverter {
  /**
   * Convert an API diagnostic to a VS Code diagnostic.
   */
  static toDiagnostic(apiDiagnostic: ApiDiagnostic): UnfaultDiagnostic {
    // Validate range
    const startLine = apiDiagnostic.range?.start?.line ?? 0;
    const startChar = apiDiagnostic.range?.start?.character ?? 0;
    const endLine = apiDiagnostic.range?.end?.line ?? startLine;
    const endChar = apiDiagnostic.range?.end?.character ?? startChar + 1;

    const range = new vscode.Range(startLine, startChar, endLine, endChar);

    const severity = DiagnosticConverter.toSeverity(apiDiagnostic.severity);

    // Ensure message is not empty (VS Code requires a message)
    const message =
      apiDiagnostic.message || apiDiagnostic.code || "Unfault finding";

    const diagnostic = new vscode.Diagnostic(
      range,
      message,
      severity
    ) as UnfaultDiagnostic;

    diagnostic.source = apiDiagnostic.source || "unfault";
    diagnostic.code = apiDiagnostic.code;
    diagnostic.findingId = apiDiagnostic.finding_id;

    return diagnostic;
  }

  /**
   * Convert API severity to VS Code severity.
   */
  static toSeverity(severity: DiagnosticSeverity): vscode.DiagnosticSeverity {
    switch (severity) {
      case DiagnosticSeverity.Error:
        return vscode.DiagnosticSeverity.Error;
      case DiagnosticSeverity.Warning:
        return vscode.DiagnosticSeverity.Warning;
      case DiagnosticSeverity.Information:
        return vscode.DiagnosticSeverity.Information;
      case DiagnosticSeverity.Hint:
        return vscode.DiagnosticSeverity.Hint;
      default:
        return vscode.DiagnosticSeverity.Warning;
    }
  }
}