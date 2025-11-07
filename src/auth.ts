/**
 * Authentication module for Unfault extension
 */

import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as util from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const exec = util.promisify(child_process.exec);

const API_KEY_SECRET = 'unfault.apiKey';
const AUTH_METHOD_KEY = 'unfault.authMethod';

export type AuthMethod = 'api_key' | 'cli' | 'none';

export interface AuthStatus {
  authenticated: boolean;
  method: AuthMethod;
  error?: string;
}

export class AuthManager {
  private context: vscode.ExtensionContext;
  private apiKey: string | undefined;
  private outputChannel: vscode.OutputChannel;

  constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
  }

  /**
   * Initialize authentication - check if user is already authenticated
   */
  async initialize(): Promise<AuthStatus> {
    this.outputChannel.appendLine('Checking authentication status...');

    // Try to load API key from secret storage
    this.apiKey = await this.context.secrets.get(API_KEY_SECRET);
    
    if (this.apiKey) {
      this.outputChannel.appendLine('Found stored API key');
      return {
        authenticated: true,
        method: 'api_key',
      };
    }

    // Fallback: Try to read API key from user's Unfault config (created by "unfault login")
    try {
      const home = os.homedir();
      let configPath: string | undefined;

      if (process.platform === 'darwin') {
        configPath = path.join(home, 'Library', 'Application Support', 'unfault', 'config.toml');
      } else if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        configPath = path.join(appData, 'unfault', 'config.toml');
      } else {
        // linux and others
        configPath = path.join(home, '.config', 'unfault', 'config.toml');
      }

      if (configPath) {
        const content = await fs.promises.readFile(configPath, 'utf8').catch(() => undefined);
        if (content) {
          // Minimal TOML parsing for required keys
          const apiKeyMatch =
            content.match(/^\s*api_key\s*=\s*"(.*?)"\s*$/m) ||
            content.match(/^\s*api_key\s*=\s*([^\s#]+)\s*$/m);
          
          if (apiKeyMatch && apiKeyMatch[1]) {
            const apiKeyFromConfig = apiKeyMatch[1].trim();
            if (apiKeyFromConfig) {
              await this.context.secrets.store(API_KEY_SECRET, apiKeyFromConfig);
              await this.context.globalState.update(AUTH_METHOD_KEY, 'api_key');
              this.apiKey = apiKeyFromConfig;
              this.outputChannel.appendLine(`Loaded API key from config: ${configPath}`);
              return {
                authenticated: true,
                method: 'api_key',
              };
            }
          }
        }
      }
    } catch (err: any) {
      this.outputChannel.appendLine(`Failed to read config.toml: ${err?.message || String(err)}`);
    }

    // Check if user is authenticated via unfault CLI
    const cliAuth = await this.checkCliAuth();
    if (cliAuth.authenticated) {
      this.outputChannel.appendLine('Found CLI authentication');
      return cliAuth;
    }

    this.outputChannel.appendLine('No authentication found');
    return {
      authenticated: false,
      method: 'none',
    };
  }

  /**
   * Prompt user to authenticate
   */
  async promptAuthentication(): Promise<AuthStatus> {
    const choice = await vscode.window.showInformationMessage(
      'Unfault requires authentication to analyze your code.',
      { modal: true },
      'Enter API Key',
      'Run unfault login',
      'Learn More'
    );

    if (choice === 'Enter API Key') {
      return await this.manualApiKeyEntry();
    } else if (choice === 'Run unfault login') {
      return await this.runUnfaultLogin();
    } else if (choice === 'Learn More') {
      vscode.env.openExternal(vscode.Uri.parse('https://docs.unfault.io/authentication'));
      return await this.promptAuthentication();
    }

    return {
      authenticated: false,
      method: 'none',
    };
  }

  /**
   * Manual API key entry
   */
  async manualApiKeyEntry(): Promise<AuthStatus> {
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your Unfault API key',
      password: true,
      placeHolder: 'sk_live_xxxxxxxxxx',
      validateInput: (value) => {
        if (!value || value.length === 0) {
          return 'API key cannot be empty';
        }
        if (!value.startsWith('sk_live_') && !value.startsWith('sk_test_')) {
          return 'API key should start with "sk_live_" or "sk_test_"';
        }
        return null;
      },
    });

    if (!apiKey) {
      return {
        authenticated: false,
        method: 'none',
      };
    }

    // Store API key securely
    await this.context.secrets.store(API_KEY_SECRET, apiKey);
    await this.context.globalState.update(AUTH_METHOD_KEY, 'api_key');
    this.apiKey = apiKey;

    this.outputChannel.appendLine('API key stored successfully');
    vscode.window.showInformationMessage('Authentication successful!');

    return {
      authenticated: true,
      method: 'api_key',
    };
  }

  /**
   * Run unfault login command
   */
  async runUnfaultLogin(): Promise<AuthStatus> {
    // Check if unfault CLI is installed
    const cliInstalled = await this.checkCliInstalled();
    if (!cliInstalled) {
      const choice = await vscode.window.showErrorMessage(
        'unfault CLI is not installed. Would you like to install it?',
        'Install Instructions',
        'Enter API Key Instead'
      );

      if (choice === 'Install Instructions') {
        vscode.env.openExternal(vscode.Uri.parse('https://docs.unfault.io/cli/installation'));
        return {
          authenticated: false,
          method: 'none',
        };
      } else if (choice === 'Enter API Key Instead') {
        return await this.manualApiKeyEntry();
      }

      return {
        authenticated: false,
        method: 'none',
      };
    }

    // Run unfault login
    this.outputChannel.appendLine('Running: unfault login');
    
    const choice = await vscode.window.showInformationMessage(
      'Please run "unfault login" in your terminal to authenticate.',
      { modal: true },
      'Open Terminal',
      'I\'ve Already Logged In',
      'Cancel'
    );

    if (choice === 'Open Terminal') {
      const terminal = vscode.window.createTerminal('Unfault Login');
      terminal.show();
      terminal.sendText('unfault login');
      
      // Wait for user confirmation
      const confirmed = await vscode.window.showInformationMessage(
        'Click "Done" once you have completed the login process.',
        { modal: true },
        'Done',
        'Cancel'
      );

      if (confirmed !== 'Done') {
        return {
          authenticated: false,
          method: 'none',
        };
      }
    } else if (choice === 'I\'ve Already Logged In') {
      // User claims they're logged in, verify
    } else {
      return {
        authenticated: false,
        method: 'none',
      };
    }

    // Verify CLI authentication
    const authStatus = await this.checkCliAuth();
    if (authStatus.authenticated) {
      await this.context.globalState.update(AUTH_METHOD_KEY, 'cli');
      vscode.window.showInformationMessage('Authentication successful!');
    } else {
      vscode.window.showErrorMessage('Authentication failed. Please try again or use an API key.');
    }

    return authStatus;
  }

  /**
   * Check if unfault CLI is installed
   */
  private async checkCliInstalled(): Promise<boolean> {
    try {
      await exec('unfault --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if user is authenticated via CLI
   */
  private async checkCliAuth(): Promise<AuthStatus> {
    try {
      const { stdout, stderr } = await exec('unfault auth status');
      
      if (stderr) {
        this.outputChannel.appendLine(`CLI auth check stderr: ${stderr}`);
      }

      // Check if output indicates authenticated status
      if (stdout.includes('authenticated') || stdout.includes('logged in')) {
        return {
          authenticated: true,
          method: 'cli',
        };
      }

      return {
        authenticated: false,
        method: 'none',
        error: 'Not authenticated via CLI',
      };
    } catch (error: any) {
      // CLI might not be installed or user not logged in
      return {
        authenticated: false,
        method: 'none',
        error: error.message,
      };
    }
  }

  /**
   * Get API key for authentication
   */
  async getApiKey(): Promise<string | undefined> {
    if (this.apiKey) {
      return this.apiKey;
    }

    // Try to get from CLI if using CLI auth
    const method = this.context.globalState.get<AuthMethod>(AUTH_METHOD_KEY);
    if (method === 'cli') {
      try {
        const { stdout } = await exec('unfault auth token');
        const token = stdout.trim();
        if (token && token.length > 0) {
          return token;
        }
      } catch (error) {
        this.outputChannel.appendLine('Failed to get token from CLI');
      }
    }

    return undefined;
  }

  /**
   * Get authentication header
   */
  async getAuthHeader(): Promise<string | undefined> {
    const apiKey = await this.getApiKey();
    if (apiKey) {
      return `Bearer ${apiKey}`;
    }
    return undefined;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.apiKey !== undefined || 
           this.context.globalState.get<AuthMethod>(AUTH_METHOD_KEY) === 'cli';
  }

  /**
   * Logout - clear stored credentials
   */
  async logout(): Promise<void> {
    await this.context.secrets.delete(API_KEY_SECRET);
    await this.context.globalState.update(AUTH_METHOD_KEY, 'none');
    this.apiKey = undefined;
    
    this.outputChannel.appendLine('Logged out successfully');
    vscode.window.showInformationMessage('Logged out successfully');
  }

  /**
   * Update API key
   */
  async updateApiKey(): Promise<void> {
    const result = await this.manualApiKeyEntry();
    if (!result.authenticated) {
      vscode.window.showWarningMessage('API key update cancelled');
    }
  }
}