import type { Dataset, Server } from "./data.js";

export interface SearchOpts { query?: string; category?: string; remote?: boolean; maintained?: boolean; no_key?: boolean; official?: boolean; one_click?: boolean; limit?: number }

function score(s: Server, terms: string[]): number {
  if (!terms.length) return 1;
  const name = s.name.toLowerCase(), slug = s.slug.toLowerCase();
  const hay = [s.description, s.owner, s.category, ...(s.topics || [])].join(" ").toLowerCase();
  let sc = 0;
  for (const t of terms) {
    if (name === t) sc += 10; else if (name.includes(t)) sc += 5;
    else if (slug.includes(t)) sc += 3; else if (hay.includes(t)) sc += 1; else return 0;
  }
  return sc;
}

export function search(d: Dataset, o: SearchOpts): Server[] {
  const terms = (o.query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const limit = Math.min(Math.max(o.limit ?? 10, 1), 50);
  return d.servers
    .filter(s => (!o.category || s.category === o.category)
      && (!o.remote || s.remote_available) && (!o.maintained || s.status === "maintained")
      && (!o.no_key || s.api_key_hint === false) && (!o.official || s.official) && (!o.one_click || !!s.config))
    .map(s => [s, score(s, terms)] as const).filter(([, sc]) => sc > 0)
    .sort((a, b) => b[1] - a[1] || (b[0].stars ?? 0) - (a[0].stars ?? 0))
    .slice(0, limit).map(([s]) => s);
}

export function summary(s: Server, d: Dataset) {
  return { slug: s.slug, name: s.name, description: s.description, category: d.categories[s.category] ?? s.category,
    stars: s.stars, status: s.status, last_commit: s.last_commit?.slice(0, 10) ?? null, official: s.official,
    remote_available: s.remote_available, api_key: s.api_key_hint === true ? "likely required" : s.api_key_hint === false ? "not mentioned" : "unknown",
    one_click_config: !!s.config, url: s.url };
}

export function configs(s: Server) {
  if (!s.config) return null;
  const { key, command, args } = s.config;
  const std = { mcpServers: { [key]: { command, args } } };
  return {
    claude_desktop: { file: "claude_desktop_config.json (macOS: ~/Library/Application Support/Claude/, Windows: %APPDATA%\\Claude\\)", json: std },
    cursor: { file: "~/.cursor/mcp.json (global) or .cursor/mcp.json (project)", json: std,
      deeplink: "cursor://anysphere.cursor-deeplink/mcp/install?name=" + encodeURIComponent(key) + "&config=" + encodeURIComponent(Buffer.from(JSON.stringify({ command, args })).toString("base64")) },
    vscode: { file: ".vscode/mcp.json", json: { servers: { [key]: { type: "stdio", command, args } } },
      deeplink: "vscode:mcp/install?" + encodeURIComponent(JSON.stringify({ name: key, command, args })) },
    claude_code: { command: `claude mcp add ${key} -- ${[command, ...args].join(" ")}` },
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
