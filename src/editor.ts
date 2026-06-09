import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { isEndMarker, isStartMarker } from "./parser";

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
      const toClean: Text[] = [];
      let t: Node | null;
      while ((t = walker.nextNode())) {
        if (re.test((t.textContent ?? "").trim())) toClean.push(t as Text);
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
