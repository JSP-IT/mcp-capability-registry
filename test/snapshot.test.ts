import { describe, expect, it } from "vitest";
import { normalizeSnapshot } from "../src/snapshot.js";
import { compareSnapshots } from "../src/compare.js";

describe("offline snapshots", () => {
  it("normalizes tools, resources, templates, and prompts deterministically", () => {
    const snapshot = normalizeSnapshot({
      protocolVersion: "2025-06-18",
      name: "example",
      tools: [{ name: "zeta" }, { name: "alpha", description: "A" }],
      resources: [{ uri: "test://b" }, { uri: "test://a" }],
      resourceTemplates: [{ uriTemplate: "test://{name}" }],
      prompts: [{ name: "prompt-b" }, { name: "prompt-a" }]
    });

    expect(snapshot.generatedFrom).toBe("offline");
    expect(snapshot.capabilities.map((item) => `${item.kind}:${item.name}`)).toEqual([
      "prompt:prompt-a",
      "prompt:prompt-b",
      "resource:test://a",
      "resource:test://b",
      "resourceTemplate:test://{name}",
      "tool:alpha",
      "tool:zeta"
    ]);
  });

  it("removes sensitive keys recursively", () => {
    const snapshot = normalizeSnapshot({
      name: "safe",
      tools: [{
        name: "search",
        inputSchema: { properties: { apiKey: { type: "string" } } },
        headers: { Authorization: "Bearer secret", "X-Safe": "visible" },
        nested: { password: "secret", endpoint: "public.example" }
      }]
    });

    expect(JSON.stringify(snapshot)).not.toContain("Bearer");
    expect(JSON.stringify(snapshot)).not.toContain("password");
    expect(JSON.stringify(snapshot)).not.toContain("Authorization");
  });

  it("records unknown protocol constructs transparently", () => {
    const snapshot = normalizeSnapshot({
      protocolVersion: "2099-01-01",
      futureField: { enabled: true },
      tools: "not-an-array"
    });
    expect(snapshot.unsupported).toContain("protocolVersion: 2099-01-01 is not recognized by this release");
    expect(snapshot.unsupported).toContain("unknown field: futureField");
  });
});

describe("snapshot comparison", () => {
  it("detects added, removed, and modified capabilities", () => {
    const before = normalizeSnapshot({
      tools: [{ name: "keep", description: "old" }, { name: "remove" }]
    });
    const after = normalizeSnapshot({
      tools: [{ name: "keep", description: "new" }, { name: "add" }]
    });
    const changes = compareSnapshots(before, after);
    expect(changes.map((change) => [change.type, change.name])).toEqual([
      ["added", "add"],
      ["modified", "keep"],
      ["removed", "remove"]
    ]);
  });

  it("classifies a newly required tool argument as breaking", () => {
    const before = normalizeSnapshot({
      tools: [{ name: "search", inputSchema: { type: "object", properties: { q: { type: "string" } } } }]
    });
    const after = normalizeSnapshot({
      tools: [{ name: "search", inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] } }]
    });
    expect(compareSnapshots(before, after)[0].severity).toBe("breaking");
  });

  it("is deterministic regardless of input capability order", () => {
    const beforeA = normalizeSnapshot({ tools: [{ name: "b" }, { name: "a" }], resources: [{ uri: "x://2" }, { uri: "x://1" }] });
    const beforeB = normalizeSnapshot({ tools: [{ name: "a" }, { name: "b" }], resources: [{ uri: "x://1" }, { uri: "x://2" }] });
    const afterA = normalizeSnapshot({ tools: [{ name: "a" }, { name: "b" }, { name: "c" }] });
    const afterB = normalizeSnapshot({ tools: [{ name: "c" }, { name: "b" }, { name: "a" }] });
    expect(compareSnapshots(beforeA, afterA)).toEqual(compareSnapshots(beforeB, afterB));
  });
});
