import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlayerCopy,
  findRegions,
  isEndMarker,
  isStartMarker,
  rewriteLinks,
  wrapLines,
} from "./parser.bundle.mjs";

const T = "pf";

test("marker detection, incl. inside callouts", () => {
  assert.ok(isStartMarker("::pf", T));
  assert.ok(isEndMarker("::/pf", T));
  assert.ok(isStartMarker("> ::pf", T));
  assert.ok(isStartMarker("> > ::pf", T));
  assert.ok(isEndMarker("> > ::/pf", T));
  assert.ok(!isStartMarker("::pfx", T));
  assert.ok(!isStartMarker("text ::pf", T));
  assert.ok(!isStartMarker("`::pf`", T));
});

test("findRegions skips frontmatter and pairs markers", () => {
  const doc = ["---", "publish: false", "---", "DM text", "::pf", "player", "::/pf", "more DM"];
  const r = findRegions(doc, T);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].startLine, r[0].endLine, r[0].unclosed], [4, 6, false]);
});

test("unclosed region runs to end of file", () => {
  const r = findRegions(["::pf", "a", "b"], T);
  assert.equal(r.length, 1);
  assert.ok(r[0].unclosed);
});

test("buildPlayerCopy keeps only flagged content, strips markers", () => {
  const src = [
    "---",
    "tags: [session]",
    "---",
    "# Secret DM plan",
    "The dragon is actually friendly.",
    "::pf",
    "## The Letter",
    "Dear Friends, my name is Azumi...",
    "::/pf",
    "DM: she is the wyrmling in disguise.",
    "::pf",
    "The crane leads you up the mountain path.",
    "::/pf",
  ].join("\n");
  const { content, regionCount } = buildPlayerCopy(src, { token: T });
  assert.equal(regionCount, 2);
  assert.ok(content.includes("## The Letter"));
  assert.ok(content.includes("crane leads you"));
  assert.ok(!content.includes("dragon is actually friendly"));
  assert.ok(!content.includes("wyrmling"));
  assert.ok(!content.includes("::pf"));
  assert.ok(content.startsWith("---\npublish: true"));
});

test("no regions -> null content", () => {
  assert.equal(buildPlayerCopy("just DM text", { token: T }).content, null);
});

test("nested callouts inside a region survive verbatim", () => {
  const src = [
    "::pf",
    "> [!quote] The note reads",
    "> > [!info] Nested",
    "> > Inner text",
    "::/pf",
  ].join("\n");
  const { content } = buildPlayerCopy(src, { token: T });
  assert.ok(content.includes("> [!quote] The note reads"));
  assert.ok(content.includes("> > Inner text"));
});

test("markers inside a callout flag part of it", () => {
  const src = [
    "> [!note] Monastery",
    "> ::pf",
    "> The abbey sits high in the hills.",
    "> ::/pf",
    "> DM: trap on the third step.",
  ].join("\n");
  const r = findRegions(src.split("\n"), T);
  assert.equal(r.length, 1);
  const { content } = buildPlayerCopy(src, { token: T });
  assert.ok(content.includes("> The abbey sits high in the hills."));
  assert.ok(!content.includes("trap"));
});

test("link rewriting: player target, DM-only target, attachment", () => {
  const resolve = (p) =>
    p === "Azumi" ? "_player/NPCs/Azumi" : p === "SecretVillain" ? null : undefined;
  assert.equal(
    rewriteLinks("Meet [[Azumi]] and [[SecretVillain|the stranger]].", resolve),
    "Meet [[_player/NPCs/Azumi|Azumi]] and the stranger."
  );
  assert.equal(rewriteLinks("![[map.png]]", resolve), "![[map.png]]");
  assert.equal(
    rewriteLinks("See [[Azumi#History|her past]]", resolve),
    "See [[_player/NPCs/Azumi#History|her past]]"
  );
  assert.equal(rewriteLinks("![[SecretVillain]]", resolve), "");
});

test("wrapLines matches blockquote prefix", () => {
  assert.deepEqual(wrapLines(["> line one", "> line two"], T), [
    "> ::pf",
    "> line one",
    "> line two",
    "> ::/pf",
  ]);
  assert.deepEqual(wrapLines(["plain"], T), ["::pf", "plain", "::/pf"]);
});
