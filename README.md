# Unfault for VS Code

Catches production-harming patterns with reasoned guidance for your code.

## What It Does

Unfault analyzes your code for patterns that tend to cause problems once systems run in production - things like unbounded API calls, silent failure paths, and entangled responsibilities. Think of it as having a senior engineer review your work, pointing out decisions that compound into operational pain.

## Features

- **Pattern detection**: Analysis for production readiness across Python, JavaScript, TypeScript, Go, Rust, and Java
- **Inline guidance**: Issues appear as diagnostics with severity levels and suggested fixes  
- **Production readiness score**: System-wide assessment of your production posture
- **Quick fixes**: One-click application of proven patterns
- **Explanations**: Clear reasoning for why patterns matter

## Quick Start

1. **Install**: Download .vsix from releases → Extensions → Install from VSIX
2. **Connect**: Run `unfault login` in terminal (or paste API key when prompted)
3. **Analyze**: Save files or use Command Palette → "Unfault: Analyze"

## Configuration

```json
{
  "unfault.analysisMode": "local",     // local or cloud analysis
  "unfault.autoAnalyze": true,         // analyze on save
  "unfault.severityThreshold": "medium" // what issues to show
}
```

## Daily Usage

- **In flow**: Save files, fixes appear as inline diagnostics
- **Focused review**: Command Palette → "Unfault: Analyze Current File"
- **System view**: Command Palette → "Unfault: Analyze Entire Project"
- **Quick fixes**: Click lightbulb on issues → "Apply Fix"

## Supported Languages

Python, JavaScript, TypeScript, Go, Rust, Java

## Common Issues

**No issues**: Lower severity threshold or check exclude patterns  
**Fixes won't apply**: Use "Preview" first, resolve conflicts

## What Happens To Your Code

Code is sent securely to Unfault for pattern analysis. Focus is on patterns and structure, not business logic. Nothing stored permanently except the generated diff for the proposed
changes.

---

For detailed documentation, visit [unfault.dev/docs](https://unfault.dev/docs)

Built for developers who care about how things are built.