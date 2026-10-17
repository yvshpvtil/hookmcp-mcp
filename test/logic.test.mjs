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

test("findServer/detail: remotes with null repo_url (0.2.2)", async () => {
  const { findServer, detail } = await import("../dist/logic.js");
  const remote = mk({ name: "Jam MCP (official remote)", slug: "jam-official-remote", repo_url: null, homepage: "https://jam.dev/docs/debug-a-jam/mcp", listing_kind: "remote", remote_url: "https://mcp.jam.dev/mcp", clients_mentioned: [], config: { key: "jam", url: "https://mcp.jam.dev/mcp", transport: "http" }, tools: ["getDetails", "getConsoleLogs"], tools_source: "https://jam.dev/docs/debug-a-jam/mcp" });
  const local = mk({ name: "Pg", slug: "x-pg", repo_url: "https://github.com/x/pg", clients_mentioned: [] });
  const d = { categories: {}, servers: [remote, local] };
  assert.equal(findServer(d, "Pg").slug, "x-pg");
  assert.equal(findServer(d, "https://github.com/x/pg/").slug, "x-pg");
  assert.equal(findServer(d, "https://mcp.jam.dev/mcp").slug, "jam-official-remote");
  assert.equal(findServer(d, "nope-not-real"), undefined);
  const j = detail(remote, d);
  assert.equal(j.remote_url, "https://mcp.jam.dev/mcp");
  assert.deepEqual(j.tools, ["getDetails", "getConsoleLogs"]);
  assert.equal(j.tools_count, 2);
  assert.match(j.notes[0], /Vendor-hosted/);
  assert.equal(detail(local, d).tools, undefined);
});

test("search: tool-name matching, tool filter, matchedTools and tools cap (0.2.3)", async () => {
  const { search, matchedTools, detail, summary, TOOLS_CAP } = await import("../dist/logic.js");
  const many = Array.from({ length: 150 }, (_, i) => `tool_${i}`);
  const gh = mk({ name: "GitHub MCP (official remote)", slug: "github-official-remote", listing_kind: "remote", repo_url: null, clients_mentioned: [], tools: ["create_issue", "list_issues"], tools_source: "https://github.com/github/github-mcp-server#tools", stars: null });
  const sb = mk({ name: "Supabase MCP (official remote)", slug: "supabase-official-remote", listing_kind: "remote", repo_url: null, clients_mentioned: [], tools: ["execute_sql", "list_tables"], stars: null });
  const big = mk({ name: "Big", slug: "big-official-remote", listing_kind: "remote", repo_url: null, clients_mentioned: [], tools: many, tools_source: "https://example.com/tools" });
  const other = mk({ name: "Issue tracker helper", slug: "x-issues", description: "track issues", clients_mentioned: [], stars: 500 });
  const d = { categories: {}, servers: [gh, sb, big, other] };
  // exact tool name in the query finds the remote that lists it
  assert.equal(search(d, { query: "create_issue" })[0].slug, "github-official-remote");
  assert.equal(search(d, { query: "execute-sql" })[0].slug, "supabase-official-remote");
  // tool filter is exact and excludes servers without tool lists
  assert.deepEqual(search(d, { tool: "EXECUTE_SQL" }).map(s => s.slug), ["supabase-official-remote"]);
  assert.equal(search(d, { tool: "no_such_tool" }).length, 0);
  assert.deepEqual(matchedTools(gh, ["create_issue", "foo"]), ["create_issue"]);
  assert.deepEqual(matchedTools(other, ["create_issue"]), []);
  assert.equal(summary(gh, d).tools_count, 2);
  assert.equal(summary(other, d).tools_count, undefined);
  // get_server caps very long vendor catalogs but reports the full count
  const j = detail(big, d);
  assert.equal(j.tools.length, TOOLS_CAP);
  assert.equal(j.tools_count, 150);
  assert.equal(j.tools_truncated, true);
  assert.match(j.tools_note, /first 100 of 150/);
  assert.equal(detail(gh, d).tools_truncated, undefined);
});

test("configs: vendor client_overrides replace generic Claude Code command and add Codex (0.2.4)", async () => {
  const { configs } = await import("../dist/logic.js");
  const gh = mk({ name: "GitHub remote", listing_kind: "remote", config: { key: "github", url: "https://api.githubcopilot.com/mcp/", transport: "http",
    client_overrides: { claude_code: { command: "claude mcp add-json github '{\"type\":\"http\"}'", note: "needs PAT", source: "https://example.com/claude" },
      codex: { command: "codex mcp add github --url https://api.githubcopilot.com/mcp/ --bearer-token-env-var GITHUB_PAT_TOKEN", source: "https://example.com/codex" } } } });
  const c = configs(gh);
  assert.match(c.claude_code.command, /^claude mcp add-json github/);
  assert.equal(c.claude_code.note, "needs PAT");
  assert.equal(c.claude_code.source, "https://example.com/claude");
  assert.match(c.codex.command, /--bearer-token-env-var GITHUB_PAT_TOKEN$/);
  assert.equal(c.cursor.json.mcpServers.github.url, "https://api.githubcopilot.com/mcp/");
  const plain = configs(mk({ name: "Notion", config: { key: "notion", url: "https://mcp.notion.com/mcp", transport: "http" } }));
  assert.equal(plain.claude_code.command, "claude mcp add --transport http notion https://mcp.notion.com/mcp");
  assert.equal(plain.codex, undefined);
});

test("topic filter trusts integrations over raw GitHub topic tags when the dataset has them (0.2.4)", () => {
  const servers = [mk({ name: "Real", integrations: ["github"], topics: [] }), mk({ name: "Tagged", integrations: [], topics: ["github", "github-actions"] })];
  const withInteg = { categories: {}, integrations: [{ slug: "github", name: "GitHub", servers: 1, url: "https://hookmcp.com/topics/github/" }], servers };
  assert.deepEqual(search(withInteg, { topic: "github" }).map(s => s.name), ["Real"]);
  const legacy = { categories: {}, servers };
  assert.deepEqual(search(legacy, { topic: "github" }).map(s => s.name).sort(), ["Real", "Tagged"]);
});
