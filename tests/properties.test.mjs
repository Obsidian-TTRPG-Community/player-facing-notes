import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlayerBody, buildPlayerCopy, readPfnSource } from "./parser.bundle.mjs";

const T = "pf";

test("buildPlayerBody: body only, regions joined by blank lines", () => {
  const src = ["::pf", "one", "::/pf", "dm", "::pf", "two", "::/pf"].join("\n");
  assert.equal(buildPlayerBody(src, { token: T }), "one\n\ntwo");
  assert.equal(buildPlayerBody("no regions", { token: T }), null);
});

test("buildPlayerCopy still wraps with frontmatter", () => {
  const { content } = buildPlayerCopy("::pf\nhello\n::/pf", { token: T }, { "pfn-source": '"A/B.md"' });
  assert.equal(content, '---\npublish: true\npfn-source: "A/B.md"\n---\n\nhello\n');
});

test("readPfnSource reads quoted and bare values", () => {
  assert.equal(readPfnSource('---\npublish: true\npfn-source: "Quests/Note.md"\n---\nbody'), "Quests/Note.md");
  assert.equal(readPfnSource("---\npfn-source: Quests/Note.md\n---\n"), "Quests/Note.md");
  assert.equal(readPfnSource("---\npublish: true\n---\n"), null);
  assert.equal(readPfnSource("no frontmatter"), null);
});
