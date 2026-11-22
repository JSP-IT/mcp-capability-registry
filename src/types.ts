export type CapabilityKind = "tool" | "resource" | "resourceTemplate" | "prompt";

/**
 * Accepted input shape: a merged view of MCP discovery results.
 *
 * Server identity may be given either at the top level (`name`, `title`, `version`)
 * or as an `initialize`-style `serverInfo` object. The `tools`, `resources`,
 * `resourceTemplates`, and `prompts` arrays use the entry shapes of the matching
 * MCP list results (`tools/list`, `resources/list`, `resources/templates/list`,
 * `prompts/list`).
 */
export interface MCPMetadata {
  protocolVersion?: string;
  name?: string;
  title?: string;
  version?: string;
  serverInfo?: { name?: string; title?: string; version?: string };
  capabilities?: Record<string, unknown>;
  instructions?: string;
  tools?: unknown[];
  resources?: unknown[];
  resourceTemplates?: unknown[];
  prompts?: unknown[];
  nextCursor?: unknown;
}

export interface ServerInfo {
  name: string | null;
  title: string | null;
  version: string | null;
}

export interface NormalizedCapability {
  kind: CapabilityKind;
  name: string;
  description?: string;
  metadata: Record<string, unknown>;
}

export interface Snapshot {
  schemaVersion: "1";
  protocolVersion: string | null;
  server: ServerInfo;
  serverCapabilities: Record<string, unknown> | null;
  instructions: string | null;
  capabilities: NormalizedCapability[];
  unsupported: string[];
  generatedFrom: "offline";
}

export type ChangeType = "added" | "removed" | "modified";
export type ChangeSeverity = "breaking" | "non-breaking";

export interface Change {
  type: ChangeType;
  kind: CapabilityKind;
  name: string;
  severity: ChangeSeverity;
  before?: NormalizedCapability;
  after?: NormalizedCapability;
  reasons: string[];
}

export type MetadataField =
  | "protocolVersion"
  | "server.name"
  | "server.title"
  | "server.version"
  | "serverCapabilities"
  | "instructions";

/** A change to snapshot-level metadata. These are reported for review and are never classified as breaking. */
export interface MetadataChange {
  field: MetadataField;
  before: unknown;
  after: unknown;
  note?: string;
}

export interface ComparisonReport {
  schemaVersion: "1";
  summary: {
    added: number;
    removed: number;
    modified: number;
    breaking: number;
  };
  metadataChanges: MetadataChange[];
  changes: Change[];
}
