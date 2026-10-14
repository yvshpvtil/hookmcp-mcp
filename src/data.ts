import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { VERSION } from "./version.js";

export interface Server {
  slug: string; name: string; owner: string; repo_url: string; homepage: string | null;
  description: string | null; category: string; status: "maintained" | "aging" | "stale" | null;
  stars: number | null; official: boolean; remote_available: boolean; api_key_hint: boolean | null;
  license: string | null; language: string | null; clients_mentioned: string[]; topics: string[];
  integrations?: string[];
  last_commit: string | null; created_at: string | null; install_command: string | null;
  install_source: string | null; config: { key: string; command?: string; args?: string[]; url?: string; transport?: string } | null; url: string; remote_url?: string | null; listing_kind?: string | null; quality_grade?: string | null; quality_score?: number | null;
}
export interface Integration { slug: string; name: string; servers: number; url: string; blurb?: string }
export interface ClientInfo { slug: string; name: string; label: string; servers: number; url: string; docs?: string; blurb?: string }
export interface Dataset { categories: Record<string, string>; servers: Server[]; integrations?: Integration[]; clients?: ClientInfo[]; fetchedAt: number; source: string; stale?: boolean }

export const DATA_URL = process.env.HOOKMCP_DATA_URL || "https://hookmcp.com/api/v1/servers.json";
// Cloudflare's bot protection rejects some non-browser user agents, so identify as a browser-compatible client.
export const USER_AGENT = `Mozilla/5.0 (compatible; hookmcp-mcp/${VERSION}; +https://hookmcp.com) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36`;
const TTL_MS = Number(process.env.HOOKMCP_CACHE_TTL_MS || 6 * 60 * 60 * 1000);

function cacheFile(): string | null {
  const v = process.env.HOOKMCP_CACHE_FILE;
  if (v === "off" || v === "0") return null;
  if (v) return v;
  const base = process.env.XDG_CACHE_HOME || (homedir() ? join(homedir(), ".cache") : tmpdir());
  return join(base, "hookmcp-mcp", "servers.json");
}

let cache: Dataset | null = null;
let inflight: Promise<Dataset> | null = null;

function validate(j: any) {
  if (!j || !Array.isArray(j.servers) || typeof j.categories !== "object") throw new Error("Unexpected HookMCP data format (missing servers/categories)");
}

async function fetchJson(url: string): Promise<any> {
  if (url.startsWith("file://")) return JSON.parse(await readFile(new URL(url), "utf8"));
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new Error(`Could not reach ${url} (${(e as Error).message}). Check your network connection or set HOOKMCP_DATA_URL.`);
  }
  if (!res.ok) throw new Error(`HookMCP data request failed: HTTP ${res.status} for ${url}${res.status >= 500 ? " (server error, try again later)" : ""}`);
  return res.json();
}

async function readDisk(): Promise<Dataset | null> {
  const f = cacheFile(); if (!f) return null;
  try { const j = JSON.parse(await readFile(f, "utf8")); validate(j); if (j.source !== DATA_URL) return null; return j; } catch { return null; }
}
async function writeDisk(d: Dataset) {
  const f = cacheFile(); if (!f) return;
  try { await mkdir(dirname(f), { recursive: true }); await writeFile(f, JSON.stringify(d)); } catch { /* cache is best-effort */ }
}

export async function getData(force = false): Promise<Dataset> {
  if (!force && cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      if (!force && !cache) { const disk = await readDisk(); if (disk && Date.now() - disk.fetchedAt < TTL_MS) return (cache = disk); }
      const j = await fetchJson(DATA_URL);
      validate(j);
      cache = { categories: j.categories, servers: j.servers, integrations: j.integrations || [], clients: j.clients || [], fetchedAt: Date.now(), source: DATA_URL };
      await writeDisk(cache);
      return cache;
    } catch (e) {
      const fallback = cache || await readDisk();
      if (fallback) return (cache = { ...fallback, stale: true }); // offline: serve stale data rather than failing
      throw e;
    } finally { inflight = null; }
  })();
  return inflight;
}

export function _setDataForTests(d: Dataset | null) { cache = d; }
