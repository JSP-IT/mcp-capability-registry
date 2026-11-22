# MCP Capability Registry

MCP Capability Registry is a local-first, audit-friendly way to inventory and compare Model Context Protocol (MCP) server capabilities. It is designed for API governance, change review, and reproducible offline reporting.

## What it provides

- Deterministic, locale-independent normalization of tools, resources, resource templates, prompts, and server metadata
- Snapshot comparison with explicit `added`, `removed`, and `modified` classifications
- Conservative breaking-change markers based on caller-visible semantics
- Separate reporting of protocol-version, server-identity, server-capability, and instruction changes
- Transparent reporting of unsupported, malformed, duplicate, or unrecognized input
- Recursive redaction of common credential and secret values
- JSON output suitable for code review, diff tools, and automation
- Fully offline operation: the tool never opens an MCP connection or invokes an MCP tool

## Requirements

- Node.js 22 or newer
- npm 10 or newer

## Quick start

```bash
npm install
npm run build
node dist/cli.js snapshot examples/before.json before.snapshot.json
node dist/cli.js snapshot examples/after.json after.snapshot.json
node dist/cli.js compare before.snapshot.json after.snapshot.json changes.json
```

`compare` accepts either raw MCP capability JSON or snapshots written by `snapshot`, so you can also compare the examples directly:

```bash
node dist/cli.js compare examples/before.json examples/after.json
```

You can also run the synthetic end-to-end demonstration:

```bash
npm run demo
```

### CLI reference

```text
mcp-capability-registry snapshot <input.json> [output.json]
mcp-capability-registry compare <before.json> <after.json> [output.json]
mcp-capability-registry demo
mcp-capability-registry --help | --version
```

Without an output path, JSON is written to standard output. Exit codes: `0` success, `1` error (for example a missing file or invalid JSON), `2` invalid usage.

## Input format

The input is a single JSON object that merges the results of MCP discovery calls:

```json
{
  "protocolVersion": "2025-11-25",
  "serverInfo": { "name": "inventory-server", "title": "Inventory Example", "version": "1.4.0" },
  "capabilities": { "tools": { "listChanged": true } },
  "instructions": "Optional server instructions.",
  "tools": [],
  "resources": [],
  "resourceTemplates": [],
  "prompts": []
}
```

| Field | Source in MCP | Notes |
|---|---|---|
| `protocolVersion` | negotiated protocol version | Compared and checked against the recognized versions |
| `serverInfo` | `initialize` result | `name`, `title`, `version`; may also be given as top-level `name`, `title`, `version` |
| `capabilities` | server capabilities | Compared as a whole |
| `instructions` | server instructions | Compared as text |
| `tools` | `tools/list` → `tools` | Identified by `name` |
| `resources` | `resources/list` → `resources` | Identified by `uri` |
| `resourceTemplates` | `resources/templates/list` → `resourceTemplates` | Identified by `uriTemplate` |
| `prompts` | `prompts/list` → `prompts` | Identified by `name` |
| `nextCursor` | pagination cursor | Ignored when empty; a non-empty cursor is reported because the list is incomplete |

All fields are optional. Combine paginated list results into one array before creating a snapshot. Any other top-level field is reported as `unknown field` and left out of the snapshot. Entries without an identifier are skipped and reported; for duplicate identifiers, the first entry is kept and the rest are reported.

## Supported protocol versions

Recognition in v0.1.0 is metadata-oriented, not a full protocol implementation. Explicitly recognized versions are:

- `2024-11-05`
- `2025-03-26`
- `2025-06-18`
- `2025-11-25`
- `2026-07-28`

Unknown versions are still processed and are listed in `unsupported` rather than rejected.

## Example output

`compare examples/before.json examples/after.json` produces the following report (the full `before` and `after` capability objects on each change are omitted here for brevity):

```json
{
  "schemaVersion": "1",
  "summary": { "added": 1, "removed": 0, "modified": 3, "breaking": 2 },
  "metadataChanges": [],
  "changes": [
    {
      "type": "modified",
      "kind": "prompt",
      "name": "summarize_inventory",
      "severity": "breaking",
      "reasons": ["New required prompt arguments: format.", "Capability metadata changed."]
    },
    {
      "type": "modified",
      "kind": "resource",
      "name": "inventory://products/current",
      "severity": "non-breaking",
      "reasons": ["Description changed."]
    },
    {
      "type": "modified",
      "kind": "tool",
      "name": "lookup_product",
      "severity": "breaking",
      "reasons": ["Description changed.", "New required tool arguments: sku, warehouse.", "Capability metadata changed."]
    },
    {
      "type": "added",
      "kind": "tool",
      "name": "reorder_product",
      "severity": "non-breaking",
      "reasons": ["Capability is present in the after snapshot only."]
    }
  ]
}
```

Changes are ordered by kind, then identifier, using code-unit order so that output is identical across machines and locales.

`metadataChanges` lists differences in `protocolVersion`, `server.name`, `server.title`, `server.version`, `serverCapabilities`, and `instructions`, each with `before` and `after` values.

## Change policy

Breaking changes are intentionally conservative:

- Removal of any capability is breaking.
- Adding required tool input properties is breaking.
- Adding required prompt arguments is breaking.
- Additions and other metadata changes are marked non-breaking.
- Protocol-version, server, and instruction changes are reported in `metadataChanges` for manual review and are not classified automatically.

This release compares snapshots only. It cannot prove runtime behavior or every possible protocol compatibility rule.

## Safety and privacy

- No servers are contacted.
- No tools or prompts are executed.
- Values of keys that look like credentials (authorization, API keys, tokens, secrets, passwords, credentials, cookies, session IDs, private keys) are replaced with `[REDACTED]`. The key itself is kept so that its presence still shows up in comparisons.
- Property names inside JSON Schema `properties` (and similar keywords) are never redacted, so a tool parameter named `password` remains visible and comparable.
- Free-form text may still contain sensitive values. Never use this tool as a substitute for secret scanning or data classification.
- Snapshot input must be supplied explicitly.

## Limitations

- Offline JSON input only in v0.1.0
- No direct MCP transport or live discovery
- No tool execution
- No cryptographic provenance or signing
- Limited protocol-version recognition
- Schema changes other than newly required fields are reported as ordinary modifications

## Library use

```ts
import { compareSnapshots, normalizeSnapshot } from "mcp-capability-registry";

const report = compareSnapshots(normalizeSnapshot(beforeJson), normalizeSnapshot(afterJson));
if (report.summary.breaking > 0) process.exitCode = 1;
```

## Development

```bash
npm ci
npm run check
```

The `check` command runs the type checker (including tests), build, tests, and linting.
