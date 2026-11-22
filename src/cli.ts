#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { normalizeSnapshot } from "./snapshot.js";
import { compareSnapshots } from "./compare.js";
import type { Snapshot } from "./types.js";

function printUsage(): never {
  console.log(`mcp-capability-registry v0.1.0

Offline commands:
  snapshot <input.json> [output.json]
  compare <before.json> <after.json> [output.json]
  demo

Snapshots are read locally; no MCP servers are contacted and no MCP tools are executed.
`);
  process.exit(0);
}

async function readJSON(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function writeResult(path: string | undefined, value: unknown): Promise<void> {
  const json = JSON.stringify(value, null, 2) + "\n";
  if (path) {
    await writeFile(path, json, "utf8");
    console.log(`Wrote ${path}`);
  } else {
    console.log(json.trimEnd());
  }
}

function demoBefore(): unknown {
  return {
    protocolVersion: "2025-06-18",
    name: "inventory-server",
    title: "Inventory Example",
    tools: [
      { name: "lookup_product", description: "Look up a product.", inputSchema: { type: "object", properties: { sku: { type: "string" } } } }
    ],
    resources: [
      { uri: "inventory://products/current", name: "Current inventory", description: "Current product inventory." }
    ],
    prompts: [
      { name: "summarize_inventory", description: "Summarize inventory.", arguments: [{ name: "format", required: false }] }
    ]
  };
}

function demoAfter(): unknown {
  return {
    protocolVersion: "2025-06-18",
    name: "inventory-server",
    title: "Inventory Example",
    tools: [
      { name: "lookup_product", description: "Look up a product and location.", inputSchema: { type: "object", properties: { sku: { type: "string" }, warehouse: { type: "string" } }, required: ["sku", "warehouse"] } },
      { name: "reorder_product", description: "Create a reorder draft.", inputSchema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] } }
    ],
    resources: [
      { uri: "inventory://products/current", name: "Current inventory", description: "Updated product inventory." }
    ],
    prompts: [
      { name: "summarize_inventory", description: "Summarize inventory.", arguments: [{ name: "format", required: true }] }
    ]
  };
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command) printUsage();

  if (command === "snapshot") {
    if (!args[0]) printUsage();
    const snapshot = normalizeSnapshot(await readJSON(args[0]));
    await writeResult(args[1], snapshot);
    return;
  }

  if (command === "compare") {
    if (!args[0] || !args[1]) printUsage();
    const before = normalizeSnapshot(await readJSON(args[0])) as Snapshot;
    const after = normalizeSnapshot(await readJSON(args[1])) as Snapshot;
    await writeResult(args[2], compareSnapshots(before, after));
    return;
  }

  if (command === "demo") {
    const before = normalizeSnapshot(demoBefore());
    const after = normalizeSnapshot(demoAfter());
    await writeResult(undefined, {
      before,
      after,
      changes: compareSnapshots(before, after)
    });
    return;
  }

  printUsage();
}

await main();
