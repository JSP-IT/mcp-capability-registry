import { normalizeSnapshot, REDACTED } from "../src/snapshot.js";

describe("normalizeSnapshot", () => {
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
    expect(snapshot.unsupported).toEqual([]);
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

  it("orders names by code unit, independent of locale", () => {
    const snapshot = normalizeSnapshot({ tools: [{ name: "ä" }, { name: "b" }, { name: "B" }, { name: "a" }] });
    expect(snapshot.capabilities.map((item) => item.name)).toEqual(["B", "a", "b", "ä"]);
  });

  it("accepts a string instructions field without reporting it", () => {
    const snapshot = normalizeSnapshot({ name: "x", instructions: "Use carefully.", tools: [] });
    expect(snapshot.instructions).toBe("Use carefully.");
    expect(snapshot.unsupported).toEqual([]);
  });

  it("reads server identity from serverInfo and keeps server capabilities", () => {
    const snapshot = normalizeSnapshot({
      protocolVersion: "2025-11-25",
      serverInfo: { name: "srv", title: "Server", version: "1.2.3" },
      capabilities: { tools: { listChanged: true } },
      tools: [{ name: "a" }],
      nextCursor: null
    });
    expect(snapshot.server).toEqual({ name: "srv", title: "Server", version: "1.2.3" });
    expect(snapshot.serverCapabilities).toEqual({ tools: { listChanged: true } });
    expect(snapshot.unsupported).toEqual([]);
  });

  it("recognizes current protocol versions", () => {
    for (const version of ["2025-11-25", "2026-07-28"]) {
      expect(normalizeSnapshot({ protocolVersion: version }).unsupported).toEqual([]);
    }
  });

  it("warns when list results are paginated", () => {
    const snapshot = normalizeSnapshot({ tools: [{ name: "a" }], nextCursor: "page-2" });
    expect(snapshot.unsupported).toEqual(["nextCursor: list results are paginated; only the supplied entries are included"]);
  });

  describe("redaction", () => {
    it("redacts credential-like values recursively but keeps the keys", () => {
      const snapshot = normalizeSnapshot({
        tools: [{
          name: "search",
          headers: { Authorization: "Bearer abc", "X-Safe": "visible", "x-api-key": "k1" },
          nested: { password: "hunter2", token: "t0k3n", accessToken: "a1", endpoint: "public.example" }
        }]
      });
      const json = JSON.stringify(snapshot);
      for (const secret of ["Bearer abc", "k1", "hunter2", "t0k3n", "\"a1\""]) {
        expect(json).not.toContain(secret);
      }
      const metadata = snapshot.capabilities[0].metadata as Record<string, Record<string, unknown>>;
      expect(metadata.headers).toEqual({ Authorization: REDACTED, "X-Safe": "visible", "x-api-key": REDACTED });
      expect(metadata.nested.endpoint).toBe("public.example");
    });

    it("does not redact token counters or similar non-credential keys", () => {
      const snapshot = normalizeSnapshot({ tools: [{ name: "llm", maxTokens: 100, tokenLimit: 5 }] });
      expect(snapshot.capabilities[0].metadata).toMatchObject({ maxTokens: 100, tokenLimit: 5 });
    });

    it("keeps JSON Schema property names that look sensitive", () => {
      const schema = {
        type: "object",
        properties: { password: { type: "string" }, apiKey: { type: "string", default: "abc" } },
        required: ["password"]
      };
      const snapshot = normalizeSnapshot({ tools: [{ name: "login", inputSchema: schema }] });
      const inputSchema = snapshot.capabilities[0].metadata.inputSchema as Record<string, unknown>;
      expect(inputSchema.properties).toEqual({ apiKey: { default: "abc", type: "string" }, password: { type: "string" } });
      expect(inputSchema.required).toEqual(["password"]);
    });
  });

  describe("unsupported reporting", () => {
    it("records unknown protocol constructs once each", () => {
      const snapshot = normalizeSnapshot({
        protocolVersion: "2099-01-01",
        futureField: { enabled: true },
        tools: "not-an-array"
      });
      expect(snapshot.unsupported).toEqual([
        "protocolVersion: 2099-01-01 is not recognized by this release",
        "tools: expected an array",
        "unknown field: futureField"
      ]);
    });

    it("skips entries without an identifier instead of inventing one", () => {
      const snapshot = normalizeSnapshot({ tools: [{ name: "tool-1" }, { description: "nameless" }, "bad"] });
      expect(snapshot.capabilities.map((item) => item.name)).toEqual(["tool-1"]);
      expect(snapshot.unsupported).toEqual([
        "tools[1]: missing name; skipped",
        "tools[2]: expected an object; skipped"
      ]);
    });

    it("keeps the first of duplicate identifiers and reports the rest", () => {
      const snapshot = normalizeSnapshot({ tools: [{ name: "dup", description: "1" }, { name: "dup", description: "2" }] });
      expect(snapshot.capabilities).toHaveLength(1);
      expect(snapshot.capabilities[0].description).toBe("1");
      expect(snapshot.unsupported).toEqual(['tools: duplicate identifier "dup"; only the first entry is kept']);
    });

    it("reports wrongly typed scalar fields", () => {
      const snapshot = normalizeSnapshot({ name: 5, instructions: ["x"], serverInfo: "srv" });
      expect(snapshot.unsupported).toEqual([
        "instructions: expected a string",
        "name: expected a string",
        "serverInfo: expected an object"
      ]);
    });
  });

  describe("normalized input", () => {
    it("is idempotent for snapshots produced by this tool", () => {
      const first = normalizeSnapshot({
        protocolVersion: "2025-06-18",
        name: "srv",
        tools: [{ name: "b" }, { name: "a", headers: { cookie: "c" } }],
        futureField: 1
      });
      const second = normalizeSnapshot(JSON.parse(JSON.stringify(first)));
      expect(second).toEqual(first);
    });

    it("rejects unknown snapshot schema versions", () => {
      expect(() => normalizeSnapshot({ schemaVersion: "2", capabilities: [] })).toThrow(/schemaVersion/);
    });

    it("rejects malformed normalized snapshots", () => {
      expect(() => normalizeSnapshot({ schemaVersion: "1", capabilities: [{ kind: "widget", name: "x", metadata: {} }] }))
        .toThrow(/capabilities\[0\]\.kind/);
    });
  });

  it("rejects non-object input", () => {
    expect(() => normalizeSnapshot([])).toThrow("Snapshot input must be a JSON object.");
  });
});
