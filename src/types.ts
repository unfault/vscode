/**
 * Type definitions for Fault Rules API
 */

export interface ServiceInfo {
  name: string;
  version?: string;
  manifestType?: 'pyproject.toml' | 'package.json' | 'go.mod' | 'Cargo.toml' | 'pom.xml' | 'unknown';
  manifestPath?: string;
}

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type Vital = 
  | 'availability'
  | 'performance_headroom'
  | 'change_hygiene'
  | 'observability'
  | 'dependency_posture'
  | 'capacity'
  | 'safety'
  | 'context_intelligence'
  | 'topology'
  | 'change_psychology'
  | 'future_readiness';

export interface SourceLocation {
  file: string;
  line?: number;
  column?: number;
  function?: string;
}

export interface RuntimeLocation {
  resource_name?: string;
  property_path?: string;
  project_id?: string;
  region?: string;
}

// Base Finding interface with all common fields
export interface BaseFinding {
  kind: 'source' | 'runtime';
  id?: string;
  service_id?: string;
  project_id?: string;
  env?: 'dev' | 'ci' | 'staging' | 'prod';
  title: string;
  description?: string;
  severity: Severity;
  vital: Vital;
  status?: 'new' | 'triaged' | 'recommended' | 'acknowledged' | 'resolved' | 'dismissed' | 'reopened';
  priority?: 'now' | 'soon' | 'later';
  journey_stage?: 'build' | 'ship' | 'observe' | 'evolve';
  now: string;
  next?: string;
  why: string;
  diff?: string;
  badges?: string[];
  options?: any[];
  rule_id?: string;
  rule_version?: string;
  source_kind?: 'code' | 'config' | 'runtime_metric' | 'trace' | 'log' | 'topology';
  fingerprint?: string;
  fingerprint_meta?: any;
  confidence?: number;
  detected_at?: string;
  resolved_at?: string;
  business?: {
    threat?: string;
    impact_note?: string;
    revenue_at_risk?: number;
    users_affected_estimate?: number;
  };
  proposed_fixes?: ProposedChange[];
  evidence?: any[];
  primary_recommendation?: any;
  related_recommendations?: any[];
  tags?: string[];
  labels?: Record<string, string>;
  status_history?: any[];
  path_lens_id?: string;
  graph_snapshot_id?: string;
}

// SourceFinding with file location
export interface SourceFinding extends BaseFinding {
  kind: 'source';
  file: string;
  line?: number;
  column?: number;
  function?: string;
}

// RuntimeFinding with resource location
export interface RuntimeFinding extends BaseFinding {
  kind: 'runtime';
  resource_name?: string;
  property_path?: string;
  region?: string;
}

// Union type for all findings
export type Finding = SourceFinding | RuntimeFinding;

export interface ReadinessReport {
  overall_score: number;
  vital_scores: Record<string, number>;
  critical_findings: Finding[];
  summary: string;
}

export interface PatchOp {
  kind: 'text_replace' | 'unified_diff' | 'json_merge_patch' | 'yaml_patch';
  path: string;
  content: string;
}

export interface PatchSet {
  type: 'patchset';
  id: string;
  ops: PatchOp[];
  risk?: 'very_low' | 'low' | 'medium' | 'high';
  confidence?: number;
  reversible?: boolean;
  estimated_effort_minutes?: number;
}

export interface CommandStep {
  name?: string;
  run: string;
  timeout_seconds?: number;
}

export interface CommandSet {
  type: 'commandset';
  id: string;
  shell?: 'bash' | 'sh' | 'zsh' | 'pwsh' | 'cmd';
  steps: CommandStep[];
  risk?: 'very_low' | 'low' | 'medium' | 'high';
  reversible?: boolean;
}

export type ProposedChange = PatchSet | CommandSet;

export interface Bundle {
  id: string;
  title: string;
  tagline: string;
  contains: string[];
  estimated_effort_minutes?: number;
  priority?: 'now' | 'soon' | 'later';
}

export interface ScanMetadata {
  root_path?: string;
  files_analyzed?: number;
  languages?: string[];
  deployment_targets?: string[];
  service_count?: number;
  scan_duration_secs?: number;
}

export interface ScanResult {
  report: ReadinessReport;
  findings: Finding[];
  bundles: Bundle[];
  proposed_changes: ProposedChange[];
  context: ScanMetadata;
}

export interface FileWithContent {
  path: string;
  content: string;
}

export interface AnalyzeFilesRequest {
  files: FileWithContent[];
  service: ServiceInfo;  // Required - always provided with fallback
  options?: {
    rule_ids?: string[];
    severity_threshold?: Severity;
  };
}

export interface AnalyzeProjectRequest {
  root_path: string;
  service: ServiceInfo;  // Required - always provided with fallback
  options?: {
    rule_ids?: string[];
    exclude_patterns?: string[];
    max_file_size?: number;
    follow_symlinks?: boolean;
  };
}

export interface DiffPreview {
  file_path: string;
  diff_content: string;
  additions: number;
  deletions: number;
}

export interface PatchPreview {
  patch_id: string;
  can_apply: boolean;
  conflicts: string[];
  diffs: DiffPreview[];
  total_additions: number;
  total_deletions: number;
  dry_run: boolean;
}

export interface RuleMetadata {
  id: string;
  title: string;
  vital: string;
  severity: string;
  languages: string[];
  description: string;
}

export interface ApiError {
  error: string;
  message: string;
  details?: any;
}