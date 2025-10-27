/**
 * Diagnostics provider for Unfault
 */

import * as vscode from 'vscode';
import { Finding, SourceFinding, Severity } from './types';

export class FaultRulesDiagnostics {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('fault-rules');
  }

  /**
   * Convert API severity to VSCode severity
   */
  private convertSeverity(severity: Severity): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'critical':
      case 'high':
        return vscode.DiagnosticSeverity.Error;
      case 'medium':
        return vscode.DiagnosticSeverity.Warning;
      case 'low':
        return vscode.DiagnosticSeverity.Information;
      case 'info':
        return vscode.DiagnosticSeverity.Hint;
      default:
        return vscode.DiagnosticSeverity.Warning;
    }
  }

  /**
   * Get range from source finding
   */
  private getRange(finding: SourceFinding): vscode.Range {
    if (!finding.line) {
      return new vscode.Range(0, 0, 0, 0);
    }

    const line = Math.max(0, finding.line - 1); // Convert to 0-based
    const column = finding.column ? Math.max(0, finding.column - 1) : 0;

    // Create a range that highlights the entire line by default
    return new vscode.Range(
      new vscode.Position(line, column),
      new vscode.Position(line, column + 100) // Highlight rest of line
    );
  }

  /**
   * Create diagnostic message with badges
   */
  private createMessage(finding: Finding): string {
    let message = finding.title;
    
    if (finding.badges && finding.badges.length > 0) {
      const badges = finding.badges.map(b => `[${b}]`).join(' ');
      message = `${badges} ${message}`;
    }

    message += `\n\n${finding.why}`;

    if (finding.next) {
      message += `\n\n→ ${finding.next}`;
    }

    if (finding.rule_id) {
      message += `\n\nRule: ${finding.rule_id}`;
    }

    return message;
  }

  /**
   * Update diagnostics for findings
   */
  public updateDiagnostics(workspaceRoot: string, findings: Finding[]): void {
    // Clear all existing diagnostics
    this.diagnosticCollection.clear();

    // Group findings by file
    const findingsByFile = new Map<string, Finding[]>();
    
    for (const finding of findings) {
      // Only process source findings (which have file locations)
      if (finding.kind === 'source') {
        const sourceFinding = finding as SourceFinding;
        if (sourceFinding.file) {
          const filePath = vscode.Uri.file(
            workspaceRoot + '/' + sourceFinding.file
          ).fsPath;
          
          if (!findingsByFile.has(filePath)) {
            findingsByFile.set(filePath, []);
          }
          findingsByFile.get(filePath)!.push(sourceFinding);
        }
      }
    }

    // Create diagnostics for each file
    for (const [filePath, fileFindings] of findingsByFile.entries()) {
      const diagnostics: vscode.Diagnostic[] = fileFindings.map(finding => {
        const sourceFinding = finding as SourceFinding;
        const range = this.getRange(sourceFinding);
        const diagnostic = new vscode.Diagnostic(
          range,
          this.createMessage(finding),
          this.convertSeverity(finding.severity)
        );

        diagnostic.source = 'fault-rules';
        diagnostic.code = finding.rule_id;
        
        // Store finding for code actions
        (diagnostic as any).finding = finding;

        return diagnostic;
      });

      const uri = vscode.Uri.file(filePath);
      this.diagnosticCollection.set(uri, diagnostics);
    }
  }

  /**
   * Clear diagnostics for a specific file
   */
  public clearFile(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri);
  }

  /**
   * Clear all diagnostics
   */
  public clear(): void {
    this.diagnosticCollection.clear();
  }

  /**
   * Get diagnostic collection
   */
  public getCollection(): vscode.DiagnosticCollection {
    return this.diagnosticCollection;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.diagnosticCollection.dispose();
  }
}