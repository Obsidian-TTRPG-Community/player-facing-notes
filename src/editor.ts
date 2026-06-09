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
import type { Text } from "@codemirror/state";
import {
  PfRegion,
  blockAt,
  findRegions,
  isEndMarker,
  isStartMarker,
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
    const el = document.createElement("span");
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

const EYE_OPEN =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';

class EyeMarker extends GutterMarker {
  constructor(private on: boolean) {
    super();
  }
  eq(other: EyeMarker): boolean {
    return other.on === this.on;
  }
  toDOM(): Node {
    const el = document.createElement("span");
    el.className = this.on ? "pfn-eye pfn-eye-on" : "pfn-eye pfn-eye-off";
    el.innerHTML = this.on ? EYE_OPEN : EYE_CLOSED;
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
const docCache = new WeakMap<Text, { lines: string[]; regions: PfRegion[] }>();
function parsedDoc(doc: Text, token: string) {
  let c = docCache.get(doc);
  if (!c) {
    const lines = doc.toString().split("\n");
    c = { lines, regions: findRegions(lines, token) };
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
      const { lines, regions } = parsedDoc(view.state.doc, token);
      const region = regionContaining(regions, lineNo);
      if (region) return region.startLine === lineNo ? EYE_ON : null;
      const block = blockAt(lines, lineNo, token);
      if (block && block.from === lineNo) return EYE_OFF;
      return null;
    },
    lineMarkerChange: (update: ViewUpdate) =>
      update.docChanged || update.viewportChanged,
    domEventHandlers: {
      mousedown(view, lineBlock) {
        const lineNo = view.state.doc.lineAt(lineBlock.from).number - 1;
        return toggleAtLineCM(view, lineNo, getToken());
      },
    },
  });
}

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
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const toClean: Text2[] = [];
      let t: Node | null;
      while ((t = walker.nextNode())) {
        if (re.test((t.textContent ?? "").trim())) toClean.push(t as Text2);
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

// DOM Text node (the CM6 import shadows the global Text type).
type Text2 = globalThis.Text;
