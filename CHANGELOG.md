# Change Log

All notable changes to the "Unfault" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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