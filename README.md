# hookmcp-mcp

[![Listed on HookMCP](https://img.shields.io/badge/Listed%20on-HookMCP-7c3aed)](https://hookmcp.com)
[![npm](https://img.shields.io/npm/v/hookmcp-mcp)](https://www.npmjs.com/package/hookmcp-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A read-only MCP server that lets your AI assistant search **[HookMCP](https://hookmcp.com)**, a directory of 800+ Model Context Protocol servers, and get ready-to-paste configs for Claude Desktop, Cursor, VS Code and Claude Code.

Example prompts: *"Find a maintained Postgres MCP server that doesn't need an API key and give me the Cursor config."* · *"What browser-automation MCP servers were updated this week?"*

- No API key, no account, no tracking. It only reads the public dataset at `https://hookmcp.com/api/v1/servers.json` and caches it in memory for 6 hours.
- Runs locally over stdio: `npx -y hookmcp-mcp`

## Tools

| Tool | What it does |
|---|---|
| `search_servers` | Keyword search with `category`, `remote`, `maintained` (commit ≤ 90 days), `no_key`, `official`, `one_click` filters and `limit` (≤ 50) |
| `get_server` | Description, repo, license, install command (and where it came from), plus configs for Claude Desktop, Cursor (+ deeplink), VS Code (+ deeplink) and Claude Code. Accepts slug, hookmcp.com URL, GitHub URL or exact name |
| `list_categories` | Category ids, names and counts |
| `trending_servers` | Recently created repos ranked by stars per day (an approximation) |
| `recently_updated` | Servers with the most recent commits |

All tools are annotated `readOnlyHint: true`.

## Install

Requires Node.js 18+.

### Claude Desktop
Add to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`), then restart Claude:
```json
{
  "mcpServers": {
    "hookmcp": { "command": "npx", "args": ["-y", "hookmcp-mcp"] }
  }
}
```

### Cursor
Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):
```json
{
  "mcpServers": {
    "hookmcp": { "command": "npx", "args": ["-y", "hookmcp-mcp"] }
  }
}
```

### VS Code
Add to `.vscode/mcp.json`:
```json
{
  "servers": {
    "hookmcp": { "type": "stdio", "command": "npx", "args": ["-y", "hookmcp-mcp"] }
  }
}
```

### Claude Code
```bash
claude mcp add hookmcp -- npx -y hookmcp-mcp
```

## Configuration (optional)

| Env var | Default |
|---|---|
| `HOOKMCP_DATA_URL` | `https://hookmcp.com/api/v1/servers.json` (also accepts `file://` URLs) |
| `HOOKMCP_CACHE_TTL_MS` | `21600000` (6 h) |

## Data caveats
Listings are collected automatically from the official MCP Registry and GitHub. Install commands are labelled as either taken from the README or derived from the registry package. API-key and remote flags are hints from READMEs. Always check the project's README before running a server. Spotted a mistake? Open an issue.

## Development
```bash
npm install
npm test        # builds, then runs end-to-end tests over stdio with the MCP SDK client
npx @modelcontextprotocol/inspector node dist/index.js
```

## Listed on HookMCP
If you maintain an MCP server, you can add this badge to your README:
```markdown
[![Listed on HookMCP](https://img.shields.io/badge/Listed%20on-HookMCP-7c3aed)](https://hookmcp.com)
```

MIT © Yash Patil
