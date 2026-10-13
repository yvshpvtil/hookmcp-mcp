import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const DATA_URL = process.env.HOOKMCP_TEST_DATA_URL || new URL("./fixtures/servers.json", import.meta.url).href;
let client;
const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); return { r, j: r.isError ? null : JSON.parse(r.content[0].text) }; };

before(async () => {
  client = new Client({ name: "hookmcp-test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))], env: { ...process.env, HOOKMCP_DATA_URL: DATA_URL } }));
});
after(async () => { await client?.close(); });

test("lists 5 read-only tools", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), ["get_server", "list_categories", "recently_updated", "search_servers", "trending_servers"]);
  for (const t of tools) assert.equal(t.annotations?.readOnlyHint, true);
});

test("search_servers by keyword", async () => {
  const { j } = await call("search_servers", { query: "postgres", limit: 5 });
  assert.ok(j.count > 0 && j.count <= 5);
  const raw = JSON.parse(readFileSync(new URL("./fixtures/servers.json", import.meta.url))).servers;
  for (const s of j.results) { const x = raw.find(r => r.slug === s.slug); assert.match(JSON.stringify([x.name, x.slug, x.description, x.owner, x.topics]), /postgres/i); }
});

test("search_servers filters", async () => {
  const { j } = await call("search_servers", { category: "databases", maintained: true, no_key: true, one_click: true, limit: 50 });
  assert.ok(j.count > 0);
  for (const s of j.results) { assert.equal(s.status, "maintained"); assert.equal(s.api_key, "not mentioned"); assert.equal(s.one_click_config, true); assert.equal(s.category, "Databases"); }
  const { j: r } = await call("search_servers", { remote: true, limit: 50 });
  assert.ok(r.results.every(s => s.remote_available));
});

test("get_server returns configs for all clients", async () => {
  const { j: s } = await call("search_servers", { one_click: true, limit: 1 });
  const { j } = await call("get_server", { slug: s.results[0].slug });
  assert.ok(j.repo_url.startsWith("https://github.com/"));
  assert.ok(j.install_command);
  const c = j.configs;
  assert.ok(c.claude_desktop.json.mcpServers && c.cursor.json.mcpServers && c.vscode.json.servers);
  assert.match(c.claude_code.command, /^claude mcp add \S+ -- /);
  assert.match(c.cursor.deeplink, /^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=/);
  const key = Object.keys(c.vscode.json.servers)[0];
  assert.equal(c.vscode.json.servers[key].type, "stdio");
  // also by hookmcp URL
  const { j: j2 } = await call("get_server", { slug: j.url });
  assert.equal(j2.slug, j.slug);
});

test("get_server unknown slug is a helpful error", async () => {
  const { r } = await call("get_server", { slug: "definitely-not-a-real-server-xyz" });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /No server found/);
});

test("list_categories", async () => {
  const { j } = await call("list_categories");
  assert.ok(j.length >= 10);
  assert.ok(j.every(c => c.id && c.name && c.servers > 0 && c.url.startsWith("https://hookmcp.com/categories/")));
});

test("trending and recently_updated", async () => {
  const { j: t } = await call("trending_servers", { days: 730, limit: 5 });
  assert.ok(t.length > 0 && t.length <= 5);
  for (let i = 1; i < t.length; i++) assert.ok(t[i - 1].stars_per_day >= t[i].stars_per_day);
  const { j: r } = await call("recently_updated", { limit: 5 });
  assert.equal(r.length, 5);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].last_commit >= r[i].last_commit);
});

test("invalid input rejected by schema", async () => {
  const r = await client.callTool({ name: "search_servers", arguments: { limit: 500 } }).catch(e => ({ isError: true, err: e }));
  assert.equal(r.isError, true);
});
