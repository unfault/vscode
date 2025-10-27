# GitHub Configuration

This directory contains GitHub-specific configuration files for the Unfault Core VSCode extension.

## 📁 Contents

- [`workflows/`](workflows/) - GitHub Actions CI/CD workflows
  - [`build.yml`](workflows/build.yml) - Automated build and validation on every push/PR
  - [`publish.yml`](workflows/publish.yml) - Automated publishing to VSCode Marketplace on releases
- [`WORKFLOWS.md`](WORKFLOWS.md) - Complete documentation for workflows setup and usage

## 🚀 Quick Start

### For Contributors

**Your pull requests will automatically:**
- ✅ Run ESLint to check code quality
- ✅ Compile TypeScript to verify no compilation errors
- ✅ Package the extension to ensure it builds correctly
- ✅ Test on Node.js 18.x and 20.x

No setup needed - just push your code!

### For Maintainers

**To publish a new version:**

1. Update version in [`package.json`](../package.json)
2. Commit and push to `main`
3. Create a GitHub release with tag `vX.Y.Z`
4. Workflow automatically publishes to marketplace

**First-time setup:** See [WORKFLOWS.md](WORKFLOWS.md#required-secrets) for setting up the `VSCE_PAT` secret.

## 📖 Documentation

For detailed information about workflows, publishing, and troubleshooting, see:
- **[WORKFLOWS.md](WORKFLOWS.md)** - Complete workflows documentation

## 🔒 Required Secrets

| Secret | Required For | Setup Guide |
|--------|-------------|-------------|
| `VSCE_PAT` | Publishing to marketplace | [Setup Instructions](WORKFLOWS.md#vsce_pat-vscode-extension-personal-access-token) |
| `GITHUB_TOKEN` | Attaching assets to releases | Auto-provided by GitHub |

## 🏗️ Workflow Status

Check the [Actions tab](../../actions) to see:
- Build status for recent commits
- Publishing history for releases
- Detailed logs for troubleshooting

---

**Need Help?** See [WORKFLOWS.md](WORKFLOWS.md#troubleshooting) for troubleshooting common issues.