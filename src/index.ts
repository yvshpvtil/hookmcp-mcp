#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getData } from "./data.js";
import { search, summary, detail, findServer, categories, trending, recent } from "./logic.js";

const VERSION = "0.1.0";
const server = new McpServer({ name: "hookmcp", version: VERSION });
const ro = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;
const out = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });
const fail = (msg: string) => ({ isError: true, content: [{ type: "text" as const, text: msg }] });
const wrap = <A,>(fn: (a: A) => Promise<unknown>) => async (a: A) => { try { return out(await fn(a)); } catch (e) { return fail(`HookMCP error: ${(e as Error).message}`); } };
const cat = z.string().optional().describe("Category id from list_categories, e.g. 'databases'");
const lim = z.number().int().min(1).max(50).optional().describe("Max results (default 10, max 50)");

server.registerTool("search_servers", {
  title: "Search MCP servers",
  description: "Search the HookMCP directory (https://hookmcp.com) of 800+ MCP servers by keyword, category and filters. Returns matches ranked by relevance, then GitHub stars. Use get_server for install configs.",
  inputSchema: { query: z.string().optional().describe("Keywords, e.g. 'postgres' or 'browser automation'. Empty = top servers"), category: cat,
    remote: z.boolean().optional().describe("Only servers that mention a hosted/remote endpoint"),
    maintained: z.boolean().optional().describe("Only servers with a commit in the last 90 days"),
    no_key: z.boolean().optional().describe("Only servers whose README doesn't mention API keys"),
    official: z.boolean().optional().describe("Only official/vendor servers"),
    one_click: z.boolean().optional().describe("Only servers with a ready-made client config"), limit: lim },
  annotations: ro,
}, wrap(async (a) => { const d = await getData(); const r = search(d, a); return { count: r.length, results: r.map(s => summary(s, d)) }; }));

server.registerTool("get_server", {
  title: "Get MCP server details and configs",
  description: "Full details for one server: description, repo, install command and ready-to-paste configs for Claude Desktop, Cursor, VS Code and Claude Code. Accepts a slug from search results, a hookmcp.com/tools URL, a GitHub repo URL, or an exact name.",
  inputSchema: { slug: z.string().min(1).describe("Server slug, hookmcp.com URL, repo URL or exact name") }, annotations: ro,
}, async ({ slug }) => { try { const d = await getData(); const s = findServer(d, slug); if (!s) { const alt = search(d, { query: slug, limit: 5 }).map(x => x.slug); return fail(`No server found for "${slug}".${alt.length ? " Did you mean: " + alt.join(", ") : " Try search_servers."}`); } return out(detail(s, d)); } catch (e) { return fail(`HookMCP error: ${(e as Error).message}`); } });

server.registerTool("list_categories", { title: "List categories", description: "All HookMCP categories with ids and server counts.", inputSchema: {}, annotations: ro },
  wrap(async () => categories(await getData())));

server.registerTool("trending_servers", {
  title: "Trending MCP servers",
  description: "Fast-growing servers: repos created within the last `days` (default 180), ranked by GitHub stars per day since creation (an approximation; no star history is tracked).",
  inputSchema: { category: cat, days: z.number().int().min(7).max(730).optional(), limit: lim }, annotations: ro,
}, wrap(async (a) => trending(await getData(), a)));

server.registerTool("recently_updated", {
  title: "Recently updated MCP servers", description: "Servers with the most recent commits.",
  inputSchema: { category: cat, limit: lim }, annotations: ro,
}, wrap(async (a) => recent(await getData(), a)));

await server.connect(new StdioServerTransport());
