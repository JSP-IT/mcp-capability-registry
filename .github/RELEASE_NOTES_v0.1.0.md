# MCP Capability Registry v0.1.0

The first public release provides local-first, offline MCP capability inventory and change review.

## Highlights

- Normalize tools, resources, resource templates, prompts, and server metadata
- Compare two JSON capability snapshots deterministically
- Detect added, removed, and modified capabilities
- Mark removals and newly required inputs conservatively as breaking
- Report unsupported protocol fields and unrecognized protocol versions
- Redact common credential, token, secret, and private-key fields
- Provide synthetic before/after examples and a runnable demo

## Safety

This release never connects to an MCP server or executes an MCP tool. It accepts local JSON only.

## Supported protocol versions

Recognition metadata is included for:

- `2024-11-05`
- `2025-03-26`
- `2025-06-18`

Unknown constructs are preserved under transparent `unsupported` reporting rather than silently discarded.

## Requirements

- Node.js 20 or newer
- npm
