# Change Log

All notable changes to the "Unfault" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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