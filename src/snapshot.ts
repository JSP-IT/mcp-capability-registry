import type { CapabilityKind, MCPMetadata, NormalizedCapability, Snapshot } from "./types.js";

const STABLE_PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18"
]);

const SENSITIVE_KEYS =
  /authorization|^auth(?:entication)?$|api[_-]?key|apikey|access[_-]?token|accesstoken|refresh[_-]?token|refreshtoken|secret|password|credential|cookie|private[_-]?key|privatekey/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_KEYS.test(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sanitize(child)])
    );
  }
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return sanitize(value) as Record<string, unknown>;
}

export function normalizeSnapshot(input: unknown): Snapshot {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Snapshot input must be a JSON object.");
  }

  const metadata = input as MCPMetadata;
  const unsupported: string[] = [];
  const capabilities: NormalizedCapability[] = [];

  const arrays: Array<[CapabilityKind, unknown[] | undefined, "name" | "uri" | "uriTemplate"]> = [
    ["tool", metadata.tools, "name"],
    ["resource", metadata.resources, "uri"],
    ["resourceTemplate", metadata.resourceTemplates, "uriTemplate"],
    ["prompt", metadata.prompts, "name"]
  ];

  for (const [kind, values, identifier] of arrays) {
    if (values === undefined) continue;
    if (!Array.isArray(values)) {
      unsupported.push(`${kind}: expected an array`);
      continue;
    }
    for (const [index, value] of values.entries()) {
      const item = record(value);
      const rawIdentifier = item[identifier];
      const id = typeof rawIdentifier === "string" && rawIdentifier.length > 0
        ? rawIdentifier
        : `${kind}-${index + 1}`;
      const description = typeof item.description === "string" ? item.description : undefined;
      capabilities.push({
        kind,
        name: id,
        ...(description ? { description } : {}),
        metadata: item
      });
    }
  }

  for (const [key, value] of Object.entries(metadata)) {
    if (!["protocolVersion", "name", "title", "instructions", "tools", "resources", "resourceTemplates", "prompts"].includes(key)) {
      unsupported.push(`unknown field: ${key}`);
    } else if (value !== undefined && key.endsWith("s") && !Array.isArray(value)) {
      unsupported.push(`${key}: unsupported construct`);
    }
  }

  const protocolVersion = typeof metadata.protocolVersion === "string"
    ? metadata.protocolVersion
    : null;
  if (protocolVersion && !STABLE_PROTOCOL_VERSIONS.has(protocolVersion)) {
    unsupported.push(`protocolVersion: ${protocolVersion} is not recognized by this release`);
  }

  return {
    schemaVersion: "1",
    protocolVersion,
    server: {
      name: typeof metadata.name === "string" ? metadata.name : null,
      title: typeof metadata.title === "string" ? metadata.title : null
    },
    capabilities: capabilities
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
      .map((item) => ({
        ...item,
        metadata: record(item.metadata)
      })),
    unsupported: [...new Set(unsupported)].sort(),
    generatedFrom: "offline"
  };
}
