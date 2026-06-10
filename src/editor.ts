import {
  Decoration,
  DecorationSet,
  EditorView,
  GutterMarker,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  gutter,
} from "@codemirror/view";
import type { Text as CMText } from "@codemirror/state";
import { setIcon } from "obsidian";
import {
  PfRegion,
  blockAt,
  findRegions,
  frontmatterRange,
  isEndMarker,
  isStartMarker,
  isWholeNoteFlagged,
  planToggle,
  regionContaining,
} from "./parser";

class MarkerPill extends WidgetType {
  constructor(private kind: "start" | "end") {
    super();
  }
  eq(other: MarkerPill): boolean {
    return other.kind === this.kind;
  }
  toDOM(): HTMLElement {
    const el = activeDocument.createElement("span");
    el.className = `pfn-pill pfn-pill-${this.kind}`;
    el.textContent = this.kind === "start" ? "▾ player-facing" : "▴";
    el.setAttribute("aria-label", this.kind === "start" ? "Start of player-facing content" : "End of player-facing content");
    return el;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

const startLine = Decoration.line({ class: "pfn-line pfn-line-start" });
const insideLine = Decoration.line({ class: "pfn-line" });
const endLine = Decoration.line({ class: "pfn-line pfn-line-end" });

/**
 * Live Preview / editor decorations:
 * - marker lines render as small pills (unless the cursor is on them)
 * - lines inside a region get a tinted left border
 */
export function pfnEditorExtension(getToken: () => string) {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.viewportChanged)
          this.decorations = this.build(u.view);
      }
      build(view: EditorView): DecorationSet {
        const token = getToken();
        const doc = view.state.doc;
        const sel = view.state.selection.main;
        const ranges: { from: number; to: number; deco: Decoration }[] = [];
        let inside = false;

        // Whole-note flag: tint everything after the frontmatter.
        const allLines = doc.toString().split("\n");
        if (isWholeNoteFlagged(allLines)) {
          const fm = frontmatterRange(allLines);
          for (let n = (fm ? fm[1] : 0) + 1; n <= doc.lines; n++) {
            ranges.push({ from: doc.line(n).from, to: doc.line(n).from, deco: insideLine });
          }
          return Decoration.set(
            ranges.map((r) => r.deco.range(r.from, r.to)),
            true
          );
        }

        for (let n = 1; n <= doc.lines; n++) {
          const line = doc.line(n);
          const cursorHere = sel.from <= line.to && sel.to >= line.from;
          if (isStartMarker(line.text, token)) {
            ranges.push({ from: line.from, to: line.from, deco: startLine });
            if (!cursorHere && line.length > 0)
              ranges.push({
                from: line.from,
                to: line.to,
                deco: Decoration.replace({ widget: new MarkerPill("start") }),
              });
            inside = true;
          } else if (isEndMarker(line.text, token)) {
            ranges.push({ from: line.from, to: line.from, deco: endLine });
            if (!cursorHere && line.length > 0)
              ranges.push({
                from: line.from,
                to: line.to,
                deco: Decoration.replace({ widget: new MarkerPill("end") }),
              });
            inside = false;
          } else if (inside) {
            ranges.push({ from: line.from, to: line.from, deco: insideLine });
          }
        }
        return Decoration.set(
          ranges.map((r) => r.deco.range(r.from, r.to)),
          true
        );
      }
    },
    { decorations: (v) => v.decorations }
  );
}

// ---------------------------------------------------------------------------
// Gutter eyes (Realm Works-style per-block toggles)
// ---------------------------------------------------------------------------

class EyeMarker extends GutterMarker {
  constructor(private on: boolean) {
    super();
  }
  eq(other: EyeMarker): boolean {
    return other.on === this.on;
  }
  toDOM(): Node {
    const el = activeDocument.createElement("span");
    el.className = this.on ? "pfn-eye pfn-eye-on" : "pfn-eye pfn-eye-off";
    setIcon(el, this.on ? "eye" : "eye-off");
    el.setAttribute(
      "aria-label",
      this.on ? "Player-facing — click to hide from players" : "DM-only — click to show players"
    );
    return el;
  }
}

const EYE_ON = new EyeMarker(true);
const EYE_OFF = new EyeMarker(false);

// Cache parsed lines/regions per document snapshot.
const docCache = new WeakMap<
  CMText,
  { lines: string[]; regions: PfRegion[]; wholeNote: boolean }
>();
function parsedDoc(doc: CMText, token: string) {
  let c = docCache.get(doc);
  if (!c) {
    const lines = doc.toString().split("\n");
    c = {
      lines,
      regions: findRegions(lines, token),
      wholeNote: isWholeNoteFlagged(lines),
    };
    docCache.set(doc, c);
  }
  return c;
}

/** Apply a toggle (wrap/unwrap) at a 0-based line, directly on the EditorView. */
export function toggleAtLineCM(view: EditorView, idx: number, token: string): boolean {
  const { lines } = parsedDoc(view.state.doc, token);
  const plan = planToggle(lines, idx, token);
  if (!plan) return false;
  const doc = view.state.doc;
  if (plan.kind === "unwrap") {
    const changes: { from: number; to: number }[] = [];
    const del = (lineIdx: number) => {
      const l = doc.line(lineIdx + 1);
      changes.push({ from: l.from > 0 ? l.from - 1 : l.from, to: l.to });
    };
    del(plan.startLine);
    if (plan.endLine !== null) del(plan.endLine);
    view.dispatch({ changes });
  } else {
    const first = doc.line(plan.from + 1);
    const last = doc.line(plan.to + 1);
    view.dispatch({
      changes: [
        { from: first.from, to: first.from, insert: plan.startMarker + "\n" },
        { from: last.to, to: last.to, insert: "\n" + plan.endMarker },
      ],
    });
  }
  return true;
}

/**
 * Eye gutter: open eye on flagged regions (at the start-marker line), closed
 * eye at the first line of each unflagged block. Click to toggle.
 */
export function pfnGutter(getToken: () => string) {
  return gutter({
    class: "pfn-gutter",
    lineMarker(view, lineBlock) {
      const token = getToken();
      const lineNo = view.state.doc.lineAt(lineBlock.from).number - 1;
      const { lines, regions, wholeNote } = parsedDoc(view.state.doc, token);
      if (wholeNote) return null; // entire note is player-facing
      const region = regionContaining(regions, lineNo);
      if (region) return region.startLine === lineNo ? EYE_ON : null;
      const block = blockAt(lines, lineNo, token);
      if (block && block.from === lineNo) return EYE_OFF;
      return null;
    },
    lineMarkerChange: (update: ViewUpdate) =>
      update.docChanged || update.viewportChanged || update.geometryChanged,
    domEventHandlers: {
      mousedown(view, lineBlock, event) {
        const token = getToken();
        // Resolve the line from the *current* pointer position rather than the
        // gutter element's cached block — rapid clicks otherwise act on stale
        // layout after a previous toggle shifted the document.
        const e = event as MouseEvent;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
        let lineNo = view.state.doc.lineAt(pos).number - 1;
        const { lines, wholeNote } = parsedDoc(view.state.doc, token);
        if (wholeNote) return true; // nothing to toggle per block
        // If the click landed on a blank line (content shifted under the
        // pointer), snap to the next block start within a few lines.
        if (lines[lineNo]?.trim() === "") {
          for (let d = 1; d <= 3 && lineNo + d < lines.length; d++) {
            if (lines[lineNo + d].trim() !== "") {
              lineNo += d;
              break;
            }
          }
        }
        // Swallow accidental double-clicks on the same spot (they would
        // immediately toggle the flag back, looking like a missed click).
        const now = Date.now();
        if (lastToggle.line === lineNo && now - lastToggle.time < 350) return true;
        if (toggleAtLineCM(view, lineNo, token)) {
          lastToggle = { line: lineNo, time: now };
        }
        return true;
      },
      dblclick() {
        return true;
      },
    },
  });
}

let lastToggle = { line: -1, time: 0 };

/**
 * Reading view: strip marker paragraphs so ::pf lines never render.
 * Markers render as plain text paragraphs (or lines inside blockquotes).
 */
export function stripMarkersFromRendered(el: HTMLElement, token: string): void {
  const re = new RegExp(`^::\\/?${token.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}$`);
  const candidates = el.querySelectorAll("p, li");
  candidates.forEach((node) => {
    const lines = (node.textContent ?? "").split("\n").map((s) => s.trim());
    if (lines.length > 0 && lines.every((l) => l === "" || re.test(l))) {
      node.remove();
      return;
    }
    // Mixed paragraph (marker on its own line via soft break): remove marker text nodes.
    if (lines.some((l) => re.test(l))) {
      const walker = (el.ownerDocument ?? activeDocument).createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const toClean: Text[] = [];
      let t: Node | null;
      while ((t = walker.nextNode())) {
        if (re.test((t.textContent ?? "").trim()) && t.instanceOf(Text)) toClean.push(t);
      }
      toClean.forEach((textNode) => {
        const prev = textNode.previousSibling;
        const next = textNode.nextSibling;
        if (prev && prev.nodeName === "BR") prev.remove();
        else if (next && next.nodeName === "BR") next.remove();
        textNode.remove();
      });
    }
  });
}
