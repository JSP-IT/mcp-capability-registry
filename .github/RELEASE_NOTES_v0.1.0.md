# MCP Capability Registry v0.1.0

The first public release provides local-first, offline MCP capability inventory and change review.

## Highlights

- Normalize tools, resources, resource templates, prompts, server identity, server capabilities, and instructions
- Compare two capability files deterministically: raw MCP JSON or previously written snapshots
- Detect added, removed, and modified capabilities, with a summary count
- Mark removals and newly required tool or prompt arguments conservatively as breaking
- Report protocol-version, server, and instruction changes separately for manual review
- Report unknown fields, malformed or duplicate entries, paginated input, and unrecognized protocol versions
- Redact credential-like values while keeping JSON Schema property names comparable
- Provide synthetic before/after examples and a runnable demo

## Safety

This release never connects to an MCP server or executes an MCP tool. It accepts local JSON only.

## Supported protocol versions

Recognition metadata is included for:

- `2024-11-05`
- `2025-03-26`
- `2025-06-18`
- `2025-11-25`
- `2026-07-28`

Unknown versions are still processed and reported under `unsupported` rather than rejected.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
