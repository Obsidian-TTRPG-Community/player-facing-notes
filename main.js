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
var import_obsidian3 = require("obsidian");

// src/editor.ts
var import_view = require("@codemirror/view");

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
      const display = alias ?? path.trim();
      if (target === null) {
        return embed ? "" : display;
      }
      return `${embed}[[${target}${hash ?? ""}|${display}]]`;
    }
  );
}
function buildPlayerCopy(source, opts, extraFrontmatter = {}) {
  const lines = source.split("\n");
  const regions = findRegions(lines, opts.token);
  if (regions.length === 0)
    return { content: null, regionCount: 0 };
  const out = [];
  out.push("---");
  out.push("publish: true");
  for (const [k, v] of Object.entries(extraFrontmatter))
    out.push(`${k}: ${v}`);
  out.push("---");
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
    out.push("");
    out.push(...chunk);
  }
  out.push("");
  return { content: out.join("\n"), regionCount: regions.length };
}
function wrapLines(lines, token) {
  const prefix = (lines.find((l) => l.trim() !== "") ?? "").match(/^((?:\s{0,3}>\s?)*)/)?.[1] ?? "";
  return [`${prefix}::${token}`, ...lines, `${prefix}::/${token}`];
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
    const el = document.createElement("span");
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
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const toClean = [];
      let t;
      while (t = walker.nextNode()) {
        if (re.test((t.textContent ?? "").trim()))
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
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  token: "pf",
  outputFolder: "_player",
  autoSync: false
};
var PfnSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Marker token").setDesc("Markers become ::token and ::/token. Changing this does not update existing notes.").addText(
      (t) => t.setValue(this.plugin.settings.token).onChange(async (v) => {
        this.plugin.settings.token = v.trim() || "pf";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Output folder").setDesc("Player copies mirror your vault structure inside this folder. Publish only this folder.").addText(
      (t) => t.setValue(this.plugin.settings.outputFolder).onChange(async (v) => {
        this.plugin.settings.outputFolder = (v.trim() || "_player").replace(/\/+$/, "");
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Auto-sync on save").setDesc("Regenerate a note's player copy whenever the note changes.").addToggle(
      (t) => t.setValue(this.plugin.settings.autoSync).onChange(async (v) => {
        this.plugin.settings.autoSync = v;
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/sync.ts
var import_obsidian2 = require("obsidian");
var isMarkdown = (f) => f.extension === "md";
function playerPathFor(file, settings) {
  return (0, import_obsidian2.normalizePath)(`${settings.outputFolder}/${file.path}`);
}
var linkTarget = (path) => path.replace(/\.md$/, "");
var PlayerSync = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
  }
  sourceFiles() {
    const out = (0, import_obsidian2.normalizePath)(this.settings.outputFolder) + "/";
    return this.app.vault.getMarkdownFiles().filter((f) => !f.path.startsWith(out));
  }
  /** Set of source paths that contain at least one player-facing region. */
  async collectPlayerSet(files) {
    const set = /* @__PURE__ */ new Map();
    for (const f of files) {
      const text = await this.app.vault.cachedRead(f);
      if (findRegions(text.split("\n"), this.settings.token).length > 0) {
        set.set(f.path, linkTarget(playerPathFor(f, this.settings)));
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
  async writeCopy(file, playerSet) {
    const text = await this.app.vault.cachedRead(file);
    const result = buildPlayerCopy(
      text,
      {
        token: this.settings.token,
        resolveLink: (linkpath) => {
          const dest = this.app.metadataCache.getFirstLinkpathDest(
            linkpath,
            file.path
          );
          if (!dest)
            return void 0;
          if (!isMarkdown(dest))
            return void 0;
          return playerSet.get(dest.path) ?? null;
        }
      },
      { "pfn-source": `"${file.path}"` }
    );
    const outPath = playerPathFor(file, this.settings);
    const existing = this.app.vault.getAbstractFileByPath(outPath);
    if (result.content === null) {
      if (existing instanceof import_obsidian2.TFile)
        await this.app.vault.delete(existing);
      return false;
    }
    if (existing instanceof import_obsidian2.TFile) {
      const current = await this.app.vault.cachedRead(existing);
      if (current !== result.content)
        await this.app.vault.modify(existing, result.content);
    } else {
      await this.ensureFolder(outPath);
      await this.app.vault.create(outPath, result.content);
    }
    return true;
  }
  /** Sync a single file. */
  async syncFile(file) {
    const files = this.sourceFiles();
    const playerSet = await this.collectPlayerSet(files);
    const wrote = await this.writeCopy(file, playerSet);
    new import_obsidian2.Notice(
      wrote ? `Player copy updated: ${playerPathFor(file, this.settings)}` : "No player-facing content in this note."
    );
  }
  /** Sync the whole vault; prunes stale copies. */
  async syncVault() {
    const files = this.sourceFiles();
    const playerSet = await this.collectPlayerSet(files);
    let written = 0;
    for (const f of files) {
      if (await this.writeCopy(f, playerSet))
        written++;
    }
    const out = (0, import_obsidian2.normalizePath)(this.settings.outputFolder) + "/";
    const validOutputs = new Set(
      [...playerSet.keys()].map(
        (p) => (0, import_obsidian2.normalizePath)(`${this.settings.outputFolder}/${p}`)
      )
    );
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.path.startsWith(out) && !validOutputs.has(f.path)) {
        await this.app.vault.delete(f);
      }
    }
    new import_obsidian2.Notice(`Player sync complete: ${written} note(s) in ${this.settings.outputFolder}/`);
  }
};

// src/main.ts
var PlayerFacingNotesPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new PfnSettingTab(this.app, this));
    this.registerEditorExtension(pfnEditorExtension(() => this.settings.token));
    this.registerMarkdownPostProcessor(
      (el) => stripMarkersFromRendered(el, this.settings.token)
    );
    this.addCommand({
      id: "toggle-player-facing",
      name: "Toggle player-facing on selection",
      editorCallback: (editor) => this.toggleSelection(editor)
    });
    this.addCommand({
      id: "sync-current-note",
      name: "Sync player copy of current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md")
          return false;
        if (!checking)
          void new PlayerSync(this.app, this.settings).syncFile(file);
        return true;
      }
    });
    this.addCommand({
      id: "sync-vault",
      name: "Sync all player copies (whole vault)",
      callback: () => void new PlayerSync(this.app, this.settings).syncVault()
    });
    this.addRibbonIcon(
      "eye",
      "Sync player-facing notes",
      () => void new PlayerSync(this.app, this.settings).syncVault()
    );
    const autoSync = (0, import_obsidian3.debounce)(
      (file) => void new PlayerSync(this.app, this.settings).syncFile(file),
      2e3,
      true
    );
    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        if (this.settings.autoSync && f instanceof import_obsidian3.TFile && f.extension === "md" && !f.path.startsWith(this.settings.outputFolder + "/")) {
          autoSync(f);
        }
      })
    );
  }
  /** Wrap selected lines in markers, or unwrap if the selection is already a region. */
  toggleSelection(editor) {
    const token = this.settings.token;
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    let first = from.line;
    let last = to.line;
    const lineCount = editor.lineCount();
    let start = -1;
    for (let i = first; i >= 0; i--) {
      if (isEndMarker(editor.getLine(i), token) && i < first)
        break;
      if (isStartMarker(editor.getLine(i), token)) {
        start = i;
        break;
      }
    }
    if (start >= 0) {
      for (let j = Math.max(start + 1, last); j < lineCount; j++) {
        if (isStartMarker(editor.getLine(j), token) && j > start)
          break;
        if (isEndMarker(editor.getLine(j), token)) {
          editor.replaceRange(
            "",
            { line: j, ch: 0 },
            { line: j + 1, ch: 0 }
          );
          editor.replaceRange(
            "",
            { line: start, ch: 0 },
            { line: start + 1, ch: 0 }
          );
          return;
        }
      }
    }
    const lines = [];
    for (let i = first; i <= last; i++)
      lines.push(editor.getLine(i));
    const wrapped = wrapLines(lines, token).join("\n");
    editor.replaceRange(
      wrapped + "\n",
      { line: first, ch: 0 },
      { line: last + 1, ch: 0 }
    );
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
