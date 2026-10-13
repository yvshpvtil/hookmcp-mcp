import { readFile } from "node:fs/promises";

export interface Server {
  slug: string; name: string; owner: string; repo_url: string; homepage: string | null;
  description: string | null; category: string; status: "maintained" | "aging" | "stale" | null;
  stars: number | null; official: boolean; remote_available: boolean; api_key_hint: boolean | null;
  license: string | null; language: string | null; clients_mentioned: string[]; topics: string[];
  last_commit: string | null; created_at: string | null; install_command: string | null;
  install_source: string | null; config: { key: string; command: string; args: string[] } | null; url: string;
}
export interface Dataset { categories: Record<string, string>; servers: Server[]; fetchedAt: number; source: string }

export const DATA_URL = process.env.HOOKMCP_DATA_URL || "https://hookmcp.com/api/v1/servers.json";
// Cloudflare's bot protection rejects some non-browser user agents, so identify as a browser-compatible client.
export const USER_AGENT = "Mozilla/5.0 (compatible; hookmcp-mcp/0.1.0; +https://hookmcp.com) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TTL_MS = Number(process.env.HOOKMCP_CACHE_TTL_MS || 6 * 60 * 60 * 1000);

let cache: Dataset | null = null;
let inflight: Promise<Dataset> | null = null;

async function fetchJson(url: string): Promise<any> {
  if (url.startsWith("file://")) return JSON.parse(await readFile(new URL(url), "utf8"));
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HookMCP data request failed: HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function getData(force = false): Promise<Dataset> {
  if (!force && cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const j = await fetchJson(DATA_URL);
      if (!j || !Array.isArray(j.servers) || typeof j.categories !== "object") throw new Error("Unexpected HookMCP data format");
      cache = { categories: j.categories, servers: j.servers, fetchedAt: Date.now(), source: DATA_URL };
      return cache;
    } catch (e) {
      if (cache) return cache; // serve stale data rather than failing
      throw e;
    } finally { inflight = null; }
  })();
  return inflight;
}

export function _setDataForTests(d: Dataset | null) { cache = d; }
