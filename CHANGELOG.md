# Change Log

All notable changes to the "Unfault" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.7] - 2026-01-22

### Fixed
- Restored updated dev dependencies (no downgrades) and added ESLint v9 flat config so `npm run lint` works.

## [0.9.6] - 2026-01-22

### Fixed
- Updated VS Code engine requirement to match `@types/vscode` so `vsce package` succeeds.

## [0.9.5] - 2026-01-22

### Added
- New `Run fault injection for current function` command to generate + run a `fault scenario` from the current function context.
- New settings: `unfault.fault.executablePath` and `unfault.fault.baseUrl`.

## [0.9.4] - 2026-01-20

### Changed
- Bumped extension version to 0.9.4.

## [0.9.3] - 2026-01-15

### Fixed
- Bundled the extension with esbuild to resolve dependency issues.
- Hid CodeLens for functions with no available context.

### Changed
- Switched CodeLens prefix from "Unfault:" to "uf:".
- Updated README copy and layout.

## [0.9.2] - 2026-01-15

### Changed
- Updated README voice and metadata.

## [0.9.1] - 2026-01-14

### Added
- Added expandable insights with finding details in sidebar.
- Added insights and pathInsights to FunctionImpactData interface.
- Added SLOs display and impact information in sidebar.
- Added caller table with hop counts.
- Added collapsible importers list in FILE card.
- Added call path tree view for route handlers.
- Added SLO health display and inherited SLO impact for nested functions.
- Added softer phrasing for missing SLO info.
- Added refresh findings after document changes via single-file analysis.
- Added refresh on analysis complete notification.
- **File Dependencies**: New command `Unfault: Show Files That Depend on This File` to discover reverse dependencies.
- **Dependency Notifications**: When a file has dependents, shows an information message with the count.
- **Quick Pick Browser**: Navigate to dependent files from the quick pick list, showing both direct and transitive dependents.
- Status bar menu now includes "Show File Dependents" option.

### Changed
- Softened tone to match calm, helpful voice across sidebar UI.
- Increased insight detail font size from 10px to 11px for readability.
- Refresh function impact on save instead of on change.

### Fixed
- Use human-friendly insights instead of raw risk categories.
- Fixed sidebar refresh function impact after document changes.
- Fixed sidebar cache and restore centrality/dependencies when switching files.
- Fixed sidebar show call path for route handlers with no callers.
- Fixed sidebar deduplicate SLOs by name.
- Fixed sidebar use event delegation for button clicks (CSP-safe).
- Fixed register and render context view properly after webview loads.
- Sidebar sections reordered and call path tree improved.

## [0.8.0] - 2025-12-22

### Changed

- **Status Bar**: Replaced "Unfault" text with logo icon to reduce screen real estate usage
- Status bar now shows: logo only (idle/unsupported files), logo + ✓ (no issues), or logo + count (issues found)

### Added

- Custom icon font (`unfault-icons.woff2`) for the Unfault logo
- Added `npm run icons` script to regenerate icon font from SVG sources

## [0.7.1] - 2025-12-21

### Fixed

- Fixed `--stdio` argument error that caused LSP server startup failures
- The CLI now accepts the hidden `--stdio` flag for compatibility with vscode-languageclient

## [0.7.0] - 2025-12-21

### Added

- **Persistent Status Bar**: The Unfault status bar item is now always visible, providing at-a-glance information about the extension state
- **Status Bar Menu**: Click the status bar to access a quick pick menu with options:
  - Open Settings
  - Show Output (LSP server logs)
  - Restart Server
  - Documentation (opens https://unfault.dev/docs)
- **Diagnostics Counter**: Status bar shows the number of issues found (e.g., "Unfault: 3")
- **Visual Severity Indicators**: Status bar background color changes based on issue severity (red for errors, yellow for warnings)
- **Server State Feedback**: Shows loading spinner when starting, warning state when stopped or on error
- **File Centrality Display**: When graph data is available, shows hub/star icons for important files
- **New Commands**:
  - `unfault.showWelcome` - Opens the welcome & setup panel
  - `unfault.showMenu` - Opens the quick pick menu
  - `unfault.showOutput` - Shows LSP output panel
  - `unfault.openSettings` - Opens Unfault settings
- **Welcome Panel**: Re-introduced onboarding panel with:
  - Authentication status display
  - Easy setup for `unfault login` or API key configuration
  - Links to documentation
  - Access via status bar menu → "Welcome & Setup"

### Changed

- Status bar is now always visible (not just when issues are found)
- Clicking status bar now opens a menu instead of just showing output
- Improved tooltip with rich markdown information

## [0.6.0] - 2025-12-21

### Changed

- **Architecture**: Migrated to a full Language Server Protocol (LSP) implementation
- **Configuration**: Simplified settings. Now uses `unfault.executablePath` to point to the CLI
- **Commands**: Removed manual analysis commands. Analysis is now automatic via LSP
- **Activation**: Extension now activates on supported languages (Python, Go, Rust, TypeScript, JavaScript)

### Removed

- Removed `unfault.enable`, `unfault.apiUrl`, `unfault.analyzeOnSave`, `unfault.analyzeOnOpen`, `unfault.debounceMs`, `unfault.profile` settings
- Removed manual analysis commands (`Unfault: Analyze Current File`, etc.)
- Removed Welcome panel (configuration is now via settings)

### Added

- Added `unfault.restartServer` command
- Added `vscode-languageclient` dependency

## [0.5.0] - 2025-12-09

### Added

- Removed base64 encoding of diagnostics payload to match API

## [0.4.1] - 2025-12-09

### Added

- Fixed version

## [0.4.0] - 2025-12-09

### Added

- Icon

## [0.3.0] - 2025-12-09

### Added

- Fixed release version

## [0.2.0] - 2025-12-09

### Added

- Prepared for release

## [0.1.0] - 2025-12-08

### Added

- **Real-time Analysis**: Diagnostics appear as you code with support for Python, Go, Rust, TypeScript, and JavaScript
- **Quick Fixes**: Apply suggested fixes via VS Code's code actions
- **Configuration Management**: Read API key from CLI config file (`~/.config/unfault/config.json`)
- **Welcome Panel**: Setup wizard to configure API key or run `unfault login`
- **Commands**:
  - `Unfault: Analyze Current File` - Manual single-file analysis
  - `Unfault: Analyze All Open Files` - Analyze all open documents
  - `Unfault: Clear Diagnostics` - Clear all Unfault diagnostics
  - `Unfault: Setup / Configure API Key` - Open the configuration panel
  - `Unfault: Refresh Configuration` - Reload from config file
- **Settings**:
  - `unfault.enable` - Enable/disable diagnostics
  - `unfault.apiUrl` - Custom API server URL
  - `unfault.analyzeOnSave` - Analyze on file save
  - `unfault.analyzeOnOpen` - Analyze on file open
  - `unfault.debounceMs` - Debounce delay for analysis
  - `unfault.profile` - Profile selection (auto or language-specific)
- **LSP Profiles**: Uses language-specific LSP profiles to avoid false positives in single-file analysis

[0.9.7]: https://github.com/unfault/vscode/compare/v0.9.6...v0.9.7
[0.9.6]: https://github.com/unfault/vscode/compare/v0.9.5...v0.9.6
[0.9.5]: https://github.com/unfault/vscode/compare/v0.9.4...v0.9.5
[0.9.4]: https://github.com/unfault/vscode/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/unfault/vscode/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/unfault/vscode/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/unfault/vscode/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/unfault/vscode/releases/tag/v0.9.0
