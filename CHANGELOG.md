## 0.2.2

- Fix: `get_server` / `get_install_config` no longer crash with a TypeError on name or unknown-slug lookups when the dataset contains vendor-hosted remotes (`repo_url: null`); unknown slugs get the "Did you mean" error again.
- Lookups also accept a remote MCP endpoint URL (e.g. `https://mcp.notion.com/mcp`).
- `get_server` for remotes returns `listing_kind`, `remote_url`, remote-specific notes (OAuth sign-in, vendor docs) and, when HookMCP has them, the vendor-documented `tools` list (`tools`, `tools_count`, `tools_source`).
- "No config" errors link to the repo, else the vendor docs, else the HookMCP page (never `null`).
- package-lock.json version synced.

## 0.2.1

- `get_install_config` / `configs()` now handle remote URL listings (`config.url` + Streamable HTTP), with an `mcp-remote` stdio bridge fallback.
- Dataset type accepts optional `remote_url`, `listing_kind`, `quality_grade`, `quality_score`.

# Changelog

## 0.2.0 (unreleased)
### Added
- `get_install_config` tool: ready-to-paste config for Claude Desktop, Cursor (+ deeplink), VS Code (+ deeplink), Windsurf and Claude Code, with optional `env` injection.
- Windsurf configs in `get_server`.
- `search_servers` filters: `language`, `min_stars`, `topic` (integration slug) and `client` (AI client slug or name).
- `list_integrations` and `list_clients` tools (backed by `/api/v1/servers.json` `integrations` / `clients` arrays).
- Typo-tolerant search (edit distance), plural folding and aliases (`k8s`, `postgresql`, `gh`, …); popularity is now a log-scaled tiebreak so relevance wins.
- On-disk cache (`~/.cache/hookmcp-mcp/servers.json`, `HOOKMCP_CACHE_FILE`) with TTL; serves the last good copy (with a note) when hookmcp.com is unreachable.
- `--help` / `--version` CLI flags.
- `server.json` for the official MCP Registry.
- GitHub Actions CI (Node 18/20/22, plus a non-blocking live-data job).
### Changed
- Helpful errors: unknown categories suggest valid ids, network failures name the URL and the `HOOKMCP_DATA_URL` override, empty searches return a hint.

## 0.1.0
- Initial release: `search_servers`, `get_server`, `list_categories`, `trending_servers`, `recently_updated`.
