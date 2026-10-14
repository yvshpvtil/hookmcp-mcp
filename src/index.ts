#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getData, DATA_URL, type Dataset } from "./data.js";
import { search, summary, detail, findServer, categories, trending, recent, configs, suggestCategory, listIntegrations, listClients, suggestTopic, suggestClient, CLIENTS } from "./logic.js";
import { VERSION } from "./version.js";

const HELP = `hookmcp-mcp ${VERSION}
Read-only MCP server (stdio) for searching the HookMCP directory of MCP servers.

Usage:
  npx -y hookmcp-mcp            Start the server on stdio (normally launched by your MCP client)
  npx -y hookmcp-mcp --help     Show this help
  npx -y hookmcp-mcp --version  Print the version

Environment:
  HOOKMCP_DATA_URL       Dataset URL (default https://hookmcp.com/api/v1/servers.json; file:// allowed)
  HOOKMCP_CACHE_TTL_MS   Cache lifetime in ms (default 21600000 = 6h)
  HOOKMCP_CACHE_FILE     On-disk cache path, or "off" (default ~/.cache/hookmcp-mcp/servers.json)

Tools: search_servers, get_server, get_install_config, list_categories, list_integrations, list_clients, trending_servers, recently_updated
Docs: https://github.com/yvshpvtil/hookmcp-mcp`;

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); process.exit(0); }
if (argv.includes("--version") || argv.includes("-v")) { console.log(VERSION); process.exit(0); }
if (argv.length) { console.error(`Unknown option: ${argv[0]}\n\n${HELP}`); process.exit(2); }

class UserError extends Error {}
const server = new McpServer({ name: "hookmcp", version: VERSION });
const ro = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;
const out = (v: unknown, d?: Dataset) => {
  const content = [{ type: "text" as const, text: JSON.stringify(v, null, 2) }];
  if (d?.stale) content.push({ type: "text" as const, text: `Note: HookMCP was unreachable, so this answer uses cached data from ${new Date(d.fetchedAt).toISOString()}.` });
  return { content };
};
const fail = (msg: string) => ({ isError: true, content: [{ type: "text" as const, text: msg }] });
const wrap = <A,>(fn: (a: A, d: Dataset) => unknown) => async (a: A) => {
  try { const d = await getData(); return out(await fn(a, d), d); }
  catch (e) { return fail(e instanceof UserError ? (e as Error).message : `HookMCP error: ${(e as Error).message}\nData source: ${DATA_URL}`); }
};
function checkCategory(d: Dataset, c?: string) {
  if (!c || d.categories[c]) return;
  const byName = Object.entries(d.categories).find(([, n]) => n.toLowerCase() === c.toLowerCase());
  if (byName) throw new UserError(`Unknown category "${c}". Use the id "${byName[0]}" instead of the display name.`);
  const sug = suggestCategory(d, c);
  throw new UserError(`Unknown category "${c}".${sug.length ? " Did you mean: " + sug.join(", ") + "?" : ""} Valid ids: ${Object.keys(d.categories).join(", ")}`);
}
function resolve(d: Dataset, slug: string) {
  const s = findServer(d, slug);
  if (s) return s;
  const alt = search(d, { query: slug, limit: 5 }).map(x => x.slug);
  throw new UserError(`No server found for "${slug}".${alt.length ? " Did you mean: " + alt.join(", ") + "?" : " Try search_servers with a keyword."}`);
}
const cat = z.string().optional().describe("Category id from list_categories, e.g. 'databases'");
const lim = z.number().int().min(1).max(50).optional().describe("Max results (default 10, max 50)");

server.registerTool("search_servers", {
  title: "Search MCP servers",
  description: "Search the HookMCP directory (https://hookmcp.com) of 800+ MCP servers by keyword (typo-tolerant), category and filters. Returns matches ranked by relevance, then GitHub stars. Use get_install_config for ready-to-paste configs.",
  inputSchema: { query: z.string().optional().describe("Keywords, e.g. 'postgres' or 'browser automation'. Empty = top servers"), category: cat,
    topic: z.string().optional().describe("Integration slug from list_integrations, e.g. 'postgres', 'slack', 'playwright'"),
    client: z.string().optional().describe("AI client from list_clients, e.g. 'cursor', 'claude-desktop', 'vscode' (or display name)"),
    language: z.string().optional().describe("Implementation language, e.g. 'TypeScript', 'Python', 'Go' (case-insensitive)"),
    min_stars: z.number().int().min(0).optional().describe("Only servers with at least this many GitHub stars"),
    remote: z.boolean().optional().describe("Only servers that mention a hosted/remote endpoint"),
    maintained: z.boolean().optional().describe("Only servers with a commit in the last 90 days"),
    no_key: z.boolean().optional().describe("Only servers whose README doesn't mention API keys"),
    official: z.boolean().optional().describe("Only official/vendor servers"),
    one_click: z.boolean().optional().describe("Only servers with a ready-made client config"), limit: lim },
  annotations: ro,
}, wrap((a, d) => {
  checkCategory(d, a.category);
  if (a.topic) {
    const known = listIntegrations(d).map(i => i.slug);
    if (known.length && !known.includes(a.topic)) {
      const sug = suggestTopic(d, a.topic);
      throw new UserError(`Unknown topic "${a.topic}".${sug.length ? " Did you mean: " + sug.join(", ") + "?" : " Call list_integrations for valid slugs."}`);
    }
  }
  if (a.client) {
    const clients = listClients(d);
    const ok = clients.some(c => c.slug === a.client!.toLowerCase() || c.label.toLowerCase() === a.client!.toLowerCase() || c.name.toLowerCase() === a.client!.toLowerCase());
    if (clients.length && !ok) {
      const sug = suggestClient(d, a.client);
      throw new UserError(`Unknown client "${a.client}".${sug.length ? " Did you mean: " + sug.join(", ") + "?" : " Call list_clients for valid ids."}`);
    }
  }
  const r = search(d, a);
  return { count: r.length, results: r.map(s => summary(s, d)), ...(r.length ? {} : { hint: "No matches. Try fewer keywords or remove filters." }) };
}));

server.registerTool("get_server", {
  title: "Get MCP server details and configs",
  description: "Full details for one server: description, repo, install command and ready-to-paste configs for Claude Desktop, Cursor, VS Code, Windsurf and Claude Code. Accepts a slug from search results, a hookmcp.com/tools URL, a GitHub repo URL, or an exact name.",
  inputSchema: { slug: z.string().min(1).describe("Server slug, hookmcp.com URL, repo URL or exact name") }, annotations: ro,
}, wrap(({ slug }, d) => detail(resolve(d, slug), d)));

server.registerTool("get_install_config", {
  title: "Get ready-to-paste install config",
  description: "Ready-to-paste MCP config for one server and one (or all) clients: Claude Desktop, Cursor, VS Code, Windsurf, Claude Code. Optionally injects environment variables (e.g. API keys) into the config.",
  inputSchema: {
    slug: z.string().min(1).describe("Server slug, hookmcp.com URL, repo URL or exact name"),
    client: z.enum([...CLIENTS, "all"]).optional().describe("Target client (default all)"),
    env: z.record(z.string()).optional().describe("Environment variables to include, e.g. {\"GITHUB_TOKEN\": \"<your token>\"}"),
  }, annotations: ro,
}, wrap(({ slug, client, env }, d) => {
  const s = resolve(d, slug);
  const c = configs(s, env);
  if (!c) throw new UserError(`"${s.name}" has no ready-made config in HookMCP.${s.install_command ? ` Install command: ${s.install_command}.` : ""} See the README: ${s.repo_url}`);
  const base = { slug: s.slug, name: s.name, repo_url: s.repo_url,
    note: (s.api_key_hint && !env ? "The README mentions API keys/tokens: pass them via the `env` argument or add an \"env\" block. " : "") + "Verify against the project README before running; restart the client after editing its config." };
  if (!client || client === "all") return { ...base, configs: c };
  return { ...base, client, ...c[client] };
}));

server.registerTool("list_categories", { title: "List categories", description: "All HookMCP categories with ids and server counts.", inputSchema: {}, annotations: ro },
  wrap((_a, d) => categories(d)));

server.registerTool("list_integrations", {
  title: "List integrations",
  description: "Integration landing pages on HookMCP (Postgres, GitHub, Slack, Playwright, …) with slugs, server counts and URLs. Pass a slug as the `topic` filter on search_servers.",
  inputSchema: {}, annotations: ro,
}, wrap((_a, d) => listIntegrations(d)));

server.registerTool("list_clients", {
  title: "List AI clients",
  description: "AI clients with setup guides on HookMCP (Cursor, Claude Desktop, VS Code, …) with slugs, documented-server counts and URLs. Pass a slug as the `client` filter on search_servers.",
  inputSchema: {}, annotations: ro,
}, wrap((_a, d) => listClients(d)));

server.registerTool("trending_servers", {
  title: "Trending MCP servers",
  description: "Fast-growing servers: repos created within the last `days` (default 180), ranked by GitHub stars per day since creation (an approximation; no star history is tracked).",
  inputSchema: { category: cat, days: z.number().int().min(7).max(730).optional(), limit: lim }, annotations: ro,
}, wrap((a, d) => { checkCategory(d, a.category); return trending(d, a); }));

server.registerTool("recently_updated", {
  title: "Recently updated MCP servers", description: "Servers with the most recent commits.",
  inputSchema: { category: cat, limit: lim }, annotations: ro,
}, wrap((a, d) => { checkCategory(d, a.category); return recent(d, a); }));

await server.connect(new StdioServerTransport());
