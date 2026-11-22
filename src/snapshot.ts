import { compareStrings, isRecord } from "./order.js";
import type { CapabilityKind, NormalizedCapability, ServerInfo, Snapshot } from "./types.js";

export const SNAPSHOT_SCHEMA_VERSION = "1";

/** MCP protocol versions this release recognizes. Unknown versions are reported, not rejected. */
export const RECOGNIZED_PROTOCOL_VERSIONS: readonly string[] = [
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
  "2026-07-28"
];

export const REDACTED = "[REDACTED]";

const SENSITIVE_KEYS =
  /authorization|^auth(?:entication)?$|api[_-]?key|token$|secret|passw(?:or)?d|credential|cookie|private[_-]?key|session[_-]?id|bearer/i;

/**
 * JSON Schema keywords whose object keys are names chosen by the schema author
 * (for example property names), not values. Those keys are kept as-is so that
 * a tool parameter called `password` stays visible in change reports.
 */
const NAME_MAP_KEYWORDS = new Set([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
  "dependentRequired"
]);

const SOURCES: ReadonlyArray<readonly [CapabilityKind, "tools" | "resources" | "resourceTemplates" | "prompts", "name" | "uri" | "uriTemplate"]> = [
  ["tool", "tools", "name"],
  ["resource", "resources", "uri"],
  ["resourceTemplate", "resourceTemplates", "uriTemplate"],
  ["prompt", "prompts", "name"]
];

const KINDS = new Set<string>(SOURCES.map(([kind]) => kind));

const KNOWN_INPUT_FIELDS = new Set([
  "protocolVersion",
  "name",
  "title",
  "version",
  "serverInfo",
  "capabilities",
  "instructions",
  "tools",
  "resources",
  "resourceTemplates",
  "prompts",
  "nextCursor"
]);

/**
 * Recursively sorts object keys and replaces the values of credential-like keys
 * with `[REDACTED]`. Keys are kept so that their presence still shows up in diffs.
 */
function sanitize(value: unknown, keysAreNames = false): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compareStrings(a, b))
        .map(([key, child]) => {
          if (!keysAreNames && SENSITIVE_KEYS.test(key)) return [key, REDACTED];
          return [key, sanitize(child, !keysAreNames && NAME_MAP_KEYWORDS.has(key))];
        })
    );
  }
  return value;
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  return sanitize(value) as Record<string, unknown>;
}

function optionalString(source: Record<string, unknown>, key: string, label: string, unsupported: string[]): string | null {
  const value = source[key];
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  unsupported.push(`${label}: expected a string`);
  return null;
}

class CapabilityCollector {
  private readonly items: NormalizedCapability[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly unsupported: string[]) {}

  add(kind: CapabilityKind, name: string, metadata: Record<string, unknown>, label: string): void {
    const key = `${kind}\u0000${name}`;
    if (this.seen.has(key)) {
      this.unsupported.push(`${label}: duplicate identifier "${name}"; only the first entry is kept`);
      return;
    }
    this.seen.add(key);
    const description = metadata.description;
    this.items.push({
      kind,
      name,
      ...(typeof description === "string" ? { description } : {}),
      metadata
    });
  }

  sorted(): NormalizedCapability[] {
    return [...this.items].sort((a, b) => compareStrings(a.kind, b.kind) || compareStrings(a.name, b.name));
  }
}

function finishProtocolVersion(protocolVersion: string | null, unsupported: string[]): string | null {
  if (protocolVersion && !RECOGNIZED_PROTOCOL_VERSIONS.includes(protocolVersion)) {
    unsupported.push(`protocolVersion: ${protocolVersion} is not recognized by this release`);
  }
  return protocolVersion;
}

function snapshot(parts: Omit<Snapshot, "schemaVersion" | "generatedFrom" | "unsupported">, unsupported: string[]): Snapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    protocolVersion: parts.protocolVersion,
    server: parts.server,
    serverCapabilities: parts.serverCapabilities,
    instructions: parts.instructions,
    capabilities: parts.capabilities,
    unsupported: [...new Set(unsupported)].sort(compareStrings),
    generatedFrom: "offline"
  };
}

function normalizeRaw(input: Record<string, unknown>): Snapshot {
  const unsupported: string[] = [];
  const collector = new CapabilityCollector(unsupported);

  for (const [kind, field, identifier] of SOURCES) {
    const values = input[field];
    if (values === undefined) continue;
    if (!Array.isArray(values)) {
      unsupported.push(`${field}: expected an array`);
      continue;
    }
    values.forEach((value: unknown, index) => {
      const label = `${field}[${index}]`;
      if (!isRecord(value)) {
        unsupported.push(`${label}: expected an object; skipped`);
        return;
      }
      const id = value[identifier];
      if (typeof id !== "string" || id.length === 0) {
        unsupported.push(`${label}: missing ${identifier}; skipped`);
        return;
      }
      collector.add(kind, id, sanitizeRecord(value), field);
    });
  }

  for (const key of Object.keys(input)) {
    if (!KNOWN_INPUT_FIELDS.has(key)) unsupported.push(`unknown field: ${key}`);
  }

  let serverInfo: Record<string, unknown> = {};
  if (input.serverInfo !== undefined) {
    if (isRecord(input.serverInfo)) serverInfo = input.serverInfo;
    else unsupported.push("serverInfo: expected an object");
  }
  const serverField = (key: keyof ServerInfo): string | null =>
    optionalString(input, key, key, unsupported) ?? optionalString(serverInfo, key, `serverInfo.${key}`, unsupported);

  let serverCapabilities: Record<string, unknown> | null = null;
  if (input.capabilities !== undefined && input.capabilities !== null) {
    if (isRecord(input.capabilities)) serverCapabilities = sanitizeRecord(input.capabilities);
    else unsupported.push("capabilities: expected an object");
  }

  if (typeof input.nextCursor === "string" && input.nextCursor.length > 0) {
    unsupported.push("nextCursor: list results are paginated; only the supplied entries are included");
  }

  return snapshot({
    protocolVersion: finishProtocolVersion(optionalString(input, "protocolVersion", "protocolVersion", unsupported), unsupported),
    server: {
      name: serverField("name"),
      title: serverField("title"),
      version: serverField("version")
    },
    serverCapabilities,
    instructions: optionalString(input, "instructions", "instructions", unsupported),
    capabilities: collector.sorted()
  }, unsupported);
}

function invalid(message: string): never {
  throw new Error(`Invalid normalized snapshot: ${message}`);
}

function nullableString(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") invalid(`${label} must be a string or null`);
  return value;
}

/** Re-reads a snapshot previously produced by this tool, validating and re-normalizing it. */
function normalizeExisting(input: Record<string, unknown>): Snapshot {
  if (input.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`Unsupported snapshot schemaVersion: ${JSON.stringify(input.schemaVersion)}. This release reads schemaVersion "${SNAPSHOT_SCHEMA_VERSION}".`);
  }
  if (!Array.isArray(input.capabilities)) invalid("capabilities must be an array");
  const server = input.server ?? {};
  if (!isRecord(server)) invalid("server must be an object");
  if (input.serverCapabilities != null && !isRecord(input.serverCapabilities)) invalid("serverCapabilities must be an object or null");
  if (input.unsupported !== undefined && !(Array.isArray(input.unsupported) && input.unsupported.every((item) => typeof item === "string"))) {
    invalid("unsupported must be an array of strings");
  }

  const unsupported = [...((input.unsupported as string[] | undefined) ?? [])];
  const collector = new CapabilityCollector(unsupported);
  input.capabilities.forEach((item: unknown, index) => {
    const label = `capabilities[${index}]`;
    if (!isRecord(item)) invalid(`${label} must be an object`);
    if (typeof item.kind !== "string" || !KINDS.has(item.kind)) invalid(`${label}.kind is not a known capability kind`);
    if (typeof item.name !== "string" || item.name.length === 0) invalid(`${label}.name must be a non-empty string`);
    if (!isRecord(item.metadata)) invalid(`${label}.metadata must be an object`);
    collector.add(item.kind as CapabilityKind, item.name, sanitizeRecord(item.metadata), "capabilities");
  });

  return snapshot({
    protocolVersion: finishProtocolVersion(nullableString(input.protocolVersion, "protocolVersion"), unsupported),
    server: {
      name: nullableString(server.name, "server.name"),
      title: nullableString(server.title, "server.title"),
      version: nullableString(server.version, "server.version")
    },
    serverCapabilities: isRecord(input.serverCapabilities) ? sanitizeRecord(input.serverCapabilities) : null,
    instructions: nullableString(input.instructions, "instructions"),
    capabilities: collector.sorted()
  }, unsupported);
}

/**
 * Normalizes MCP capability JSON into a deterministic snapshot.
 *
 * Accepts either raw MCP discovery JSON or a snapshot previously produced by
 * this tool (recognized by its `schemaVersion` field), so the output of
 * `snapshot` can be fed back into `compare`.
 */
export function normalizeSnapshot(input: unknown): Snapshot {
  if (!isRecord(input)) {
    throw new Error("Snapshot input must be a JSON object.");
  }
  return "schemaVersion" in input ? normalizeExisting(input) : normalizeRaw(input);
}
