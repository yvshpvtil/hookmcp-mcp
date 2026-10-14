import { test } from "node:test";
import assert from "node:assert/strict";
import { editDistance, score, search } from "../dist/logic.js";
const mk = (o) => ({ slug: o.name.toLowerCase(), owner: "x", description: "", category: "other", topics: [], language: null, stars: 0, official: false, config: null, ...o });

test("editDistance", () => {
  assert.equal(editDistance("kitten", "sitting", 3), 3);
  assert.equal(editDistance("abc", "abc"), 0);
  assert.ok(editDistance("abc", "xyzabcdef", 2) > 2);
});
test("score: name > description, aliases and plurals", () => {
  assert.ok(score(mk({ name: "Postgres" }), ["postgres"]) > score(mk({ name: "Foo", description: "postgres tools" }), ["postgres"]));
  assert.ok(score(mk({ name: "Kubernetes MCP" }), ["k8s"]) > 0);
  assert.ok(score(mk({ name: "Notes" }), ["note"]) > 0);
  assert.equal(score(mk({ name: "Slack" }), ["slack", "zebra"]), 0);
});
test("search: relevance beats stars", () => {
  const d = { categories: {}, servers: [mk({ name: "Big", description: "has redis", stars: 100000 }), mk({ name: "Redis", stars: 10 })] };
  assert.equal(search(d, { query: "redis" })[0].name, "Redis");
});

test("topic and client filters", () => {
  const d = { categories: {}, integrations: [{ slug: "postgres", name: "PostgreSQL", servers: 1, url: "https://hookmcp.com/topics/postgres/" }], clients: [{ slug: "cursor", name: "Cursor", label: "Cursor", servers: 1, url: "https://hookmcp.com/clients/cursor/" }], servers: [
    mk({ name: "Pg", integrations: ["postgres"], clients_mentioned: ["Cursor"], stars: 10 }),
    mk({ name: "Other", integrations: ["slack"], clients_mentioned: ["VS Code"], stars: 99 }),
  ] };
  assert.equal(search(d, { topic: "postgres" }).length, 1);
  assert.equal(search(d, { topic: "postgres" })[0].name, "Pg");
  assert.equal(search(d, { client: "cursor" })[0].name, "Pg");
  assert.equal(search(d, { client: "Cursor" })[0].name, "Pg");
});


test("configs: remote url configs", async () => {
  const { configs } = await import("../dist/logic.js");
  const s = mk({ name: "Notion", slug: "notion-official-remote", config: { key: "notion", url: "https://mcp.notion.com/mcp", transport: "http" } });
  const c = configs(s);
  assert.ok(c);
  assert.equal(c.cursor.json.mcpServers.notion.url, "https://mcp.notion.com/mcp");
  assert.equal(c.vscode.json.servers.notion.type, "http");
  assert.match(c.claude_code.command, /--transport http/);
  assert.equal(c.stdio_bridge.json.mcpServers.notion.args[2], "https://mcp.notion.com/mcp");
  // stdio path still works
  const local = configs(mk({ name: "Pg", config: { key: "pg", command: "npx", args: ["-y", "pg"] } }));
  assert.equal(local.cursor.json.mcpServers.pg.command, "npx");
  assert.equal(local.stdio_bridge, undefined);
});
