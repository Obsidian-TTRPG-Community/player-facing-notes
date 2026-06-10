var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => PlayerFacingNotesPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/editor.ts
var import_view = require("@codemirror/view");
var import_obsidian = require("obsidian");

// src/parser.ts
var escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function markerRegex(token) {
  const t = escapeRe(token);
  return new RegExp(`^((?:\\s{0,3}>\\s?)*)::(\\/?)${t}\\s*$`);
}
function isStartMarker(line, token) {
  const m = line.match(markerRegex(token));
  return !!m && m[2] === "";
}
function isEndMarker(line, token) {
  const m = line.match(markerRegex(token));
  return !!m && m[2] === "/";
}
function frontmatterRange(lines) {
  if (lines[0]?.trim() !== "---")
    return null;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "---" || t === "...")
      return [0, i + 1];
  }
  return null;
}
function findRegions(lines, token) {
  const regions = [];
  const fm = frontmatterRange(lines);
  let i = fm ? fm[1] : 0;
  let open = null;
  for (; i < lines.length; i++) {
    if (open === null) {
      if (isStartMarker(lines[i], token))
        open = i;
    } else if (isEndMarker(lines[i], token)) {
      regions.push({ startLine: open, endLine: i, unclosed: false });
      open = null;
    }
  }
  if (open !== null) {
    regions.push({ startLine: open, endLine: lines.length - 1, unclosed: true });
  }
  return regions;
}
function rewriteLinks(line, resolveLink) {
  return line.replace(
    /(!?)\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g,
    (full, embed, path, hash, alias) => {
      const target = resolveLink(path.trim());
      if (target === void 0)
        return full;
      if (target === null) {
        return embed ? "" : alias ?? path.trim();
      }
      const display = alias ?? target.split("/").pop();
      return `${embed}[[${target}${hash ?? ""}|${display}]]`;
    }
  );
}
function buildPlayerBody(source, opts) {
  const lines = source.split("\n");
  if (isWholeNoteFlagged(lines)) {
    const fm = frontmatterRange(lines);
    let body = lines.slice(fm ? fm[1] : 0).map((l) => markerRegex(opts.token).test(l) ? "" : l).filter((l, i, arr) => !(l.trim() === "" && arr[i - 1]?.trim() === ""));
    while (body.length && body[0].trim() === "")
      body.shift();
    while (body.length && body[body.length - 1].trim() === "")
      body.pop();
    if (body.length === 0)
      return null;
    if (opts.resolveLink)
      body = body.map((l) => rewriteLinks(l, opts.resolveLink));
    return body.join("\n");
  }
  const regions = findRegions(lines, opts.token);
  if (regions.length === 0)
    return null;
  const chunks = [];
  for (const r of regions) {
    const from = r.startLine + 1;
    const to = r.unclosed ? r.endLine + 1 : r.endLine;
    let chunk = lines.slice(from, to);
    while (chunk.length && chunk[0].trim() === "")
      chunk.shift();
    while (chunk.length && chunk[chunk.length - 1].trim() === "")
      chunk.pop();
    if (chunk.length === 0)
      continue;
    if (opts.resolveLink)
      chunk = chunk.map((l) => rewriteLinks(l, opts.resolveLink));
    chunks.push(chunk.join("\n"));
  }
  return chunks.join("\n\n");
}
function isWholeNoteFlagged(lines) {
  const fm = frontmatterRange(lines);
  if (!fm)
    return false;
  for (let i = 1; i < fm[1] - 1; i++) {
    if (/^pfn\s*:\s*(true|yes)\s*$/i.test(lines[i]))
      return true;
  }
  return false;
}
function readPfnSource(content) {
  const lines = content.split("\n");
  const fm = frontmatterRange(lines);
  if (!fm)
    return null;
  for (let i = 1; i < fm[1] - 1; i++) {
    const m = lines[i].match(/^pfn-source:\s*["']?(.*?)["']?\s*$/);
    if (m && m[1])
      return m[1];
  }
  return null;
}
var isBlockquote = (l) => /^\s{0,3}>/.test(l);
var isFenceDelim = (l) => /^\s{0,3}(```|~~~)/.test(l);
var blockquotePrefix = (l) => l.match(/^((?:\s{0,3}>\s?)*)/)?.[1] ?? "";
function regionContaining(regions, line) {
  return regions.find((r) => line >= r.startLine && line <= r.endLine) ?? null;
}
function blockAt(lines, idx, token) {
  if (idx < 0 || idx >= lines.length)
    return null;
  const fm = frontmatterRange(lines);
  const start = fm ? fm[1] : 0;
  if (idx < start)
    return null;
  const line = lines[idx];
  const isMarker = (l) => markerRegex(token).test(l);
  let fenceOpen = -1;
  let prevOpen = -1;
  for (let i = start; i <= idx; i++) {
    if (isFenceDelim(lines[i])) {
      prevOpen = fenceOpen;
      fenceOpen = fenceOpen === -1 ? i : -1;
    }
  }
  if (fenceOpen === -1 && isFenceDelim(lines[idx]) && prevOpen !== -1) {
    return { from: prevOpen, to: idx };
  }
  if (fenceOpen !== -1) {
    const open = fenceOpen;
    let close = lines.length - 1;
    for (let i = open + 1; i < lines.length; i++) {
      if (isFenceDelim(lines[i])) {
        close = i;
        break;
      }
    }
    return { from: open, to: close };
  }
  if (line.trim() === "" || isMarker(line))
    return null;
  if (/^\s{0,3}#{1,6}\s/.test(line))
    return { from: idx, to: idx };
  if (isBlockquote(line)) {
    let from2 = idx;
    let to2 = idx;
    while (from2 > start && isBlockquote(lines[from2 - 1]) && !isMarker(lines[from2 - 1]))
      from2--;
    while (to2 < lines.length - 1 && isBlockquote(lines[to2 + 1]) && !isMarker(lines[to2 + 1]))
      to2++;
    return { from: from2, to: to2 };
  }
  const boundary = (l) => l.trim() === "" || isMarker(l) || isBlockquote(l) || isFenceDelim(l) || /^\s{0,3}#{1,6}\s/.test(l);
  let from = idx;
  let to = idx;
  while (from > start && !boundary(lines[from - 1]))
    from--;
  while (to < lines.length - 1 && !boundary(lines[to + 1]))
    to++;
  return { from, to };
}
function markersFor(lines, from, to, token) {
  let startPrefix = "";
  let endPrefix = "";
  if (isBlockquote(lines[from]) && from > 0 && isBlockquote(lines[from - 1]))
    startPrefix = blockquotePrefix(lines[from]);
  if (isBlockquote(lines[to]) && to < lines.length - 1 && isBlockquote(lines[to + 1]))
    endPrefix = blockquotePrefix(lines[to]);
  return { start: `${startPrefix}::${token}`, end: `${endPrefix}::/${token}` };
}
function planToggle(lines, idx, token) {
  const region = regionContaining(findRegions(lines, token), idx);
  if (region) {
    return {
      kind: "unwrap",
      startLine: region.startLine,
      endLine: region.unclosed ? null : region.endLine
    };
  }
  const block = blockAt(lines, idx, token);
  if (!block)
    return null;
  const m = markersFor(lines, block.from, block.to, token);
  return { kind: "wrap", from: block.from, to: block.to, startMarker: m.start, endMarker: m.end };
}
function planWrapRange(lines, from, to, token) {
  while (from < to && lines[from].trim() === "")
    from++;
  while (to > from && lines[to].trim() === "")
    to--;
  if (lines[from].trim() === "")
    return null;
  const regions = findRegions(lines, token);
  for (let i = from; i <= to; i++) {
    if (regionContaining(regions, i) || markerRegex(token).test(lines[i]))
      return null;
  }
  const m = markersFor(lines, from, to, token);
  return { kind: "wrap", from, to, startMarker: m.start, endMarker: m.end };
}

// src/editor.ts
var MarkerPill = class extends import_view.WidgetType {
  constructor(kind) {
    super();
    this.kind = kind;
  }
  eq(other) {
    return other.kind === this.kind;
  }
  toDOM() {
    const el = activeDocument.createElement("span");
    el.className = `pfn-pill pfn-pill-${this.kind}`;
    el.textContent = this.kind === "start" ? "\u25BE player-facing" : "\u25B4";
    el.setAttribute("aria-label", this.kind === "start" ? "Start of player-facing content" : "End of player-facing content");
    return el;
  }
  ignoreEvent() {
    return false;
  }
};
var startLine = import_view.Decoration.line({ class: "pfn-line pfn-line-start" });
var insideLine = import_view.Decoration.line({ class: "pfn-line" });
var endLine = import_view.Decoration.line({ class: "pfn-line pfn-line-end" });
function pfnEditorExtension(getToken) {
  return import_view.ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.build(view);
      }
      update(u) {
        if (u.docChanged || u.selectionSet || u.viewportChanged)
          this.decorations = this.build(u.view);
      }
      build(view) {
        const token = getToken();
        const doc = view.state.doc;
        const sel = view.state.selection.main;
        const ranges = [];
        let inside = false;
        const allLines = doc.toString().split("\n");
        if (isWholeNoteFlagged(allLines)) {
          const fm = frontmatterRange(allLines);
          for (let n = (fm ? fm[1] : 0) + 1; n <= doc.lines; n++) {
            ranges.push({ from: doc.line(n).from, to: doc.line(n).from, deco: insideLine });
          }
          return import_view.Decoration.set(
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
                deco: import_view.Decoration.replace({ widget: new MarkerPill("start") })
              });
            inside = true;
          } else if (isEndMarker(line.text, token)) {
            ranges.push({ from: line.from, to: line.from, deco: endLine });
            if (!cursorHere && line.length > 0)
              ranges.push({
                from: line.from,
                to: line.to,
                deco: import_view.Decoration.replace({ widget: new MarkerPill("end") })
              });
            inside = false;
          } else if (inside) {
            ranges.push({ from: line.from, to: line.from, deco: insideLine });
          }
        }
        return import_view.Decoration.set(
          ranges.map((r) => r.deco.range(r.from, r.to)),
          true
        );
      }
    },
    { decorations: (v) => v.decorations }
  );
}
var EyeMarker = class extends import_view.GutterMarker {
  constructor(on) {
    super();
    this.on = on;
  }
  eq(other) {
    return other.on === this.on;
  }
  toDOM() {
    const el = activeDocument.createElement("span");
    el.className = this.on ? "pfn-eye pfn-eye-on" : "pfn-eye pfn-eye-off";
    (0, import_obsidian.setIcon)(el, this.on ? "eye" : "eye-off");
    el.setAttribute(
      "aria-label",
      this.on ? "Player-facing \u2014 click to hide from players" : "DM-only \u2014 click to show players"
    );
    return el;
  }
};
var EYE_ON = new EyeMarker(true);
var EYE_OFF = new EyeMarker(false);
var docCache = /* @__PURE__ */ new WeakMap();
function parsedDoc(doc, token) {
  let c = docCache.get(doc);
  if (!c) {
    const lines = doc.toString().split("\n");
    c = {
      lines,
      regions: findRegions(lines, token),
      wholeNote: isWholeNoteFlagged(lines)
    };
    docCache.set(doc, c);
  }
  return c;
}
function toggleAtLineCM(view, idx, token) {
  const { lines } = parsedDoc(view.state.doc, token);
  const plan = planToggle(lines, idx, token);
  if (!plan)
    return false;
  const doc = view.state.doc;
  if (plan.kind === "unwrap") {
    const changes = [];
    const del = (lineIdx) => {
      const l = doc.line(lineIdx + 1);
      changes.push({ from: l.from > 0 ? l.from - 1 : l.from, to: l.to });
    };
    del(plan.startLine);
    if (plan.endLine !== null)
      del(plan.endLine);
    view.dispatch({ changes });
  } else {
    const first = doc.line(plan.from + 1);
    const last = doc.line(plan.to + 1);
    view.dispatch({
      changes: [
        { from: first.from, to: first.from, insert: plan.startMarker + "\n" },
        { from: last.to, to: last.to, insert: "\n" + plan.endMarker }
      ]
    });
  }
  return true;
}
function pfnGutter(getToken) {
  return (0, import_view.gutter)({
    class: "pfn-gutter",
    lineMarker(view, lineBlock) {
      const token = getToken();
      const lineNo = view.state.doc.lineAt(lineBlock.from).number - 1;
      const { lines, regions, wholeNote } = parsedDoc(view.state.doc, token);
      if (wholeNote)
        return null;
      const region = regionContaining(regions, lineNo);
      if (region)
        return region.startLine === lineNo ? EYE_ON : null;
      const block = blockAt(lines, lineNo, token);
      if (block && block.from === lineNo)
        return EYE_OFF;
      return null;
    },
    lineMarkerChange: (update) => update.docChanged || update.viewportChanged || update.geometryChanged,
    domEventHandlers: {
      mousedown(view, lineBlock, event) {
        const token = getToken();
        const e = event;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
        let lineNo = view.state.doc.lineAt(pos).number - 1;
        const { lines, wholeNote } = parsedDoc(view.state.doc, token);
        if (wholeNote)
          return true;
        if (lines[lineNo]?.trim() === "") {
          for (let d = 1; d <= 3 && lineNo + d < lines.length; d++) {
            if (lines[lineNo + d].trim() !== "") {
              lineNo += d;
              break;
            }
          }
        }
        const now = Date.now();
        if (lastToggle.line === lineNo && now - lastToggle.time < 350)
          return true;
        if (toggleAtLineCM(view, lineNo, token)) {
          lastToggle = { line: lineNo, time: now };
        }
        return true;
      },
      dblclick() {
        return true;
      }
    }
  });
}
var lastToggle = { line: -1, time: 0 };
function stripMarkersFromRendered(el, token) {
  const re = new RegExp(`^::\\/?${token.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}$`);
  const candidates = el.querySelectorAll("p, li");
  candidates.forEach((node) => {
    const lines = (node.textContent ?? "").split("\n").map((s) => s.trim());
    if (lines.length > 0 && lines.every((l) => l === "" || re.test(l))) {
      node.remove();
      return;
    }
    if (lines.some((l) => re.test(l))) {
      const walker = (el.ownerDocument ?? activeDocument).createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const toClean = [];
      let t;
      while (t = walker.nextNode()) {
        if (re.test((t.textContent ?? "").trim()) && t.instanceOf(Text))
          toClean.push(t);
      }
      toClean.forEach((textNode) => {
        const prev = textNode.previousSibling;
        const next = textNode.nextSibling;
        if (prev && prev.nodeName === "BR")
          prev.remove();
        else if (next && next.nodeName === "BR")
          next.remove();
        textNode.remove();
      });
    }
  });
}

// src/settings.ts
var import_obsidian2 = require("obsidian");
var DEFAULT_SETTINGS = {
  token: "pf",
  outputFolder: "_player",
  autoSync: false,
  contextMenu: true
};
var PfnSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian2.Setting(containerEl).setName("Marker token").setDesc("Markers become ::token and ::/token. Changing this does not update existing notes.").addText(
      (t) => t.setValue(this.plugin.settings.token).onChange(async (v) => {
        this.plugin.settings.token = v.trim() || "pf";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Output folder").setDesc("Player copies mirror your vault structure inside this folder. Publish only this folder.").addText(
      (t) => t.setValue(this.plugin.settings.outputFolder).onChange(async (v) => {
        this.plugin.settings.outputFolder = (v.trim() || "_player").replace(/\/+$/, "");
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Right-click menu").setDesc("Add player visibility actions to the editor context menu.").addToggle(
      (t) => t.setValue(this.plugin.settings.contextMenu).onChange(async (v) => {
        this.plugin.settings.contextMenu = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Auto-sync on save").setDesc("Regenerate a note's player copy whenever the note changes.").addToggle(
      (t) => t.setValue(this.plugin.settings.autoSync).onChange(async (v) => {
        this.plugin.settings.autoSync = v;
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/sync.ts
var import_obsidian3 = require("obsidian");
var isMarkdown = (f) => f.extension === "md";
function defaultPlayerPath(file, settings) {
  return (0, import_obsidian3.normalizePath)(`${settings.outputFolder}/${file.path}`);
}
var linkTarget = (path) => path.replace(/\.md$/, "");
var PlayerSync = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    /** source path -> has at least one ::pf region */
    this.regionCache = /* @__PURE__ */ new Map();
    /** copy path -> its pfn-source property */
    this.sourceCache = /* @__PURE__ */ new Map();
  }
  outPrefix() {
    return (0, import_obsidian3.normalizePath)(this.settings.outputFolder) + "/";
  }
  sourceFiles() {
    const out = this.outPrefix();
    return this.app.vault.getMarkdownFiles().filter((f) => !f.path.startsWith(out));
  }
  outputFiles() {
    const out = this.outPrefix();
    return this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(out));
  }
  cached(cache, f) {
    const c = cache.get(f.path);
    return c && c.mtime === f.stat.mtime && c.size === f.stat.size && c.token === this.settings.token ? c.value : void 0;
  }
  store(cache, f, value) {
    cache.set(f.path, {
      mtime: f.stat.mtime,
      size: f.stat.size,
      token: this.settings.token,
      value
    });
    return value;
  }
  async hasRegions(f) {
    const hit = this.cached(this.regionCache, f);
    if (hit !== void 0)
      return hit;
    const text = await this.app.vault.cachedRead(f);
    const lines = text.split("\n");
    return this.store(
      this.regionCache,
      f,
      isWholeNoteFlagged(lines) || findRegions(lines, this.settings.token).length > 0
    );
  }
  async pfnSourceOf(f) {
    const hit = this.cached(this.sourceCache, f);
    if (hit !== void 0)
      return hit;
    return this.store(this.sourceCache, f, readPfnSource(await this.app.vault.cachedRead(f)));
  }
  /** Drop cache entries for a path (rename/delete housekeeping). */
  forget(path) {
    this.regionCache.delete(path);
    this.sourceCache.delete(path);
  }
  /**
   * Index existing player copies by their pfn-source property. The user may
   * move/rename copies anywhere inside the output folder — we follow the
   * property, not the path. Output notes WITHOUT pfn-source are user-owned
   * and never touched.
   */
  async copyIndex() {
    const idx = /* @__PURE__ */ new Map();
    for (const f of this.outputFiles()) {
      const src = await this.pfnSourceOf(f);
      if (src && !idx.has(src))
        idx.set(src, f);
    }
    return idx;
  }
  /** Source paths with player content -> wikilink target of their copy. */
  async collectPlayerSet(files, copies) {
    const set = /* @__PURE__ */ new Map();
    for (const f of files) {
      if (await this.hasRegions(f)) {
        const existing = copies.get(f.path);
        set.set(
          f.path,
          linkTarget(existing ? existing.path : defaultPlayerPath(f, this.settings))
        );
      }
    }
    return set;
  }
  async ensureFolder(path) {
    const dir = path.split("/").slice(0, -1).join("/");
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir).catch(() => {
      });
    }
  }
  /**
   * Compose the full copy content. For an existing copy, every frontmatter
   * key the user added (aliases, cssclasses, banners, ...) is preserved;
   * only publish and pfn-source are normalized.
   */
  composeCopy(sourcePath, body, existingContent) {
    const userFm = [];
    if (existingContent) {
      const lines = existingContent.split("\n");
      const fm = frontmatterRange(lines);
      if (fm) {
        for (const l of lines.slice(1, fm[1] - 1)) {
          if (!/^(publish|pfn-source)\s*:/.test(l))
            userFm.push(l);
        }
      }
    }
    return [
      "---",
      "publish: true",
      `pfn-source: "${sourcePath}"`,
      ...userFm,
      "---",
      "",
      body,
      ""
    ].join("\n");
  }
  async writeCopy(file, playerSet, copies) {
    const text = await this.app.vault.cachedRead(file);
    const body = buildPlayerBody(text, {
      token: this.settings.token,
      resolveLink: (linkpath) => {
        const dest = this.app.metadataCache.getFirstLinkpathDest(linkpath, file.path);
        if (!dest)
          return void 0;
        if (!isMarkdown(dest))
          return void 0;
        return playerSet.get(dest.path) ?? null;
      }
    });
    const existing = copies.get(file.path) ?? null;
    if (body === null) {
      if (existing)
        await this.app.fileManager.trashFile(existing);
      return false;
    }
    if (existing) {
      const current = await this.app.vault.cachedRead(existing);
      const content2 = this.composeCopy(file.path, body, current);
      if (current !== content2)
        await this.app.vault.modify(existing, content2);
      return true;
    }
    const outPath = defaultPlayerPath(file, this.settings);
    const atPath = this.app.vault.getAbstractFileByPath(outPath);
    const content = this.composeCopy(file.path, body, null);
    if (atPath instanceof import_obsidian3.TFile) {
      await this.app.vault.modify(atPath, content);
    } else {
      await this.ensureFolder(outPath);
      await this.app.vault.create(outPath, content);
    }
    return true;
  }
  /** Sync a single file. */
  async syncFile(file) {
    const copies = await this.copyIndex();
    const playerSet = await this.collectPlayerSet(this.sourceFiles(), copies);
    const wrote = await this.writeCopy(file, playerSet, copies);
    const copy = copies.get(file.path);
    new import_obsidian3.Notice(
      wrote ? `Player copy updated: ${copy ? copy.path : defaultPlayerPath(file, this.settings)}` : "No player-facing content in this note."
    );
  }
  /** Sync the whole vault; prunes stale plugin-owned copies. */
  async syncVault() {
    const copies = await this.copyIndex();
    const files = this.sourceFiles();
    const playerSet = await this.collectPlayerSet(files, copies);
    let written = 0;
    for (const f of files) {
      if (playerSet.has(f.path) && await this.writeCopy(f, playerSet, copies))
        written++;
    }
    for (const [src, copy] of copies) {
      if (!playerSet.has(src)) {
        await this.app.fileManager.trashFile(copy).catch(() => {
        });
        this.forget(copy.path);
      }
    }
    new import_obsidian3.Notice(`Player sync complete: ${written} note(s) in ${this.settings.outputFolder}/`);
  }
  /** Keep a copy's pfn-source pointing at its source when the source moves. */
  async handleSourceRename(newFile, oldPath) {
    this.forget(oldPath);
    for (const copy of this.outputFiles()) {
      const content = await this.app.vault.cachedRead(copy);
      if (readPfnSource(content) === oldPath) {
        await this.app.vault.modify(
          copy,
          content.replace(/^pfn-source\s*:.*$/m, `pfn-source: "${newFile.path}"`)
        );
        this.forget(copy.path);
        return;
      }
    }
  }
};

// src/main.ts
var PlayerFacingNotesPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
  }
  async onload() {
    await this.loadSettings();
    this.sync = new PlayerSync(this.app, this.settings);
    this.addSettingTab(new PfnSettingTab(this.app, this));
    this.registerEditorExtension([
      pfnEditorExtension(() => this.settings.token),
      pfnGutter(() => this.settings.token)
    ]);
    this.registerMarkdownPostProcessor(
      (el) => stripMarkersFromRendered(el, this.settings.token)
    );
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        if (!this.settings.contextMenu)
          return;
        const token = this.settings.token;
        const lines = editor.getValue().split("\n");
        const cursorLine = editor.getCursor("from").line;
        const inRegion = !!regionContaining(findRegions(lines, token), cursorLine);
        if (inRegion) {
          menu.addItem(
            (item) => item.setTitle("Hide from players").setIcon("eye-off").setSection("pfn").onClick(() => this.applyPlan(editor, planToggle(lines, cursorLine, token)))
          );
        } else {
          const hasSelection = editor.somethingSelected();
          menu.addItem(
            (item) => item.setTitle(hasSelection ? "Show selection to players" : "Show block to players").setIcon("eye").setSection("pfn").onClick(() => {
              const ls = editor.getValue().split("\n");
              const plan = hasSelection ? planWrapRange(ls, editor.getCursor("from").line, editor.getCursor("to").line, token) : planToggle(ls, editor.getCursor("from").line, token);
              this.applyPlan(editor, plan);
            })
          );
        }
      })
    );
    this.addCommand({
      id: "toggle-player-facing",
      name: "Toggle player-facing on selection or block",
      editorCallback: (editor) => {
        const token = this.settings.token;
        const lines = editor.getValue().split("\n");
        const from = editor.getCursor("from").line;
        const to = editor.getCursor("to").line;
        const plan = editor.somethingSelected() && from !== to ? planWrapRange(lines, from, to, token) ?? planToggle(lines, from, token) : planToggle(lines, from, token);
        this.applyPlan(editor, plan);
      }
    });
    this.addCommand({
      id: "toggle-whole-note",
      name: "Toggle player-facing for entire note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md")
          return false;
        if (!checking) {
          void this.app.fileManager.processFrontMatter(file, (fm) => {
            if (fm.pfn)
              delete fm.pfn;
            else
              fm.pfn = true;
          });
        }
        return true;
      }
    });
    this.addCommand({
      id: "sync-current-note",
      name: "Sync player copy of current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md")
          return false;
        if (!checking)
          void this.sync.syncFile(file);
        return true;
      }
    });
    this.addCommand({
      id: "sync-vault",
      name: "Sync all player copies (whole vault)",
      callback: () => void this.sync.syncVault()
    });
    this.addRibbonIcon(
      "eye",
      "Sync player-facing notes",
      () => void this.sync.syncVault()
    );
    const autoSync = (0, import_obsidian4.debounce)(
      (file) => void this.sync.syncFile(file),
      2e3,
      true
    );
    this.registerEvent(
      this.app.vault.on("rename", (f, oldPath) => {
        if (f instanceof import_obsidian4.TFile && f.extension === "md" && !f.path.startsWith(this.settings.outputFolder + "/") && !oldPath.startsWith(this.settings.outputFolder + "/")) {
          void this.sync.handleSourceRename(f, oldPath);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        if (this.settings.autoSync && f instanceof import_obsidian4.TFile && f.extension === "md" && !f.path.startsWith(this.settings.outputFolder + "/")) {
          autoSync(f);
        }
      })
    );
  }
  /** Apply a wrap/unwrap plan through the Obsidian editor API. */
  applyPlan(editor, plan) {
    if (!plan)
      return;
    if (plan.kind === "unwrap") {
      if (plan.endLine !== null)
        this.deleteLine(editor, plan.endLine);
      this.deleteLine(editor, plan.startLine);
    } else {
      const endLineText = editor.getLine(plan.to);
      editor.replaceRange("\n" + plan.endMarker, { line: plan.to, ch: endLineText.length });
      editor.replaceRange(plan.startMarker + "\n", { line: plan.from, ch: 0 });
    }
  }
  deleteLine(editor, line) {
    const last = editor.lineCount() - 1;
    if (line < last) {
      editor.replaceRange("", { line, ch: 0 }, { line: line + 1, ch: 0 });
    } else {
      const prevLen = line > 0 ? editor.getLine(line - 1).length : 0;
      editor.replaceRange(
        "",
        line > 0 ? { line: line - 1, ch: prevLen } : { line, ch: 0 },
        { line, ch: editor.getLine(line).length }
      );
    }
  }
  async loadSettings() {
    Object.assign(this.settings, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
