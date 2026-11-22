import { compareStrings, isRecord } from "./order.js";
import type {
  Change,
  ComparisonReport,
  MetadataChange,
  MetadataField,
  NormalizedCapability,
  Snapshot
} from "./types.js";

function canonical(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

function capabilityKey(item: NormalizedCapability): string {
  return `${item.kind}\u0000${item.name}`;
}

function strings(values: unknown[]): string[] {
  return values.filter((value): value is string => typeof value === "string").sort(compareStrings);
}

function requiredToolArguments(schema: unknown): string[] {
  if (!isRecord(schema) || !Array.isArray(schema.required)) return [];
  return strings(schema.required);
}

function requiredPromptArguments(args: unknown): string[] {
  if (!Array.isArray(args)) return [];
  return strings(args.filter((arg) => isRecord(arg) && arg.required === true).map((arg) => (arg as Record<string, unknown>).name));
}

function newlyAdded(before: string[], after: string[]): string[] {
  const previous = new Set(before);
  return after.filter((name) => !previous.has(name));
}

function withoutDescription(metadata: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...metadata };
  delete copy.description;
  return copy;
}

function compareCapability(oldItem: NormalizedCapability, newItem: NormalizedCapability): Change | undefined {
  if (canonical(oldItem) === canonical(newItem)) return undefined;

  const reasons: string[] = [];
  let severity: Change["severity"] = "non-breaking";

  if (oldItem.description !== newItem.description) reasons.push("Description changed.");

  if (oldItem.kind === "tool") {
    const added = newlyAdded(
      requiredToolArguments(oldItem.metadata.inputSchema),
      requiredToolArguments(newItem.metadata.inputSchema)
    );
    if (added.length > 0) {
      severity = "breaking";
      reasons.push(`New required tool arguments: ${added.join(", ")}.`);
    }
  }

  if (oldItem.kind === "prompt") {
    const added = newlyAdded(
      requiredPromptArguments(oldItem.metadata.arguments),
      requiredPromptArguments(newItem.metadata.arguments)
    );
    if (added.length > 0) {
      severity = "breaking";
      reasons.push(`New required prompt arguments: ${added.join(", ")}.`);
    }
  }

  if (canonical(withoutDescription(oldItem.metadata)) !== canonical(withoutDescription(newItem.metadata))) {
    reasons.push("Capability metadata changed.");
  }

  return {
    type: "modified",
    kind: oldItem.kind,
    name: oldItem.name,
    severity,
    before: oldItem,
    after: newItem,
    reasons
  };
}

const METADATA_FIELDS: ReadonlyArray<readonly [MetadataField, (snapshot: Snapshot) => unknown, string?]> = [
  ["protocolVersion", (s) => s.protocolVersion, "Protocol version changes are not classified automatically; verify compatibility against the MCP specification."],
  ["server.name", (s) => s.server.name],
  ["server.title", (s) => s.server.title],
  ["server.version", (s) => s.server.version],
  ["serverCapabilities", (s) => s.serverCapabilities, "Removed capability flags can affect clients; review manually."],
  ["instructions", (s) => s.instructions]
];

function compareMetadata(before: Snapshot, after: Snapshot): MetadataChange[] {
  const changes: MetadataChange[] = [];
  for (const [field, read, note] of METADATA_FIELDS) {
    const oldValue = read(before);
    const newValue = read(after);
    if (canonical(oldValue) !== canonical(newValue)) {
      changes.push({ field, before: oldValue, after: newValue, ...(note ? { note } : {}) });
    }
  }
  return changes;
}

/**
 * Compares two normalized snapshots.
 * Capability changes are ordered by kind, then name (locale-independent).
 */
export function compareSnapshots(before: Snapshot, after: Snapshot): ComparisonReport {
  const beforeItems = new Map(before.capabilities.map((item) => [capabilityKey(item), item]));
  const afterItems = new Map(after.capabilities.map((item) => [capabilityKey(item), item]));
  const keys = [...new Set([...beforeItems.keys(), ...afterItems.keys()])].sort(compareStrings);

  const changes: Change[] = [];
  for (const key of keys) {
    const oldItem = beforeItems.get(key);
    const newItem = afterItems.get(key);

    if (!oldItem && newItem) {
      changes.push({
        type: "added",
        kind: newItem.kind,
        name: newItem.name,
        severity: "non-breaking",
        after: newItem,
        reasons: ["Capability is present in the after snapshot only."]
      });
    } else if (oldItem && !newItem) {
      changes.push({
        type: "removed",
        kind: oldItem.kind,
        name: oldItem.name,
        severity: "breaking",
        before: oldItem,
        reasons: ["Removal can invalidate existing callers or references."]
      });
    } else if (oldItem && newItem) {
      const change = compareCapability(oldItem, newItem);
      if (change) changes.push(change);
    }
  }

  return {
    schemaVersion: "1",
    summary: {
      added: changes.filter((change) => change.type === "added").length,
      removed: changes.filter((change) => change.type === "removed").length,
      modified: changes.filter((change) => change.type === "modified").length,
      breaking: changes.filter((change) => change.severity === "breaking").length
    },
    metadataChanges: compareMetadata(before, after),
    changes
  };
}
