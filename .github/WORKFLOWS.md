# GitHub Workflows Documentation

This document describes the GitHub Actions workflows configured for the Unfault Core VSCode extension.

## Overview

Two workflows are configured:
1. **Build Workflow** ([`build.yml`](.github/workflows/build.yml)) - Validates code quality on every push/PR
2. **Publish Workflow** ([`publish.yml`](.github/workflows/publish.yml)) - Publishes extension to VSCode Marketplace on releases

---

## Build Workflow

**File:** [`.github/workflows/build.yml`](.github/workflows/build.yml)

### Triggers
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

### What It Does
1. **Multi-version testing** - Tests on Node.js 18.x and 20.x
2. **Dependency installation** - Installs npm packages with caching
3. **Code linting** - Runs ESLint checks
4. **TypeScript compilation** - Compiles `.ts` files to JavaScript
5. **Extension packaging** - Creates `.vsix` file
6. **Artifact upload** - Uploads the packaged extension (Node.js 20.x only)

### Artifacts
- **Name:** `unfault-core-vsix`
- **Contains:** The packaged `.vsix` file
- **Retention:** 30 days
- **Use case:** Download to manually test the extension before release

### Status Checks
All steps must pass for PRs to be mergeable. This ensures code quality and prevents broken builds.

---

## Publish Workflow

**File:** [`.github/workflows/publish.yml`](.github/workflows/publish.yml)

### Triggers
- GitHub releases (when a release is published)

### What It Does
1. **Build validation** - Runs lint, compile, and package steps
2. **Marketplace publishing** - Publishes extension to VSCode Marketplace using `vsce`
3. **Release attachment** - Attaches `.vsix` file to the GitHub release
4. **Summary report** - Displays success message with package details

### Required Secrets

#### VSCE_PAT (VSCode Extension Personal Access Token)

This secret is **required** for publishing to the VSCode Marketplace.

**Setup Instructions:**

1. **Create a Personal Access Token in Azure DevOps:**
   - Go to https://dev.azure.com
   - Sign in with your Microsoft account (same one used for marketplace publisher)
   - Click on "User settings" (top right) → "Personal access tokens"
   - Click "New Token"
   - Configure the token:
     - **Name:** `VSCode Marketplace Publishing`
     - **Organization:** Select your organization (or "All accessible organizations")
     - **Expiration:** Choose a duration (recommend 90 days or custom)
     - **Scopes:** Select "Custom defined" and check:
       - ✅ **Marketplace** → **Manage** (required for publishing)
   - Click "Create"
   - **IMPORTANT:** Copy the token immediately (it won't be shown again)

2. **Add Secret to GitHub Repository:**
   - Go to your repository on GitHub
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Click "New repository secret"
   - **Name:** `VSCE_PAT` (must match exactly)
   - **Value:** Paste your Personal Access Token
   - Click "Add secret"

3. **Verify Publisher Account:**
   - Ensure you have a publisher account at https://marketplace.visualstudio.com/manage
   - Publisher ID should match the `"publisher"` field in [`package.json`](package.json:6) (`unfault`)

#### GITHUB_TOKEN

This secret is **automatically provided** by GitHub Actions. No setup required.

---

## Publishing a New Release

### Method 1: GitHub Releases UI (Recommended)

1. **Update version in** [`package.json`](package.json:5)
   ```json
   "version": "0.2.0"
   ```

2. **Commit and push changes:**
   ```bash
   git add package.json
   git commit -m "chore: bump version to 0.2.0"
   git push origin main
   ```

3. **Create a new release on GitHub:**
   - Go to repository → **Releases** → **Create a new release**
   - **Tag:** `v0.2.0` (create new tag on publish)
   - **Target:** `main`
   - **Title:** `v0.2.0`
   - **Description:** Add release notes
   - Click **Publish release**

4. **Workflow runs automatically:**
   - Check **Actions** tab for progress
   - Extension will be published to marketplace
   - `.vsix` file attached to release

### Method 2: Command Line

```bash
# Update version
npm version 0.2.0

# Push with tags
git push origin main --tags

# Create release (using GitHub CLI)
gh release create v0.2.0 --title "v0.2.0" --notes "Release notes here"
```

---

## Troubleshooting

### Build Workflow Failures

**Linting errors:**
```bash
# Run locally to see issues
npm run lint

# Auto-fix some issues
npm run lint -- --fix
```

**Compilation errors:**
```bash
# Compile locally
npm run compile

# Check for TypeScript errors
npx tsc --noEmit
```

**Package failures:**
```bash
# Ensure vsce is installed
npm install -g @vscode/vsce

# Try packaging locally
npm run package
```

### Publish Workflow Failures

**"VSCE_PAT not found" or authentication errors:**
- Verify the `VSCE_PAT` secret is set in repository settings
- Check token hasn't expired in Azure DevOps
- Ensure token has "Marketplace: Manage" scope
- Regenerate token if necessary

**"Publisher not found" error:**
- Verify publisher ID in [`package.json`](package.json:6) matches your marketplace publisher
- Check publisher exists at https://marketplace.visualstudio.com/manage
- Ensure your Microsoft account has access to the publisher

**Version already exists:**
- Update version in [`package.json`](package.json:5) before creating release
- Each release must have a unique version number
- Follow semantic versioning (major.minor.patch)

**Missing required fields:**
- Ensure [`package.json`](package.json) includes:
  - `publisher`, `name`, `version`, `engines`, `description`
  - Valid `repository` URL
  - Optional but recommended: `icon`, `license`, `keywords`

---

## Workflow Maintenance

### Updating Node.js Versions

Edit [`.github/workflows/build.yml`](.github/workflows/build.yml:13-14):
```yaml
strategy:
  matrix:
    node-version: [18.x, 20.x, 22.x]  # Add or remove versions
```

### Changing Trigger Branches

Edit trigger configuration:
```yaml
on:
  push:
    branches: [ main, develop, feature/* ]  # Add patterns
```

### Adding Pre-publish Checks

Add steps before the publish step in [`publish.yml`](.github/workflows/publish.yml):
```yaml
- name: Run tests
  run: npm test

- name: Check bundle size
  run: |
    SIZE=$(stat -f%z *.vsix)
    if [ $SIZE -gt 10485760 ]; then
      echo "Extension too large"
      exit 1
    fi
```

---

## Security Considerations

1. **Never commit secrets** - Use GitHub Secrets for sensitive tokens
2. **Rotate tokens regularly** - Set expiration dates and renew before expiry
3. **Limit token scope** - Only grant "Marketplace: Manage" permission
4. **Review workflow runs** - Check logs for suspicious activity
5. **Branch protection** - Enable branch protection on `main` to require PR reviews

---

## Additional Resources

- [VSCode Extension Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce CLI Documentation](https://github.com/microsoft/vscode-vsce)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Azure DevOps PAT Documentation](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)

---

## Support

For workflow issues:
- Check the **Actions** tab in your repository for detailed logs
- Review this documentation for common solutions
- Contact the repository maintainers for assistance