import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blockAt,
  markersFor,
  planToggle,
  planWrapRange,
} from "./parser.bundle.mjs";

const T = "pf";

test("blockAt: paragraph bounded by blanks", () => {
  const doc = ["intro", "", "line a", "line b", "", "outro"];
  assert.deepEqual(blockAt(doc, 2, T), { from: 2, to: 3 });
  assert.deepEqual(blockAt(doc, 5, T), { from: 5, to: 5 });
  assert.equal(blockAt(doc, 1, T), null); // blank
});

test("blockAt: whole callout run incl. nesting", () => {
  const doc = ["before", "> [!note] Title", "> body", "> > [!info] nested", "> > inner", "after"];
  assert.deepEqual(blockAt(doc, 2, T), { from: 1, to: 4 });
  assert.deepEqual(blockAt(doc, 4, T), { from: 1, to: 4 });
});

test("blockAt: fenced code block", () => {
  const doc = ["text", "```js", "const x = 1;", "", "const y = 2;", "```", "text"];
  assert.deepEqual(blockAt(doc, 3, T), { from: 1, to: 5 });
  assert.deepEqual(blockAt(doc, 1, T), { from: 1, to: 5 });
});

test("blockAt: heading is standalone; skips frontmatter and markers", () => {
  const doc = ["---", "a: 1", "---", "## Heading", "para", "::pf", "flagged", "::/pf"];
  assert.deepEqual(blockAt(doc, 3, T), { from: 3, to: 3 });
  assert.equal(blockAt(doc, 1, T), null); // frontmatter
  assert.equal(blockAt(doc, 5, T), null); // marker line
});

test("markersFor: whole callout gets unprefixed markers (callout stays valid)", () => {
  const doc = ["> [!note] Title", "> body"];
  assert.deepEqual(markersFor(doc, 0, 1, T), { start: "::pf", end: "::/pf" });
});

test("markersFor: partial callout gets prefixed markers", () => {
  const doc = ["> [!note] Title", "> player bit", "> dm bit"];
  assert.deepEqual(markersFor(doc, 1, 1, T), { start: "> ::pf", end: "> ::/pf" });
});

test("planToggle: wrap a paragraph, unwrap a region", () => {
  const doc = ["para one", "", "para two"];
  assert.deepEqual(planToggle(doc, 0, T), {
    kind: "wrap",
    from: 0,
    to: 0,
    startMarker: "::pf",
    endMarker: "::/pf",
  });
  const flagged = ["::pf", "content", "::/pf"];
  assert.deepEqual(planToggle(flagged, 1, T), { kind: "unwrap", startLine: 0, endLine: 2 });
  // Clicking the marker lines also unwraps
  assert.deepEqual(planToggle(flagged, 0, T), { kind: "unwrap", startLine: 0, endLine: 2 });
});

test("planWrapRange: refuses overlap with existing regions, trims blanks", () => {
  const doc = ["::pf", "in", "::/pf", "", "free a", "free b"];
  assert.equal(planWrapRange(doc, 1, 4, T), null);
  assert.deepEqual(planWrapRange(doc, 3, 5, T), {
    kind: "wrap",
    from: 4,
    to: 5,
    startMarker: "::pf",
    endMarker: "::/pf",
  });
});

test("blockAt: closing fence delimiter maps to whole fence", () => {
  const doc = ["text", "```js", "const x = 1;", "```", "text"];
  assert.deepEqual(blockAt(doc, 3, T), { from: 1, to: 3 });
});
