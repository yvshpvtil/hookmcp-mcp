# Changelog

## 0.2.0 (unreleased)
### Added
- `get_install_config` tool: ready-to-paste config for Claude Desktop, Cursor (+ deeplink), VS Code (+ deeplink), Windsurf and Claude Code, with optional `env` injection.
- Windsurf configs in `get_server`.
- `search_servers` filters: `language`, `min_stars`.
- Typo-tolerant search (edit distance), plural folding and aliases (`k8s`, `postgresql`, `gh`, …); popularity is now a log-scaled tiebreak so relevance wins.
- On-disk cache (`~/.cache/hookmcp-mcp/servers.json`, `HOOKMCP_CACHE_FILE`) with TTL; serves the last good copy (with a note) when hookmcp.com is unreachable.
- `--help` / `--version` CLI flags.
- `server.json` for the official MCP Registry.
- GitHub Actions CI (Node 18/20/22, plus a non-blocking live-data job).
### Changed
- Helpful errors: unknown categories suggest valid ids, network failures name the URL and the `HOOKMCP_DATA_URL` override, empty searches return a hint.

## 0.1.0
- Initial release: `search_servers`, `get_server`, `list_categories`, `trending_servers`, `recently_updated`.
