# MCP Capability Registry

MCP Capability Registry is a local-first, audit-friendly way to inventory and compare Model Context Protocol (MCP) server capabilities. It is designed for API governance, change review, and reproducible offline reporting.

## What it provides

- Deterministic normalization of tools, resources, resource templates, prompts, and server metadata
- Snapshot comparison with explicit `added`, `removed`, and `modified` classifications
- Conservative breaking-change markers based on caller-visible semantics
- Transparent reporting of unsupported protocol fields and constructs
- Recursive redaction of common credential and secret fields
- JSON output suitable for code review, diff tools, and automation
- Fully offline operation: the tool never opens an MCP connection or invokes an MCP tool

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Quick start

```bash
npm install
npm run build
node dist/cli.js snapshot examples/before.json report.json
node dist/cli.js compare examples/before.json examples/after.json changes.json
```

You can also run the synthetic end-to-end demonstration:

```bash
npm run demo
```

## Supported MCP metadata

The release understands the following high-level MCP constructs:

| Construct | Identifier | Normalized metadata |
|---|---|---|
| Tool | `name` | description, input schema, and remaining metadata |
| Resource | `uri` | name, description, MIME type, and remaining metadata |
| Resource template | `uriTemplate` | name, description, MIME type, and remaining metadata |
| Prompt | `name` | description, arguments, and remaining metadata |
| Server | `name` / `title` | server name and title |

The source snapshot is conventional MCP capability JSON. It is not a transport connection or a live MCP client.

## Supported protocol versions

Recognition in v0.1.0 is metadata-oriented, not a full protocol implementation. Explicitly recognized negotiated versions are:

- `2024-11-05`
- `2025-03-26`
- `2025-06-18`

Unknown versions and fields are retained as `unsupported` entries rather than silently discarded.

## Example output

```json
[
  {
    "type": "added",
    "kind": "tool",
    "name": "reorder_product",
    "severity": "non-breaking",
    "reasons": ["Capability is present in the after snapshot only."]
  },
  {
    "type": "modified",
    "kind": "prompt",
    "name": "summarize_inventory",
    "severity": "breaking",
    "reasons": ["New required prompt arguments: format."]
  },
  {
    "type": "removed",
    "kind": "tool",
    "name": "retire_product",
    "severity": "breaking",
    "reasons": ["Removal can invalidate existing callers or references."]
  }
]
```

## Change policy

Breaking changes are intentionally conservative:

- Removal of any capability is breaking.
- Adding required tool input properties is breaking.
- Adding required prompt arguments is breaking.
- Protocol-version changes are reported but marked non-breaking pending specification-level review.
- Additions and ordinary metadata changes are marked non-breaking.

This release compares snapshots only. It cannot prove runtime behavior or every possible protocol compatibility rule.

## Safety and privacy

- No servers are contacted.
- No tools or prompts are executed.
- Reports filter authorization, API keys, tokens, secrets, passwords, credentials, cookies, and private keys by key name.
- Free-form text may still contain sensitive values. Never use this tool as a substitute for secret-scanning or data classification.
- Snapshot input must be supplied explicitly.

## Limitations

- Offline JSON input only in v0.1.0
- No direct MCP transport or live discovery
- No tool execution
- No cryptographic provenance or signing
- Limited protocol-version recognition
- Schema changes outside newly required fields are reported as ordinary modifications

## Development

```bash
npm ci
npm run check
```

The `check` command runs the build, type checker, tests, and linting.
