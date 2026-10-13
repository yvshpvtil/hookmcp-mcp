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
