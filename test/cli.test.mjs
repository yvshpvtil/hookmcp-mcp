import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const BIN = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));

test("--version prints package.json version", () => {
  assert.equal(execFileSync(process.execPath, [BIN, "--version"]).toString().trim(), pkg.version);
  assert.equal(execFileSync(process.execPath, [BIN, "-v"]).toString().trim(), pkg.version);
});
test("--help lists usage and tools", () => {
  const o = execFileSync(process.execPath, [BIN, "--help"]).toString();
  assert.match(o, /Usage:/); assert.match(o, /get_install_config/); assert.match(o, /HOOKMCP_CACHE_FILE/);
});
test("unknown flag exits 2", () => {
  const r = spawnSync(process.execPath, [BIN, "--bogus"]);
  assert.equal(r.status, 2); assert.match(r.stderr.toString(), /Unknown option: --bogus/);
});
test("server.json matches package.json", () => {
  const s = JSON.parse(readFileSync(new URL("../server.json", import.meta.url)));
  assert.equal(s.name, pkg.mcpName); assert.equal(s.version, pkg.version);
  assert.equal(s.packages[0].identifier, pkg.name); assert.equal(s.packages[0].version, pkg.version);
  assert.equal(s.packages[0].transport.type, "stdio");
});
