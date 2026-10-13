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
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))], env: { ...process.env, HOOKMCP_DATA_URL: DATA_URL, HOOKMCP_CACHE_FILE: "off" } }));
});
after(async () => { await client?.close(); });

test("lists 6 read-only tools", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), ["get_install_config", "get_server", "list_categories", "recently_updated", "search_servers", "trending_servers"]);
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

// ---- 0.2.0 features ----
const RAW = JSON.parse(readFileSync(new URL("./fixtures/servers.json", import.meta.url)));

test("search_servers tolerates typos", async () => {
  const target = RAW.servers.filter(s => s.config).sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    .find(s => s.name.toLowerCase().split(/[^a-z0-9]+/).some(w => w.length >= 7));
  const word = target.name.toLowerCase().split(/[^a-z0-9]+/).find(w => w.length >= 7);
  const typo = word.slice(0, 2) + word.slice(3); // drop a letter
  const { j } = await call("search_servers", { query: typo, limit: 50 });
  assert.ok(j.results.some(s => s.slug === target.slug), `"${typo}" should find ${target.slug}`);
});

test("search_servers ranks exact name matches first", async () => {
  const target = RAW.servers.find(s => s.config && /^[A-Za-z]+$/.test(s.name) && s.name.length >= 5);
  const { j } = await call("search_servers", { query: target.name, limit: 5 });
  assert.equal(j.results[0].name, target.name);
});

test("search_servers language and min_stars filters", async () => {
  const { j } = await call("search_servers", { language: "python", min_stars: 100, limit: 50 });
  assert.ok(j.count > 0);
  for (const s of j.results) { assert.ok(s.stars >= 100); assert.equal(RAW.servers.find(x => x.slug === s.slug).language, "Python"); }
});

test("search_servers empty result gives a hint", async () => {
  const { j } = await call("search_servers", { query: "zzqqxxnonexistentterm" });
  assert.equal(j.count, 0); assert.match(j.hint, /fewer keywords/);
});

test("unknown category is a helpful error", async () => {
  const { r } = await call("search_servers", { category: "database" });
  assert.equal(r.isError, true); assert.match(r.content[0].text, /Did you mean: .*databases/);
  const { r: r2 } = await call("recently_updated", { category: "Databases" });
  assert.equal(r2.isError, true); assert.match(r2.content[0].text, /id "databases"/);
});

test("get_install_config for every client, incl. Windsurf and env", async () => {
  const s = RAW.servers.find(x => x.config);
  const { j } = await call("get_install_config", { slug: s.slug });
  assert.deepEqual(Object.keys(j.configs).sort(), ["claude_code", "claude_desktop", "cursor", "vscode", "windsurf"]);
  assert.match(j.configs.windsurf.file, /\.codeium\/windsurf\/mcp_config\.json/);
  assert.deepEqual(j.configs.windsurf.json.mcpServers[s.config.key], { command: s.config.command, args: s.config.args });
  const { j: w } = await call("get_install_config", { slug: s.slug, client: "vscode", env: { API_KEY: "abc" } });
  assert.equal(w.client, "vscode");
  assert.deepEqual(w.json.servers[s.config.key].env, { API_KEY: "abc" });
  const { j: cc } = await call("get_install_config", { slug: s.slug, client: "claude_code", env: { API_KEY: "abc" } });
  assert.match(cc.command, /-e API_KEY=abc -- /);
  const { j: cur } = await call("get_install_config", { slug: s.slug, client: "cursor", env: { API_KEY: "abc" } });
  const cfg = JSON.parse(Buffer.from(decodeURIComponent(cur.deeplink.split("config=")[1]), "base64").toString());
  assert.deepEqual(cfg.env, { API_KEY: "abc" });
});

test("get_install_config errors helpfully", async () => {
  const nocfg = RAW.servers.find(x => !x.config);
  const { r } = await call("get_install_config", { slug: nocfg.slug });
  assert.equal(r.isError, true); assert.match(r.content[0].text, /no ready-made config/);
  const { r: r2 } = await call("get_install_config", { slug: "nope-nope-nope" });
  assert.equal(r2.isError, true); assert.match(r2.content[0].text, /No server found/);
  const r3 = await client.callTool({ name: "get_install_config", arguments: { slug: nocfg.slug, client: "emacs" } }).catch(e => ({ isError: true }));
  assert.equal(r3.isError, true);
});
