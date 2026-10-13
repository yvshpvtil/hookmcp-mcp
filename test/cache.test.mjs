import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, existsSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const BIN = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const FIX = fileURLToPath(new URL("./fixtures/servers.json", import.meta.url));

async function withServer(env, fn) {
  const c = new Client({ name: "t", version: "1" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [BIN], env: { ...process.env, ...env } }));
  try { return await fn(c); } finally { await c.close(); }
}

test("writes disk cache and falls back to it when the source is unavailable", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hookmcp-"));
  const src = join(dir, "src.json"), cache = join(dir, "cache.json");
  copyFileSync(FIX, src);
  const url = pathToFileURL(src).href;
  await withServer({ HOOKMCP_DATA_URL: url, HOOKMCP_CACHE_FILE: cache }, async c => {
    const r = await c.callTool({ name: "list_categories", arguments: {} });
    assert.ok(!r.isError);
  });
  assert.ok(existsSync(cache));
  assert.equal(JSON.parse(readFileSync(cache, "utf8")).source, url);
  rmSync(src); // source now "offline"
  // TTL 0 forces a refetch, which fails, so the stale disk copy must be served with a note
  await withServer({ HOOKMCP_DATA_URL: url, HOOKMCP_CACHE_FILE: cache, HOOKMCP_CACHE_TTL_MS: "0" }, async c => {
    const r = await c.callTool({ name: "search_servers", arguments: { limit: 1 } });
    assert.ok(!r.isError);
    assert.match(r.content[1].text, /unreachable.*cached data/);
  });
  // fresh disk cache is used without touching the source at all
  await withServer({ HOOKMCP_DATA_URL: url, HOOKMCP_CACHE_FILE: cache }, async c => {
    const r = await c.callTool({ name: "search_servers", arguments: { limit: 1 } });
    assert.ok(!r.isError); assert.equal(r.content.length, 1);
  });
  rmSync(dir, { recursive: true });
});

test("no cache and no source gives a clear error", async () => {
  await withServer({ HOOKMCP_DATA_URL: "http://127.0.0.1:9/servers.json", HOOKMCP_CACHE_FILE: "off" }, async c => {
    const r = await c.callTool({ name: "list_categories", arguments: {} });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /Could not reach .*HOOKMCP_DATA_URL/);
  });
});
