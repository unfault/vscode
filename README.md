<h2 align="center">
  <br>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/unfault/vscode/main/images/icon.png">
    <img alt="Unfault" src="https://raw.githubusercontent.com/unfault/vscode/main/images/icon.png" width="128">
  </picture>
</h2>

<h4 align="center">Unfault for VS Code — Cognitive context for the code you ship</h4>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=unfault.unfault"><img alt="VS Code Marketplace" src="https://img.shields.io/visual-studio-marketplace/v/unfault.unfault"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=unfault.unfault"><img alt="Installs" src="https://img.shields.io/visual-studio-marketplace/i/unfault.unfault"></a>
</p>

<p align="center">
  <a href="https://unfault.dev/docs/installation">Installation</a> •
  <a href="https://unfault.dev/docs">Documentation</a>
</p>

---

Unfault surfaces call paths, entry points, and gaps in safeguards — right where you're working. The goal is fewer surprises, not more noise.

## What It Does

- **Context sidebar** — see callers, routes, and SLOs linked to the function under your cursor
- **CodeLens hints** — compact summaries above functions showing usage and reachability
- **Findings** — optional diagnostics for missing timeouts, naive datetime usage, and similar patterns

## How It Works

1. The CLI parses your code locally
2. A semantic graph (imports, calls, entry points) is built
3. Analysis runs against production-readiness signals
4. Context appears in the sidebar and as code lenses

Your source stays on your machine. Only the derived graph is sent for analysis.

## Requirements

Install and authenticate the CLI: [unfault.dev/docs/installation](https://unfault.dev/docs/installation)

## Supported Languages

Python · Go · Rust · TypeScript · JavaScript

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `unfault.executablePath` | Path to the CLI executable | `unfault` |
| `unfault.verbose` | Verbose LSP logging | `false` |
| `unfault.trace.server` | Trace LSP communication (`off`, `messages`, `verbose`) | `off` |
| `unfault.codeLens.enabled` | Show code lens hints above functions | `true` |
| `unfault.codeLens.clickToOpen` | Click code lens to open sidebar | `true` |
| `unfault.diagnostics.enabled` | Show findings as squiggles | `false` |
| `unfault.diagnostics.minSeverity` | Minimum severity (`critical`, `high`, `medium`, `low`) | `high` |

## Troubleshooting

**CLI not found** — add `unfault` to your PATH or set `unfault.executablePath`

**No context showing** — check Output → "Unfault LSP" for errors, confirm login succeeded

## Privacy

Source code never leaves your machine. See [unfault.dev/privacy](https://unfault.dev/privacy)
