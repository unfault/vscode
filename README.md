# Unfault VS Code Extension

Cognitive context for code you ship.

Unfault keeps runtime context close by: call paths, dependents, entry points (routes, jobs), and the safeguards (or missing safeguards) in the chain. The goal is to reduce surprises without adding noise.

## What You Get

- **Impact at a glance**: see where a function is used and what depends on it
- **Routes and entry points**: understand which endpoints and background jobs a change may affect
- **Safeguards and gaps**: spot missing logging, retries, timeouts, etc. in the call chain
- **Calm defaults**: diagnostics are opt-in; default is hovers + sidebar context
- **Privacy-first architecture**: parsing happens locally; only derived IR is sent for analysis

## How It Works

When you open a supported file:

1. **Local parsing**: your code is parsed locally (via the Unfault CLI)
2. **Semantic graph**: imports, symbols, calls, and framework entry points are captured
3. **Analysis**: the graph is evaluated for production-readiness signals
4. **Display**: context shows up as hovers, code lenses, and the context sidebar

## Function Impact (Hover)

Hover a function name to see a compact summary:

```
process_payment() - high impact

Used by:
  • /api/checkout (POST)
  • /api/retry-payment (POST)
  • BackgroundTask: process_failed_payments

Safeguards observed:
  • structured logging: missing
  • retries: present (tenacity)
  • circuit breaker: missing

3 files depend on this function
```

The goal is not to alarm you. It keeps relevant context nearby.

## File Centrality

The status bar can surface how "wide" a file's blast radius is:

- **Hub file**: many importers / dependents
- **Important file**: moderate fan-in
- **Leaf file**: small local surface area

## Requirements

1. **Unfault CLI**

   ```bash
   cargo install unfault
   ```

2. **Authentication**

   ```bash
   unfault login
   ```

## Installation

1. Install the extension from the VS Code Marketplace
2. Ensure `unfault` is in your `PATH` (or set `unfault.executablePath`)
3. Open a supported file; the extension will start the Unfault language server

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `unfault.executablePath` | Path to the unfault CLI executable | `unfault` |
| `unfault.verbose` | Verbose logging for the LSP server | `false` |
| `unfault.trace.server` | Trace LSP communication for debugging | `off` |
| `unfault.diagnostics.enabled` | Show insights as squiggles (opt-in) | `false` |

## Supported Languages

- Python (.py)
- Go (.go)
- Rust (.rs)
- TypeScript (.ts, .tsx)
- JavaScript (.js, .jsx)

## Commands

- `Unfault: Welcome & Setup`
- `Unfault: Restart Unfault LSP Server`
- `Unfault: Show Unfault Menu`
- `Unfault: Show Unfault Output`
- `Unfault: Open Unfault Settings`
- `Unfault: Show Files That Depend on This File`
- `Unfault: Open Context Sidebar`

## Troubleshooting

### `unfault: command not found`

The CLI is not in your `PATH`.

- Add the directory containing `unfault` to `PATH`, or
- Set `unfault.executablePath` in VS Code settings

### No hovers or context

- Check Output: View -> Output -> "Unfault"
- Confirm login: `unfault login`
- Restart: "Unfault: Restart Unfault LSP Server"
- Confirm connectivity to `app.unfault.dev`

## Privacy

Your source code does not leave your machine. The CLI parses locally and sends only a derived semantic representation (imports, symbols, call relationships) to the Unfault API. See https://unfault.dev/privacy

## Production-readiness

Production-readiness here means: fewer unknowns during review, debugging, incident response, and on-call.

- Understand entry points and downstream effects before you edit
- See missing safeguards that make failures harder to diagnose or contain
- Keep context close, without turning the editor into an alert feed

## Risks

- Any analysis can be incomplete if the codebase is partially indexed, generated, or highly dynamic
- Initial analysis may be slower on very large repos (subsequent queries use cached context)

## Threats

- Misinterpreting a signal as certainty (treat this as context, not truth)
- Overfitting to "green checks" instead of operational requirements

## Ship

Use the insights as a steadying aid:

- Confirm impact radius
- Add the safeguard that makes failures legible
- Ship deliberately
