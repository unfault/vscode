/**
 * Unfault Configuration Reader
 *
 * Reads the unfault CLI configuration file to check for existing API keys.
 * Config location: ~/.config/unfault/config.json
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Unfault configuration structure (matches CLI config.json).
 */
export interface UnfaultConfig {
  api_key: string;
  stored_base_url?: string;
}

/**
 * Get the path to the unfault config file.
 *
 * Uses the same logic as the CLI:
 * - $XDG_CONFIG_HOME/unfault/config.json
 * - $HOME/.config/unfault/config.json
 * - %USERPROFILE%\.config\unfault\config.json (Windows)
 */
export function getConfigPath(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, "unfault", "config.json");
  }

  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, ".config", "unfault", "config.json");
}

/**
 * Check if the unfault config file exists.
 */
export function configExists(): boolean {
  try {
    return fs.existsSync(getConfigPath());
  } catch {
    return false;
  }
}

/**
 * Load the unfault configuration from disk.
 *
 * @returns The configuration if it exists and is valid, null otherwise.
 */
export function loadConfig(): UnfaultConfig | null {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const contents = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(contents) as UnfaultConfig;

    // Validate that we have an API key
    if (!config.api_key || typeof config.api_key !== "string") {
      return null;
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * Save the unfault configuration to disk.
 *
 * @param config The configuration to save.
 */
export function saveConfig(config: UnfaultConfig): void {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  // Create directory if it doesn't exist
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Get the API key from the config file.
 *
 * @returns The API key if configured, null otherwise.
 */
export function getApiKey(): string | null {
  const config = loadConfig();
  return config?.api_key || null;
}

/**
 * Get the base URL from the config file or environment.
 *
 * Priority:
 * 1. UNFAULT_BASE_URL environment variable
 * 2. stored_base_url from config file
 * 3. Default: https://app.unfault.dev
 */
export function getBaseUrl(): string {
  // Environment variable takes precedence
  const envUrl = process.env.UNFAULT_BASE_URL;
  if (envUrl) {
    return envUrl;
  }

  // Check config file
  const config = loadConfig();
  if (config?.stored_base_url) {
    return config.stored_base_url;
  }

  // Default
  return "https://app.unfault.dev";
}