# Changelog

## v0.1.0

Initial public release.

### Added

- Offline JSON snapshots for MCP tools, resources, resource templates, prompts, server identity (`serverInfo`), server capabilities, and instructions
- Deterministic, locale-independent normalization and sorting
- Added, removed, and modified change detection with a summary count
- Separate `metadataChanges` for protocol version, server identity, server capabilities, and instructions
- Conservative breaking-change classification for removals and newly required tool or prompt arguments
- Recursive redaction of credential-like values (JSON Schema property names are preserved)
- Reporting of unknown fields, malformed entries, duplicate identifiers, paginated input, and unrecognized protocol versions
- Recognition of MCP protocol versions `2024-11-05`, `2025-03-26`, `2025-06-18`, `2025-11-25`, and `2026-07-28`
- `compare` accepts both raw MCP JSON and previously written snapshots
- CLI `snapshot`, `compare`, and `demo` commands with `--help`, `--version`, and distinct exit codes
- Synthetic before/after examples
- Type-check, build, test, lint, and Node.js 22/24/26 CI
