import type { Change, NormalizedCapability, Snapshot } from "./types.js";

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

function requiredNames(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return [];
  const required = (schema as Record<string, unknown>).required;
  return Array.isArray(required)
    ? required.filter((value): value is string => typeof value === "string").sort()
    : [];
}

function findBefore(capabilities: NormalizedCapability[], kind: NormalizedCapability["kind"], name: string) {
  return capabilities.find((item) => item.kind === kind && item.name === name);
}

export function compareSnapshots(before: Snapshot, after: Snapshot): Change[] {
  const changes: Change[] = [];
  const keys = new Set([
    ...before.capabilities.map((item) => `${item.kind}\u0000${item.name}`),
    ...after.capabilities.map((item) => `${item.kind}\u0000${item.name}`)
  ]);

  for (const key of [...keys].sort()) {
    const separator = key.indexOf("\u0000");
    const kind = key.slice(0, separator) as NormalizedCapability["kind"];
    const name = key.slice(separator + 1);
    const oldItem = findBefore(before.capabilities, kind, name);
    const newItem = findBefore(after.capabilities, kind, name);

    if (!oldItem) {
      changes.push({
        type: "added",
        kind,
        name,
        severity: "non-breaking",
        after: newItem,
        reasons: ["Capability is present in the after snapshot only."]
      });
    } else if (!newItem) {
      changes.push({
        type: "removed",
        kind,
        name,
        severity: "breaking",
        before: oldItem,
        reasons: ["Removal can invalidate existing callers or references."]
      });
    } else if (canonical(oldItem) !== canonical(newItem)) {
      const reasons: string[] = [];
      let severity: Change["severity"] = "non-breaking";

      if (oldItem.description !== newItem.description) reasons.push("Description changed.");

      if (kind === "tool") {
        const oldSchema = oldItem.metadata.inputSchema;
        const newSchema = newItem.metadata.inputSchema;
        const oldRequired = requiredNames(oldSchema);
        const newRequired = requiredNames(newSchema);
        const newlyRequired = newRequired.filter((name) => !oldRequired.includes(name));
        if (newlyRequired.length > 0) {
          severity = "breaking";
          reasons.push(`New required tool arguments: ${newlyRequired.join(", ")}.`);
        }
      }

      if (kind === "prompt") {
        const oldArguments = oldItem.metadata.arguments;
        const newArguments = newItem.metadata.arguments;
        const oldRequired = Array.isArray(oldArguments)
          ? oldArguments.filter((arg) => arg && typeof arg === "object" && (arg as Record<string, unknown>).required)
              .map((arg) => (arg as Record<string, unknown>).name)
              .filter((value): value is string => typeof value === "string").sort()
          : [];
        const newRequired = Array.isArray(newArguments)
          ? newArguments.filter((arg) => arg && typeof arg === "object" && (arg as Record<string, unknown>).required)
              .map((arg) => (arg as Record<string, unknown>).name)
              .filter((value): value is string => typeof value === "string").sort()
          : [];
        const newlyRequired = newRequired.filter((name) => !oldRequired.includes(name));
        if (newlyRequired.length > 0) {
          severity = "breaking";
          reasons.push(`New required prompt arguments: ${newlyRequired.join(", ")}.`);
        }
      }

      if (reasons.length === 0) reasons.push("Capability metadata changed.");
      changes.push({
        type: "modified",
        kind,
        name,
        severity,
        before: oldItem,
        after: newItem,
        reasons
      });
    }
  }

  if (before.protocolVersion !== after.protocolVersion) {
    if (before.protocolVersion && after.protocolVersion) {
      changes.push({
        type: "modified",
        kind: "prompt",
        name: "__protocolVersion__",
        severity: "non-breaking",
        reasons: [`Protocol version changed from ${before.protocolVersion} to ${after.protocolVersion}. Compatibility details must be verified against the protocol specification.`]
      });
    }
  }

  return changes.sort((a, b) =>
    a.kind.localeCompare(b.kind) ||
    a.name.localeCompare(b.name) ||
    a.type.localeCompare(b.type)
  );
}
