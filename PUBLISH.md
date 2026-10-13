# Publishing checklist (owner approval needed for each step)

0.1.0 is live on npm and GitHub. For 0.2.0:
1. `npm test` (and with `HOOKMCP_TEST_DATA_URL=https://hookmcp.com/api/v1/servers.json`).
2. Set the CHANGELOG date, then `npm publish --access public` (prepublishOnly runs the tests).
3. Smoke test: `npx -y hookmcp-mcp@0.2.0 --version` and via the Inspector.
4. Optional: `mcp-publisher login github && mcp-publisher publish` to submit server.json to the official MCP Registry (versions in server.json must match package.json; a test checks this).
5. Optional: tag `v0.2.0` / GitHub release.
