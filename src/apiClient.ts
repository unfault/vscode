/**
 * API client for Unfault backend
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import * as vscode from 'vscode';
import {
  ScanResult,
  AnalyzeFilesRequest,
  AnalyzeProjectRequest,
  ProposedChange,
  PatchPreview,
  Bundle,
  RuleMetadata,
  ApiError,
  ServiceInfo
} from './types';
import { AuthManager } from './auth';
import { discoverService } from './serviceDiscovery';

export class FaultRulesApiClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private authManager: AuthManager | undefined;
  private outputChannel: vscode.OutputChannel | undefined;

  constructor(authManager?: AuthManager, outputChannel?: vscode.OutputChannel) {
    this.baseUrl = this.getApiEndpoint();
    this.authManager = authManager;
    this.outputChannel = outputChannel;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Setup request/response logging interceptors
    this.setupInterceptors();

    // Update client when configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('unfault.analysisMode') || e.affectsConfiguration('unfault.apiEndpoint')) {
        this.baseUrl = this.getApiEndpoint();
        this.client.defaults.baseURL = this.baseUrl;
      }
    });
  }

  /**
   * Setup axios interceptors for request/response logging
   */
  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        if (this.outputChannel) {
          this.outputChannel.appendLine('');
          this.outputChannel.appendLine('=== HTTP REQUEST ===');
          this.outputChannel.appendLine(`${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
          this.outputChannel.appendLine('Headers:');
          this.outputChannel.appendLine(JSON.stringify(config.headers, null, 2));
          if (config.params) {
            this.outputChannel.appendLine('Query Params:');
            this.outputChannel.appendLine(JSON.stringify(config.params, null, 2));
          }
          if (config.data) {
            this.outputChannel.appendLine('Body:');
            this.outputChannel.appendLine(JSON.stringify(config.data, null, 2));
          }
          this.outputChannel.appendLine('===================');
        }
        return config;
      },
      (error) => {
        if (this.outputChannel) {
          this.outputChannel.appendLine('');
          this.outputChannel.appendLine('=== REQUEST ERROR ===');
          this.outputChannel.appendLine(error.message);
          this.outputChannel.appendLine('=====================');
        }
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        if (this.outputChannel) {
          this.outputChannel.appendLine('');
          this.outputChannel.appendLine('=== HTTP RESPONSE ===');
          this.outputChannel.appendLine(`Status: ${response.status} ${response.statusText}`);
          this.outputChannel.appendLine('Headers:');
          this.outputChannel.appendLine(JSON.stringify(response.headers, null, 2));
          this.outputChannel.appendLine('Body:');
          this.outputChannel.appendLine(JSON.stringify(response.data, null, 2));
          this.outputChannel.appendLine('====================');
        }
        return response;
      },
      (error) => {
        if (this.outputChannel) {
          this.outputChannel.appendLine('');
          this.outputChannel.appendLine('=== HTTP ERROR ===');
          if (axios.isAxiosError(error)) {
            this.outputChannel.appendLine(`Status: ${error.response?.status} ${error.response?.statusText || ''}`);
            this.outputChannel.appendLine('Request:');
            this.outputChannel.appendLine(`  ${error.config?.method?.toUpperCase()} ${error.config?.baseURL}${error.config?.url}`);
            if (error.config?.data) {
              this.outputChannel.appendLine('  Body:');
              this.outputChannel.appendLine(`  ${error.config.data}`);
            }
            if (error.response) {
              this.outputChannel.appendLine('Response:');
              this.outputChannel.appendLine('  Headers:');
              this.outputChannel.appendLine(JSON.stringify(error.response.headers, null, 2));
              this.outputChannel.appendLine('  Body:');
              this.outputChannel.appendLine(JSON.stringify(error.response.data, null, 2));
            } else {
              this.outputChannel.appendLine(`Error: ${error.message}`);
              this.outputChannel.appendLine(`Code: ${error.code}`);
            }
          } else {
            this.outputChannel.appendLine(error.toString());
          }
          this.outputChannel.appendLine('==================');
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set the auth manager after initialization
   */
  setAuthManager(authManager: AuthManager) {
    this.authManager = authManager;
  }

  /**
   * Get request headers with authentication
   */
  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authManager) {
      const authHeader = await this.authManager.getAuthHeader();
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
    }

    return headers;
  }

  private getApiEndpoint(): string {
    const config = vscode.workspace.getConfiguration('unfault');
    const analysisMode = config.get<string>('analysisMode', 'local');
    
    // Development mode: use local server
    if (analysisMode === 'local') {
      return 'http://localhost:8080/api/v1';
    }
    
    // Production mode: use fixed cloud API endpoint
    return 'https://app.unfault.dev/api';
  }
  
  private getAnalysisMode(): string {
    const config = vscode.workspace.getConfiguration('unfault');
    return config.get<string>('analysisMode', 'local');
  }

  /**
   * Get service context from currently active file or workspace
   */
  private async getCurrentService(): Promise<ServiceInfo> {
    const editor = vscode.window.activeTextEditor;
    
    if (editor) {
      const filePath = editor.document.uri.fsPath;
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      const workspaceName = workspaceFolder?.name;
      
      return await discoverService(filePath, workspaceName);
    }
    
    // No active editor - use workspace name or generic identifier
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return {
        name: workspaceFolder.name,
        manifestType: 'unknown',
      };
    }
    
    // Last resort fallback
    return {
      name: 'unknown',
      manifestType: 'unknown',
    };
  }

  private handleError(error: any): never {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<ApiError>;
      if (axiosError.response?.data) {
        const apiError = axiosError.response.data;
        throw new Error(`API Error: ${apiError.message}`);
      } else if (axiosError.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to Unfault API at ${this.baseUrl}. Is the server running?`);
      }
    }
    throw error;
  }

  /**
   * Analyze specific files
   */
  async analyzeFiles(request: Omit<AnalyzeFilesRequest, 'service'> & { service?: ServiceInfo }): Promise<ScanResult> {
    try {
      const headers = await this.getHeaders();
      
      // Always discover service (with fallback if not found)
      let serviceInfo = request.service;
      
      if (!serviceInfo && request.files.length > 0) {
        const firstFilePath = request.files[0].path;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (workspaceFolder) {
          const absolutePath = vscode.Uri.joinPath(workspaceFolder.uri, firstFilePath).fsPath;
          const workspaceName = workspaceFolder.name;
          
          // discoverService now always returns a value (with fallback)
          serviceInfo = await discoverService(absolutePath, workspaceName);
        } else {
          // No workspace - use file basename
          const fileName = firstFilePath.split('/').pop() || firstFilePath;
          serviceInfo = {
            name: fileName,
            manifestType: 'unknown',
          };
        }
      }
      
      // Ensure service is always present
      const fullRequest: AnalyzeFilesRequest = {
        ...request,
        service: serviceInfo!,
      };
      
      const response = await this.client.post<ScanResult>('/analyze/files', fullRequest, { headers });
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Analyze entire project
   */
  async analyzeProject(request: Omit<AnalyzeProjectRequest, 'service'> & { service?: ServiceInfo }): Promise<ScanResult> {
    try {
      const headers = await this.getHeaders();
      
      // Always discover service (with fallback if not found)
      let serviceInfo = request.service;
      
      if (!serviceInfo) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(request.root_path));
        const workspaceName = workspaceFolder?.name;
        
        // discoverService now always returns a value (with fallback)
        serviceInfo = await discoverService(request.root_path, workspaceName);
      }
      
      // Ensure service is always present
      const fullRequest: AnalyzeProjectRequest = {
        ...request,
        service: serviceInfo,
      };
      
      const response = await this.client.post<ScanResult>('/analyze/project', fullRequest, { headers });
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get proposed fixes for findings or bundles
   */
  async getProposedFixes(params: {
    finding_ids?: string[];
    bundle_ids?: string[];
  }): Promise<ProposedChange[]> {
    try {
      const headers = await this.getHeaders();
      const service = await this.getCurrentService();
      
      const queryParams = new URLSearchParams();
      if (params.finding_ids?.length) {
        queryParams.append('finding_ids', params.finding_ids.join(','));
      }
      if (params.bundle_ids?.length) {
        queryParams.append('bundle_ids', params.bundle_ids.join(','));
      }
      // Add service context
      queryParams.append('service', service.name);
      if (service.version) {
        queryParams.append('service_version', service.version);
      }

      const response = await this.client.get<{ fixes: ProposedChange[] }>(
        `/fixes?${queryParams.toString()}`,
        { headers }
      );
      return response.data.fixes;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Preview a patch before applying
   */
  async previewPatch(
    patchId: string,
    filePath: string,
    currentContent: string,
    dryRun: boolean = true
  ): Promise<PatchPreview> {
    try {
      const headers = await this.getHeaders();
      const service = await this.getCurrentService();
      
      const response = await this.client.post<PatchPreview>('/fixes/preview', {
        patch_id: patchId,
        file_path: filePath,
        current_content: currentContent,
        dry_run: dryRun,
        service: {
          name: service.name,
          version: service.version,
          manifestType: service.manifestType,
        },
      }, { headers });
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get explanation for a rule, bundle, or finding
   */
  async explainItem(id: string, depth: 'brief' | 'normal' | 'deep' = 'normal'): Promise<string> {
    try {
      const headers = await this.getHeaders();
      const service = await this.getCurrentService();
      
      const response = await this.client.get(`/explain/${id}`, {
        params: {
          depth,
          service: service.name,
          service_version: service.version,
        },
        headers,
      });
      
      let data = response.data;
      
      // Handle case where API returns JSON-encoded string
      if (typeof data === 'string') {
        // If it's a JSON string (starts and ends with quotes), parse it
        if (data.startsWith('"') && data.endsWith('"')) {
          try {
            data = JSON.parse(data);
          } catch {
            // If parsing fails, use as-is
          }
        }
      }
      
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get explanations for multiple rules/findings in batch
   */
  async explainBatch(ids: string[], depth: 'brief' | 'normal' | 'deep' = 'normal'): Promise<Record<string, string>> {
    try {
      const headers = await this.getHeaders();
      const service = await this.getCurrentService();
      
      const response = await this.client.post('/explain/batch', {
        ids,
        depth,
        service: {
          name: service.name,
          version: service.version,
        },
      }, { headers });
      
      return response.data.explanations || {};
    } catch (error) {
      // If batch endpoint doesn't exist, fall back to individual requests
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        const explanations: Record<string, string> = {};
        for (const id of ids) {
          try {
            explanations[id] = await this.explainItem(id, depth);
          } catch (err) {
            explanations[id] = `Failed to load explanation: ${err}`;
          }
        }
        return explanations;
      }
      this.handleError(error);
    }
  }

  /**
   * List available fix bundles
   */
  async listBundles(): Promise<Bundle[]> {
    try {
      const headers = await this.getHeaders();
      const service = await this.getCurrentService();
      
      const response = await this.client.get<{ bundles: Bundle[] }>('/bundles', {
        params: {
          service: service.name,
          service_version: service.version,
        },
        headers
      });
      return response.data.bundles;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * List available rules
   */
  async listRules(params?: {
    language?: string;
    vital?: string;
  }): Promise<RuleMetadata[]> {
    try {
      const headers = await this.getHeaders();
      const service = await this.getCurrentService();
      
      const response = await this.client.get<{ rules: RuleMetadata[] }>('/rules', {
        params: {
          ...params,
          service: service.name,
          service_version: service.version,
        },
        headers,
      });
      return response.data.rules;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/health', { timeout: 5000 });
      return true;
    } catch (error) {
      return false;
    }
  }
}