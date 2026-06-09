import { Editor, MarkdownView, Plugin, TFile, debounce } from "obsidian";
import { pfnEditorExtension, stripMarkersFromRendered } from "./editor";
import { isEndMarker, isStartMarker, wrapLines } from "./parser";
import { DEFAULT_SETTINGS, PfnSettings, PfnSettingTab } from "./settings";
import { PlayerSync } from "./sync";

export default class PlayerFacingNotesPlugin extends Plugin {
  settings: PfnSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new PfnSettingTab(this.app, this));

    // Live Preview decorations
    this.registerEditorExtension(pfnEditorExtension(() => this.settings.token));

    // Reading view: hide markers
    this.registerMarkdownPostProcessor((el) =>
      stripMarkersFromRendered(el, this.settings.token)
    );

    this.addCommand({
      id: "toggle-player-facing",
      name: "Toggle player-facing on selection",
      editorCallback: (editor) => this.toggleSelection(editor),
    });

    this.addCommand({
      id: "sync-current-note",
      name: "Sync player copy of current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void new PlayerSync(this.app, this.settings).syncFile(file);
        return true;
      },
    });

    this.addCommand({
      id: "sync-vault",
      name: "Sync all player copies (whole vault)",
      callback: () => void new PlayerSync(this.app, this.settings).syncVault(),
    });

    this.addRibbonIcon("eye", "Sync player-facing notes", () =>
      void new PlayerSync(this.app, this.settings).syncVault()
    );

    // Optional auto-sync of modified notes
    const autoSync = debounce(
      (file: TFile) => void new PlayerSync(this.app, this.settings).syncFile(file),
      2000,
      true
    );
    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        if (
          this.settings.autoSync &&
          f instanceof TFile &&
          f.extension === "md" &&
          !f.path.startsWith(this.settings.outputFolder + "/")
        ) {
          autoSync(f);
        }
      })
    );
  }

  /** Wrap selected lines in markers, or unwrap if the selection is already a region. */
  private toggleSelection(editor: Editor) {
    const token = this.settings.token;
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    let first = from.line;
    let last = to.line;
    // If the cursor sits on/inside an existing region boundary pair, unwrap it.
    const lineCount = editor.lineCount();
    let start = -1;
    for (let i = first; i >= 0; i--) {
      if (isEndMarker(editor.getLine(i), token) && i < first) break;
      if (isStartMarker(editor.getLine(i), token)) {
        start = i;
        break;
      }
    }
    if (start >= 0) {
      for (let j = Math.max(start + 1, last); j < lineCount; j++) {
        if (isStartMarker(editor.getLine(j), token) && j > start) break;
        if (isEndMarker(editor.getLine(j), token)) {
          // Unwrap: delete end marker line first, then start marker line.
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
    // Wrap: full lines of the selection.
    const lines: string[] = [];
    for (let i = first; i <= last; i++) lines.push(editor.getLine(i));
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
}
