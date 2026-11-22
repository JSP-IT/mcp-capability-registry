import { readFile } from "node:fs/promises";
import { compareSnapshots } from "../src/compare.js";
import { demoAfter, demoBefore } from "../src/demo.js";
import { normalizeSnapshot } from "../src/snapshot.js";

const compare = (before: unknown, after: unknown) => compareSnapshots(normalizeSnapshot(before), normalizeSnapshot(after));

describe("compareSnapshots", () => {
  it("detects added, removed, and modified capabilities", () => {
    const report = compare(
      { tools: [{ name: "keep", description: "old" }, { name: "remove" }] },
      { tools: [{ name: "keep", description: "new" }, { name: "add" }] }
    );
    expect(report.changes.map((change) => [change.type, change.name, change.severity])).toEqual([
      ["added", "add", "non-breaking"],
      ["modified", "keep", "non-breaking"],
      ["removed", "remove", "breaking"]
    ]);
    expect(report.summary).toEqual({ added: 1, removed: 1, modified: 1, breaking: 1 });
  });

  it("classifies a newly required tool argument as breaking", () => {
    const report = compare(
      { tools: [{ name: "search", inputSchema: { type: "object", properties: { q: { type: "string" } } } }] },
      { tools: [{ name: "search", inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] } }] }
    );
    expect(report.changes[0].severity).toBe("breaking");
    expect(report.changes[0].reasons).toContain("New required tool arguments: q.");
  });

  it("detects changes to sensitive-looking tool parameters", () => {
    const report = compare(
      { tools: [{ name: "login", inputSchema: { type: "object", properties: { user: { type: "string" } } } }] },
      { tools: [{ name: "login", inputSchema: { type: "object", properties: { user: { type: "string" }, password: { type: "string" } }, required: ["password"] } }] }
    );
    expect(report.changes[0].severity).toBe("breaking");
    expect(report.changes[0].reasons).toContain("New required tool arguments: password.");
  });

  it("classifies a newly required prompt argument as breaking", () => {
    const report = compare(
      { prompts: [{ name: "p", arguments: [{ name: "format", required: false }] }] },
      { prompts: [{ name: "p", arguments: [{ name: "format", required: true }, { name: "lang" }] }] }
    );
    expect(report.changes[0].severity).toBe("breaking");
    expect(report.changes[0].reasons).toEqual(["New required prompt arguments: format.", "Capability metadata changed."]);
  });

  it("reports a non-description metadata change", () => {
    const report = compare(
      { resources: [{ uri: "x://1", mimeType: "text/plain" }] },
      { resources: [{ uri: "x://1", mimeType: "application/json" }] }
    );
    expect(report.changes[0].reasons).toEqual(["Capability metadata changed."]);
  });

  it("reports protocol and server changes separately from capability changes", () => {
    const report = compare(
      { protocolVersion: "2025-06-18", serverInfo: { name: "s", version: "1.0.0" } },
      { protocolVersion: "2025-11-25", serverInfo: { name: "s", version: "1.1.0" }, instructions: "Hi" }
    );
    expect(report.changes).toEqual([]);
    expect(report.metadataChanges.map((change) => [change.field, change.before, change.after])).toEqual([
      ["protocolVersion", "2025-06-18", "2025-11-25"],
      ["server.version", "1.0.0", "1.1.0"],
      ["instructions", null, "Hi"]
    ]);
    expect(report.metadataChanges[0].note).toMatch(/not classified automatically/);
  });

  it("reports a protocol version appearing where none was declared", () => {
    const report = compare({}, { protocolVersion: "2025-11-25" });
    expect(report.metadataChanges).toEqual([
      expect.objectContaining({ field: "protocolVersion", before: null, after: "2025-11-25" })
    ]);
  });

  it("is deterministic regardless of input capability order", () => {
    const beforeA = { tools: [{ name: "b" }, { name: "a" }], resources: [{ uri: "x://2" }, { uri: "x://1" }] };
    const beforeB = { tools: [{ name: "a" }, { name: "b" }], resources: [{ uri: "x://1" }, { uri: "x://2" }] };
    const afterA = { tools: [{ name: "a" }, { name: "b" }, { name: "c" }] };
    const afterB = { tools: [{ name: "c" }, { name: "b" }, { name: "a" }] };
    expect(compare(beforeA, afterA)).toEqual(compare(beforeB, afterB));
  });

  it("compares snapshots that were already normalized", () => {
    const raw = compare(demoBefore(), demoAfter());
    const before = JSON.parse(JSON.stringify(normalizeSnapshot(demoBefore())));
    const after = JSON.parse(JSON.stringify(normalizeSnapshot(demoAfter())));
    expect(compare(before, after)).toEqual(raw);
    expect(raw.changes).toHaveLength(4);
  });
});

describe("examples", () => {
  it("match the built-in demo data", async () => {
    const read = async (name: string) => JSON.parse(await readFile(new URL(`../examples/${name}`, import.meta.url), "utf8"));
    expect(await read("before.json")).toEqual(demoBefore());
    expect(await read("after.json")).toEqual(demoAfter());
  });

  it("produce the changes documented in the README", () => {
    const report = compare(demoBefore(), demoAfter());
    expect(report.changes.map((change) => ({
      type: change.type,
      kind: change.kind,
      name: change.name,
      severity: change.severity,
      reasons: change.reasons
    }))).toEqual([
      {
        type: "modified",
        kind: "prompt",
        name: "summarize_inventory",
        severity: "breaking",
        reasons: ["New required prompt arguments: format.", "Capability metadata changed."]
      },
      {
        type: "modified",
        kind: "resource",
        name: "inventory://products/current",
        severity: "non-breaking",
        reasons: ["Description changed."]
      },
      {
        type: "modified",
        kind: "tool",
        name: "lookup_product",
        severity: "breaking",
        reasons: ["Description changed.", "New required tool arguments: sku, warehouse.", "Capability metadata changed."]
      },
      {
        type: "added",
        kind: "tool",
        name: "reorder_product",
        severity: "non-breaking",
        reasons: ["Capability is present in the after snapshot only."]
      }
    ]);
    expect(report.summary).toEqual({ added: 1, removed: 0, modified: 3, breaking: 2 });
  });
});
