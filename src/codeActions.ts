/**
 * Code actions provider for applying fixes
 */

import * as vscode from 'vscode';
import { Finding, PatchSet, PatchOp } from './types';
import { FaultRulesApiClient } from './apiClient';

export class FaultRulesCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private apiClient: FaultRulesApiClient) {}

  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];
    const findings: Finding[] = [];
    const diagnosticsMap = new Map<Finding, vscode.Diagnostic>();

    // Collect all findings from diagnostics in context
    // (These are the diagnostics that would show up in the quick fix menu)
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'fault-rules') {
        continue;
      }

      const finding = (diagnostic as any).finding as Finding;
      if (!finding) {
        continue;
      }

      findings.push(finding);
      diagnosticsMap.set(finding, diagnostic);
    }

    // ALWAYS create a grouped explanation action for consistency
    // This provides a single, predictable way to explain findings
    if (findings.length >= 1) {
      const groupedExplainAction = this.createGroupedExplainAction(findings, Array.from(diagnosticsMap.values()));
      actions.push(groupedExplainAction);
    }

    // Create fix actions for each finding
    for (const finding of findings) {
      const diagnostic = diagnosticsMap.get(finding)!;

      // Always create fix actions (these are not being grouped)
      if (finding.proposed_fixes && finding.proposed_fixes.length > 0) {
        for (const proposedFix of finding.proposed_fixes) {
          const fixAction = await this.createFixActionFromProposed(proposedFix, finding, diagnostic, document);
          if (fixAction) {
            actions.push(fixAction);
          }
        }
      } else if (finding.diff || finding.rule_id) {
        const fixAction = await this.createFixAction(finding, diagnostic, document);
        if (fixAction) {
          actions.push(fixAction);
        }
      }
    }

    return actions;
  }

  private createGroupedExplainAction(
    findings: Finding[],
    diagnostics: vscode.Diagnostic[]
  ): vscode.CodeAction {
    const ruleIds = findings
      .map(f => f.rule_id || f.title)
      .filter((id, index, self) => id && self.indexOf(id) === index); // Deduplicate
    
    // Use singular/plural based on count for better UX
    const title = findings.length === 1
      ? '📚 Explain Operational Posture'
      : `📚 Explain Operational Posture (${findings.length} issues)`;
    
    const action = new vscode.CodeAction(
      title,
      vscode.CodeActionKind.QuickFix
    );
    action.command = {
      command: 'fault-rules.explainBatch',
      title: 'Explain Operational Posture',
      arguments: [ruleIds, findings],
    };
    action.diagnostics = diagnostics;
    action.isPreferred = false;
    return action;
  }

  private createExplainAction(
    finding: Finding,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      `Explain: ${finding.title}`,
      vscode.CodeActionKind.QuickFix
    );
    action.command = {
      command: 'fault-rules.explainRule',
      title: 'Explain Rule',
      arguments: [finding.rule_id || finding.title],
    };
    action.diagnostics = [diagnostic];
    action.isPreferred = false;
    return action;
  }

  private async createFixAction(
    finding: Finding,
    diagnostic: vscode.Diagnostic,
    document: vscode.TextDocument
  ): Promise<vscode.CodeAction | null> {
    const action = new vscode.CodeAction(
      `Fix: ${finding.title}`,
      vscode.CodeActionKind.QuickFix
    );

    // If we have a diff directly, use it
    if (finding.diff) {
      // Parse and apply the unified diff
      // For now, store the diff for manual application
      action.command = {
        command: 'fault-rules.applyFix',
        title: 'Apply Fix',
        arguments: [finding, document.uri],
      };
    } else {
      // Otherwise, fetch the proposed change from API
      action.command = {
        command: 'fault-rules.applyFix',
        title: 'Apply Fix',
        arguments: [finding, document.uri],
      };
    }

    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    return action;
  }

  private async createFixActionFromProposed(
    proposedFix: any,
    finding: Finding,
    diagnostic: vscode.Diagnostic,
    document: vscode.TextDocument
  ): Promise<vscode.CodeAction | null> {
    // Handle patch_set type
    if (proposedFix.type === 'patch_set') {
      const patchSet = proposedFix as PatchSet;
      const title = `Fix: ${finding.title}${patchSet.estimated_effort_minutes ? ` (~${patchSet.estimated_effort_minutes}min)` : ''}`;
      
      const action = new vscode.CodeAction(
        title,
        vscode.CodeActionKind.QuickFix
      );

      action.command = {
        command: 'fault-rules.applyProposedFix',
        title: 'Apply Proposed Fix',
        arguments: [proposedFix, finding, document.uri],
      };

      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      return action;
    }
    
    // Handle command_set type
    if (proposedFix.type === 'command_set') {
      const commandSet = proposedFix;
      const title = `Run: ${finding.title}${commandSet.estimated_effort_minutes ? ` (~${commandSet.estimated_effort_minutes}min)` : ''}`;
      
      const action = new vscode.CodeAction(
        title,
        vscode.CodeActionKind.QuickFix
      );

      action.command = {
        command: 'fault-rules.applyProposedFix',
        title: 'Apply Proposed Fix',
        arguments: [proposedFix, finding, document.uri],
      };

      action.diagnostics = [diagnostic];
      action.isPreferred = false; // Commands are less preferred than patches
      return action;
    }

    return null;
  }
}

/**
 * Apply a patch operation to a document
 */
export async function applyPatchOp(
  op: PatchOp,
  workspaceRoot: string
): Promise<void> {
  const filePath = vscode.Uri.file(workspaceRoot + '/' + op.path);
  
  try {
    const document = await vscode.workspace.openTextDocument(filePath);
    const edit = new vscode.WorkspaceEdit();

    switch (op.kind) {
      case 'unified_diff':
        // Parse unified diff and apply changes
        await applyUnifiedDiff(document, edit, op.content);
        break;
      
      case 'text_replace':
        // Simple text replacement
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        );
        edit.replace(filePath, fullRange, op.content);
        break;

      default:
        vscode.window.showWarningMessage(
          `Patch kind '${op.kind}' not yet supported`
        );
        return;
    }

    await vscode.workspace.applyEdit(edit);
    await document.save();
    vscode.window.showInformationMessage('Fix applied successfully');
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to apply fix: ${error.message}`);
  }
}

/**
 * Apply unified diff to document
 */
async function applyUnifiedDiff(
  document: vscode.TextDocument,
  edit: vscode.WorkspaceEdit,
  diff: string
): Promise<void> {
  // Simple unified diff parser
  // In production, use a proper diff library like 'diff' or 'patch-package'
  
  const lines = diff.split('\n');
  let currentLine = 0;
  const changes: { line: number; remove: number; add: string[] }[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Parse hunk header: @@ -10,7 +10,7 @@
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        currentLine = parseInt(match[1], 10) - 1; // Convert to 0-based
      }
      continue;
    }
    
    // Skip diff metadata
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff')) {
      continue;
    }
    
    // Process change lines
    if (line.startsWith('-') && !line.startsWith('---')) {
      // Line to remove
      const nextAdds: string[] = [];
      let j = i + 1;
      
      // Collect consecutive additions
      while (j < lines.length && lines[j].startsWith('+') && !lines[j].startsWith('+++')) {
        nextAdds.push(lines[j].substring(1));
        j++;
      }
      
      changes.push({
        line: currentLine,
        remove: 1,
        add: nextAdds,
      });
      
      i = j - 1; // Skip processed additions
      currentLine++;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      // Pure addition (no preceding removal)
      // Collect consecutive pure additions
      const addLines: string[] = [line.substring(1)];
      let j = i + 1;
      
      while (j < lines.length && lines[j].startsWith('+') && !lines[j].startsWith('+++')) {
        addLines.push(lines[j].substring(1));
        j++;
      }
      
      changes.push({
        line: currentLine,
        remove: 0,
        add: addLines,
      });
      
      i = j - 1; // Skip processed additions
    } else if (line.startsWith(' ')) {
      // Context line (unchanged)
      currentLine++;
    }
  }
  
  // Apply changes in reverse order to maintain line numbers
  for (const change of changes.reverse()) {
    const startPos = new vscode.Position(change.line, 0);
    const endPos = new vscode.Position(change.line + change.remove, 0);
    const range = new vscode.Range(startPos, endPos);
    
    const newText = change.add.length > 0 
      ? change.add.join('\n') + '\n'
      : '';
    
    edit.replace(document.uri, range, newText);
  }
}

/**
 * Apply a complete patch set
 */
export async function applyPatchSet(
  patchSet: PatchSet,
  workspaceRoot: string
): Promise<void> {
  const totalOps = patchSet.ops.length;
  
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Applying fixes',
      cancellable: false,
    },
    async (progress) => {
      for (let i = 0; i < patchSet.ops.length; i++) {
        const op = patchSet.ops[i];
        progress.report({
          increment: (100 / totalOps),
          message: `Patching ${op.path}...`,
        });
        
        await applyPatchOp(op, workspaceRoot);
      }
    }
  );
  
  vscode.window.showInformationMessage(
    `Applied ${totalOps} fix${totalOps > 1 ? 'es' : ''} successfully`
  );
}