import type { Dataset, Server } from "./data.js";

export interface SearchOpts { query?: string; category?: string; remote?: boolean; maintained?: boolean; no_key?: boolean; official?: boolean; one_click?: boolean; language?: string; min_stars?: number; limit?: number }

/** Bounded Levenshtein distance (returns max+1 when exceeded). */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const tokens = (x: string) => x.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const norm = (t: string) => t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;
const ALIASES: Record<string, string[]> = { postgres: ["postgresql"], postgresql: ["postgres"], k8s: ["kubernetes"], kubernetes: ["k8s"], gh: ["github"], js: ["javascript"], ts: ["typescript"], db: ["database"], mongo: ["mongodb"] };

function fuzzyIn(t: string, toks: string[]): boolean {
  if (t.length < 4) return false;
  const max = t.length >= 8 ? 2 : 1;
  return toks.some(w => w.length >= 4 && editDistance(t, w, max) <= max);
}

function termScore(t: string, name: string, nameToks: string[], slug: string, hay: string, hayToks: string[]): number {
  if (name === t) return 10;
  if (nameToks.includes(t)) return 7;
  if (name.includes(t)) return 5;
  if (slug.includes(t)) return 3;
  if (hayToks.includes(t)) return 1.5;
  if (hay.includes(t)) return 1;
  if (fuzzyIn(t, nameToks)) return 2.5;
  if (fuzzyIn(t, hayToks)) return 0.5;
  return 0;
}

export function score(s: Server, terms: string[]): number {
  if (!terms.length) return 1;
  const name = s.name.toLowerCase(), slug = s.slug.toLowerCase(), nameToks = tokens(s.name).map(norm);
  const hay = [s.description, s.owner, s.category, s.language, ...(s.topics || [])].join(" ").toLowerCase();
  const hayToks = tokens(hay).map(norm);
  let sc = 0;
  for (const raw of terms) {
    const variants = [raw, norm(raw), ...(ALIASES[raw] || [])];
    const best = Math.max(...variants.map(t => termScore(t, name, nameToks, slug, hay, hayToks)));
    if (best === 0) return 0; // every term must match somewhere
    sc += best;
  }
  if (name === terms.join(" ")) sc += 10;
  if (s.official) sc += 0.5;
  return sc;
}

export function search(d: Dataset, o: SearchOpts): Server[] {
  const terms = (o.query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const limit = Math.min(Math.max(o.limit ?? 10, 1), 50);
  const lang = o.language?.toLowerCase();
  return d.servers
    .filter(s => (!o.category || s.category === o.category)
      && (!o.remote || s.remote_available) && (!o.maintained || s.status === "maintained")
      && (!o.no_key || s.api_key_hint === false) && (!o.official || s.official) && (!o.one_click || !!s.config)
      && (!lang || (s.language ?? "").toLowerCase() === lang) && (o.min_stars == null || (s.stars ?? 0) >= o.min_stars))
    .map(s => [s, score(s, terms)] as const).filter(([, sc]) => sc > 0)
    // log-stars tiebreak nudges popular projects up without drowning relevance
    .sort((a, b) => (b[1] + Math.log10(1 + (b[0].stars ?? 0)) * 0.3) - (a[1] + Math.log10(1 + (a[0].stars ?? 0)) * 0.3))
    .slice(0, limit).map(([s]) => s);
}

/** Close category ids for "did you mean" hints. */
export function suggestCategory(d: Dataset, c: string): string[] {
  const q = c.toLowerCase();
  return Object.entries(d.categories).filter(([id, name]) => id.includes(q) || name.toLowerCase().includes(q) || q.includes(id.split("-")[0]) || editDistance(q, id, 3) <= 3).map(([id]) => id);
}

export function languages(d: Dataset) {
  const n: Record<string, number> = {};
  for (const s of d.servers) if (s.language) n[s.language] = (n[s.language] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([language, servers]) => ({ language, servers }));
}

export function summary(s: Server, d: Dataset) {
  return { slug: s.slug, name: s.name, description: s.description, category: d.categories[s.category] ?? s.category,
    stars: s.stars, status: s.status, last_commit: s.last_commit?.slice(0, 10) ?? null, official: s.official,
    remote_available: s.remote_available, api_key: s.api_key_hint === true ? "likely required" : s.api_key_hint === false ? "not mentioned" : "unknown",
    one_click_config: !!s.config, url: s.url };
}

export const CLIENTS = ["claude_desktop", "cursor", "vscode", "windsurf", "claude_code"] as const;
export type ClientId = typeof CLIENTS[number];

export function configs(s: Server, env?: Record<string, string>) {
  if (!s.config) return null;
  const { key, command, args } = s.config;
  const e = env && Object.keys(env).length ? { env } : {};
  const entry = { command, args, ...e };
  const std = { mcpServers: { [key]: entry } };
  const envFlags = env ? Object.entries(env).map(([k, v]) => `-e ${k}=${v}`).join(" ") : "";
  return {
    claude_desktop: { file: "claude_desktop_config.json (macOS: ~/Library/Application Support/Claude/, Windows: %APPDATA%\\Claude\\)", json: std },
    cursor: { file: "~/.cursor/mcp.json (global) or .cursor/mcp.json (project)", json: std,
      deeplink: "cursor://anysphere.cursor-deeplink/mcp/install?name=" + encodeURIComponent(key) + "&config=" + encodeURIComponent(Buffer.from(JSON.stringify(entry)).toString("base64")) },
    vscode: { file: ".vscode/mcp.json (workspace) or run 'MCP: Open User Configuration'", json: { servers: { [key]: { type: "stdio", ...entry } } },
      deeplink: "vscode:mcp/install?" + encodeURIComponent(JSON.stringify({ name: key, ...entry })) },
    windsurf: { file: "~/.codeium/windsurf/mcp_config.json", json: std },
    claude_code: { command: `claude mcp add ${key}${envFlags ? " " + envFlags : ""} -- ${[command, ...args].join(" ")}` },
  };
}

export function detail(s: Server, d: Dataset) {
  const src = s.install_source === "readme" ? "taken from the project README" : s.install_source === "package-derived" ? "derived from the package in the official MCP Registry" : null;
  return { ...summary(s, d), owner: s.owner, repo_url: s.repo_url, homepage: s.homepage, license: s.license, language: s.language,
    clients_documented: s.clients_mentioned, topics: s.topics, install_command: s.install_command, install_command_source: src,
    configs: configs(s),
    notes: [s.api_key_hint ? "The README mentions API keys/tokens: add them under \"env\" in the config." : "Check the README for any required environment variables.",
      "Data is automatically collected; verify against the project README before running."] };
}

export function findServer(d: Dataset, slug: string): Server | undefined {
  const q = slug.trim().toLowerCase().replace(/^https?:\/\/hookmcp\.com\/tools\//, "").replace(/\/$/, "");
  return d.servers.find(s => s.slug === q) || d.servers.find(s => s.repo_url.toLowerCase().replace(/\/$/, "") === q)
    || d.servers.find(s => s.name.toLowerCase() === q);
}

export function categories(d: Dataset) {
  const n: Record<string, number> = {};
  for (const s of d.servers) n[s.category] = (n[s.category] || 0) + 1;
  return Object.entries(d.categories).filter(([id]) => n[id]).map(([id, name]) => ({ id, name, servers: n[id], url: `https://hookmcp.com/categories/${id}/` }))
    .sort((a, b) => b.servers - a.servers);
}

export function trending(d: Dataset, o: { category?: string; limit?: number; days?: number }) {
  // "Trending" proxy: stars per day since creation, among repos created in the window (no star-history data available).
  const days = o.days ?? 180, now = Date.now(), limit = Math.min(Math.max(o.limit ?? 10, 1), 50);
  return d.servers.filter(s => s.created_at && (!o.category || s.category === o.category) && now - Date.parse(s.created_at) <= days * 864e5)
    .map(s => ({ s, v: (s.stars ?? 0) / Math.max(1, (now - Date.parse(s.created_at!)) / 864e5) }))
    .sort((a, b) => b.v - a.v).slice(0, limit).map(({ s, v }) => ({ ...summary(s, d), created_at: s.created_at!.slice(0, 10), stars_per_day: Math.round(v * 10) / 10 }));
}

export function recent(d: Dataset, o: { category?: string; limit?: number }) {
  const limit = Math.min(Math.max(o.limit ?? 10, 1), 50);
  return d.servers.filter(s => s.last_commit && (!o.category || s.category === o.category))
    .sort((a, b) => Date.parse(b.last_commit!) - Date.parse(a.last_commit!)).slice(0, limit).map(s => summary(s, d));
}
