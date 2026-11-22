import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_ERROR, EXIT_OK, EXIT_USAGE, packageVersion, run } from "../src/run.js";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { stdout: (text: string) => out.push(text), stderr: (text: string) => err.push(text) },
    out: () => out.join("\n"),
    err: () => err.join("\n")
  };
}

const example = (name: string) => fileURLToPath(new URL(`../examples/${name}`, import.meta.url));

describe("cli", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "mcr-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("prints usage with exit code 0 for --help", async () => {
    const c = capture();
    expect(await run(["--help"], c.io)).toBe(EXIT_OK);
    expect(c.out()).toContain(`mcp-capability-registry v${packageVersion()}`);
  });

  it("prints the package version", async () => {
    const c = capture();
    expect(await run(["--version"], c.io)).toBe(EXIT_OK);
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    expect(c.out()).toBe(pkg.version);
  });

  it.each([
    [["bogus"]],
    [["compare", "only-one.json"]],
    [["snapshot"]],
    [["snapshot", "a", "b", "c"]],
    [["demo", "extra"]]
  ])("fails with exit code 2 on invalid usage: %j", async (argv) => {
    const c = capture();
    expect(await run(argv, c.io)).toBe(EXIT_USAGE);
    expect(c.err()).toMatch(/^error: /);
    expect(c.out()).toBe("");
  });

  it("reports a missing file without a stack trace", async () => {
    const c = capture();
    expect(await run(["snapshot", join(dir, "missing.json")], c.io)).toBe(EXIT_ERROR);
    expect(c.err()).toMatch(/^error: .*missing\.json: file not found$/);
  });

  it("reports invalid JSON", async () => {
    const path = join(dir, "broken.json");
    await writeFile(path, "{ nope", "utf8");
    const c = capture();
    expect(await run(["snapshot", path], c.io)).toBe(EXIT_ERROR);
    expect(c.err()).toContain("invalid JSON");
  });

  it("accepts JSON files with a UTF-8 byte order mark", async () => {
    const path = join(dir, "bom.json");
    await writeFile(path, String.fromCharCode(0xfeff) + JSON.stringify({ tools: [{ name: "bom" }] }), "utf8");
    const c = capture();
    expect(await run(["snapshot", path], c.io)).toBe(EXIT_OK);
    expect(JSON.parse(c.out()).capabilities[0].name).toBe("bom");
  });

  it("compares raw examples and their snapshots identically", async () => {
    const beforeSnapshot = join(dir, "before.snapshot.json");
    const afterSnapshot = join(dir, "after.snapshot.json");
    const quiet = capture().io;
    expect(await run(["snapshot", example("before.json"), beforeSnapshot], quiet)).toBe(EXIT_OK);
    expect(await run(["snapshot", example("after.json"), afterSnapshot], quiet)).toBe(EXIT_OK);

    const raw = capture();
    const normalized = capture();
    expect(await run(["compare", example("before.json"), example("after.json")], raw.io)).toBe(EXIT_OK);
    expect(await run(["compare", beforeSnapshot, afterSnapshot], normalized.io)).toBe(EXIT_OK);
    expect(normalized.out()).toBe(raw.out());
    expect(JSON.parse(raw.out()).summary).toEqual({ added: 1, removed: 0, modified: 3, breaking: 2 });
  });

  it("runs the demo", async () => {
    const c = capture();
    expect(await run(["demo"], c.io)).toBe(EXIT_OK);
    expect(JSON.parse(c.out()).comparison.summary.breaking).toBe(2);
  });
});
