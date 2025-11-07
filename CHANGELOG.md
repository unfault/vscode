# Changelog

All notable changes to the Unfault VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4] - 2025-11-07

### Added
- Extension logo (logo.png) for better branding in VS Code marketplace

## [0.1.3] - 2025-11-07

### Changed
- Minor updates and improvements

## [0.1.2] - 2025-11-07

### Fixed
- Bug fixes and improvements

## [0.1.1] - 2025-11-07

### Added
- CHANGELOG.md file to track version history and release notes

## [0.1.0] - 2025-11-07

### Added
- Initial release of Unfault VS Code extension
- Production readiness analysis for Python, JavaScript, TypeScript, Go, Rust, and Java
- Authentication system with API key management
  - [`unfault.login`](src/auth.ts) command for user authentication
  - [`unfault.logout`](src/auth.ts) command for session management
  - [`unfault.updateApiKey`](src/auth.ts) command for API key updates
- File and project analysis capabilities
  - [`unfault.analyzeFile`](src/extension.ts) - Analyze current file
  - [`unfault.analyzeProject`](src/extension.ts) - Analyze entire project
  - [`unfault.showReadinessScore`](src/extension.ts) - Display production readiness score
- Code actions and quick fixes
  - [`unfault.applyFix`](src/codeActions.ts) - One-click application of suggested fixes
  - [`unfault.explainRule`](src/codeActions.ts) - Detailed explanations for detected issues
- Home view panel
  - [`unfault.showHome`](src/homeView.ts) - Dashboard for extension overview and status
- Diagnostic system with severity levels (info, low, medium, high, critical)
- Configuration options
  - Analysis mode (local/cloud)
  - Auto-analyze on save
  - Severity threshold filtering
  - File size limits (default: 1MB)
  - Exclude patterns for ignoring files
  - Inline annotations toggle
- Custom colors for severity levels (critical and high)
- Service discovery system for API endpoint configuration
- Build configuration system for development and production modes

### Configuration
- Default analysis mode: `local`
- Auto-analyze enabled by default
- Severity threshold: `info`
- Max file size: 1,048,576 bytes (1MB)
- Default exclude patterns: `node_modules/**`, test files, `.git/**`, `dist/**`, `build/**`

### Technical Details
- Minimum VS Code version: 1.75.0
- Language support: Python, JavaScript, TypeScript, Go, Rust, Java
- Built with TypeScript
- Uses axios for HTTP requests
- Includes GitHub Actions workflows for build and publish

[0.1.4]: https://github.com/unfault/vscode/releases/tag/v0.1.4
[0.1.3]: https://github.com/unfault/vscode/releases/tag/v0.1.3
[0.1.2]: https://github.com/unfault/vscode/releases/tag/v0.1.2
[0.1.1]: https://github.com/unfault/vscode/releases/tag/v0.1.1
[0.1.0]: https://github.com/unfault/vscode/releases/tag/v0.1.0