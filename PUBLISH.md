# Publishing checklist (owner approval needed for each step)
1. Redeploy /workspace/mcp-directory/hookmcp-site-v2.zip so https://hookmcp.com/api/v1/servers.json goes live (currently 404). Verify: `curl -sI https://hookmcp.com/api/v1/servers.json`, then `node --test test/` with HOOKMCP_TEST_DATA_URL set to that URL.
2. Create the public GitHub repo yvshpvtil/hookmcp-mcp and push (git init; add; commit; remote; push).
3. npm: create/log in to an account (2FA on), run `npm login`, then `npm publish --access public` (prepublishOnly runs the tests).
4. Smoke test: `npx -y hookmcp-mcp` through the Inspector.
5. Optional: publish to the official MCP Registry (mcp-publisher with server.json; mcpName io.github.yvshpvtil/hookmcp-mcp is already in package.json). Add/claim it on Glama for the score badge.
6. Then open the PRs in /workspace/mcp-directory/launch/awesome-prs.md.
