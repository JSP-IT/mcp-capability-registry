export type CapabilityKind = "tool" | "resource" | "resourceTemplate" | "prompt";

export interface MCPMetadata {
  protocolVersion?: string;
  name?: string;
  title?: string;
  instructions?: string;
  tools?: unknown[];
  resources?: unknown[];
  resourceTemplates?: unknown[];
  prompts?: unknown[];
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
  server: { name: string | null; title: string | null };
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
