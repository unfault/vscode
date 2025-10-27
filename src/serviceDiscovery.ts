/**
 * Service discovery utilities for finding and extracting service information
 * from project manifests (pyproject.toml, package.json, go.mod, Cargo.toml, etc.)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ServiceInfo {
  name: string;
  version?: string;
  manifestType: 'pyproject.toml' | 'package.json' | 'go.mod' | 'Cargo.toml' | 'pom.xml' | 'unknown';
  manifestPath: string;
}

/**
 * Supported manifest files in priority order
 */
const MANIFEST_FILES = [
  'pyproject.toml',
  'package.json',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
] as const;

/**
 * Find the nearest project manifest file by walking up the directory tree
 */
export async function findNearestManifest(filePath: string): Promise<string | null> {
  let currentDir = path.dirname(filePath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  const rootPath = workspaceFolder?.uri.fsPath || path.parse(currentDir).root;

  while (currentDir.startsWith(rootPath)) {
    for (const manifestFile of MANIFEST_FILES) {
      const manifestPath = path.join(currentDir, manifestFile);
      try {
        await fs.promises.access(manifestPath, fs.constants.R_OK);
        return manifestPath;
      } catch {
        // File doesn't exist or not readable, continue
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached root
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Extract service name from pyproject.toml
 */
function extractFromPyproject(content: string): { name: string; version?: string } | null {
  // Try [project] section first (PEP 621)
  const projectNameMatch = content.match(/\[project\][\s\S]*?name\s*=\s*["']([^"']+)["']/);
  if (projectNameMatch) {
    const versionMatch = content.match(/\[project\][\s\S]*?version\s*=\s*["']([^"']+)["']/);
    return {
      name: projectNameMatch[1],
      version: versionMatch?.[1],
    };
  }

  // Try [tool.poetry] section
  const poetryNameMatch = content.match(/\[tool\.poetry\][\s\S]*?name\s*=\s*["']([^"']+)["']/);
  if (poetryNameMatch) {
    const versionMatch = content.match(/\[tool\.poetry\][\s\S]*?version\s*=\s*["']([^"']+)["']/);
    return {
      name: poetryNameMatch[1],
      version: versionMatch?.[1],
    };
  }

  return null;
}

/**
 * Extract service name from package.json
 */
function extractFromPackageJson(content: string): { name: string; version?: string } | null {
  try {
    const pkg = JSON.parse(content);
    if (pkg.name) {
      return {
        name: pkg.name,
        version: pkg.version,
      };
    }
  } catch {
    // Invalid JSON
  }
  return null;
}

/**
 * Extract service name from go.mod
 */
function extractFromGoMod(content: string): { name: string; version?: string } | null {
  const match = content.match(/^module\s+([^\s]+)/m);
  if (match) {
    // Extract just the last part of the module path as the service name
    const modulePath = match[1];
    const name = modulePath.split('/').pop() || modulePath;
    return { name };
  }
  return null;
}

/**
 * Extract service name from Cargo.toml
 */
function extractFromCargoToml(content: string): { name: string; version?: string } | null {
  const nameMatch = content.match(/\[package\][\s\S]*?name\s*=\s*["']([^"']+)["']/);
  if (nameMatch) {
    const versionMatch = content.match(/\[package\][\s\S]*?version\s*=\s*["']([^"']+)["']/);
    return {
      name: nameMatch[1],
      version: versionMatch?.[1],
    };
  }
  return null;
}

/**
 * Extract service name from pom.xml
 */
function extractFromPomXml(content: string): { name: string; version?: string } | null {
  const nameMatch = content.match(/<artifactId>([^<]+)<\/artifactId>/);
  if (nameMatch) {
    const versionMatch = content.match(/<version>([^<]+)<\/version>/);
    return {
      name: nameMatch[1],
      version: versionMatch?.[1],
    };
  }
  return null;
}

/**
 * Extract service information from manifest file
 */
export async function extractServiceInfo(manifestPath: string): Promise<ServiceInfo | null> {
  try {
    const content = await fs.promises.readFile(manifestPath, 'utf-8');
    const manifestFile = path.basename(manifestPath) as ServiceInfo['manifestType'];
    
    let extracted: { name: string; version?: string } | null = null;

    switch (manifestFile) {
      case 'pyproject.toml':
        extracted = extractFromPyproject(content);
        break;
      case 'package.json':
        extracted = extractFromPackageJson(content);
        break;
      case 'go.mod':
        extracted = extractFromGoMod(content);
        break;
      case 'Cargo.toml':
        extracted = extractFromCargoToml(content);
        break;
      case 'pom.xml':
        extracted = extractFromPomXml(content);
        break;
    }

    if (extracted) {
      return {
        name: extracted.name,
        version: extracted.version,
        manifestType: manifestFile,
        manifestPath,
      };
    }
  } catch (error) {
    console.error(`Failed to extract service info from ${manifestPath}:`, error);
  }

  return null;
}

/**
 * Discover service information for a given file path with fallback strategy
 *
 * Fallback strategy when no manifest is found:
 * 1. Use workspace folder name as service name
 * 2. If no workspace, use file basename (e.g., "script.py")
 */
export async function discoverService(
  filePath: string,
  workspaceName?: string
): Promise<ServiceInfo> {
  const manifestPath = await findNearestManifest(filePath);
  if (manifestPath) {
    const serviceInfo = await extractServiceInfo(manifestPath);
    if (serviceInfo) {
      return serviceInfo;
    }
  }

  // Fallback: Use workspace folder name or file basename
  let serviceName: string;
  if (workspaceName) {
    serviceName = workspaceName;
  } else {
    // Use file basename for standalone scripts (e.g., "quick-script.py")
    serviceName = path.basename(filePath);
  }
  
  return {
    name: serviceName,
    manifestType: 'unknown',
    manifestPath: filePath,
  };
}

/**
 * Get a descriptive service identifier (name@version or just name)
 */
export function getServiceIdentifier(serviceInfo: ServiceInfo): string {
  if (serviceInfo.version) {
    return `${serviceInfo.name}@${serviceInfo.version}`;
  }
  return serviceInfo.name;
}