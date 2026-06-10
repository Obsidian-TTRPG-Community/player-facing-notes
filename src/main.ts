import { Editor, Menu, Plugin, TFile, debounce } from "obsidian";
import { pfnEditorExtension, pfnGutter, stripMarkersFromRendered } from "./editor";
import { EditPlan, findRegions, planToggle, planWrapRange, regionContaining } from "./parser";
import { DEFAULT_SETTINGS, PfnSettings, PfnSettingTab } from "./settings";
import { PlayerSync } from "./sync";

export default class PlayerFacingNotesPlugin extends Plugin {
  settings: PfnSettings = { ...DEFAULT_SETTINGS };
  sync!: PlayerSync;

  async onload() {
    await this.loadSettings();
    this.sync = new PlayerSync(this.app, this.settings);
    this.addSettingTab(new PfnSettingTab(this.app, this));

    // Live Preview decorations + eye gutter
    this.registerEditorExtension([
      pfnEditorExtension(() => this.settings.token),
      pfnGutter(() => this.settings.token),
    ]);

    // Reading view: hide markers
    this.registerMarkdownPostProcessor((el) =>
      stripMarkersFromRendered(el, this.settings.token)
    );

    // Right-click menu
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor) => {
        if (!this.settings.contextMenu) return;
        const token = this.settings.token;
        const lines = editor.getValue().split("\n");
        const cursorLine = editor.getCursor("from").line;
        const inRegion = !!regionContaining(findRegions(lines, token), cursorLine);

        if (inRegion) {
          menu.addItem((item) =>
            item
              .setTitle("Hide from players")
              .setIcon("eye-off")
              .setSection("pfn")
              .onClick(() => this.applyPlan(editor, planToggle(lines, cursorLine, token)))
          );
        } else {
          const hasSelection = editor.somethingSelected();
          menu.addItem((item) =>
            item
              .setTitle(hasSelection ? "Show selection to players" : "Show block to players")
              .setIcon("eye")
              .setSection("pfn")
              .onClick(() => {
                const ls = editor.getValue().split("\n");
                const plan = hasSelection
                  ? planWrapRange(ls, editor.getCursor("from").line, editor.getCursor("to").line, token)
                  : planToggle(ls, editor.getCursor("from").line, token);
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
        const plan =
          editor.somethingSelected() && from !== to
            ? planWrapRange(lines, from, to, token) ?? planToggle(lines, from, token)
            : planToggle(lines, from, token);
        this.applyPlan(editor, plan);
      },
    });

    this.addCommand({
      id: "toggle-whole-note",
      name: "Toggle player-facing for entire note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          void this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            if (fm.pfn) delete fm.pfn;
            else fm.pfn = true;
          });
        }
        return true;
      },
    });

    this.addCommand({
      id: "sync-current-note",
      name: "Sync player copy of current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.sync.syncFile(file);
        return true;
      },
    });

    this.addCommand({
      id: "sync-vault",
      name: "Sync all player copies (whole vault)",
      callback: () => void this.sync.syncVault(),
    });

    this.addRibbonIcon("eye", "Sync player-facing notes", () =>
      void this.sync.syncVault()
    );

    // Optional auto-sync of modified notes
    const autoSync = debounce(
      (file: TFile) => void this.sync.syncFile(file),
      2000,
      true
    );
    // Keep copies attached when a source note is moved/renamed, so the
    // user's custom layout inside the player folder survives.
    this.registerEvent(
      this.app.vault.on("rename", (f, oldPath) => {
        if (
          f instanceof TFile &&
          f.extension === "md" &&
          !f.path.startsWith(this.settings.outputFolder + "/") &&
          !oldPath.startsWith(this.settings.outputFolder + "/")
        ) {
          void this.sync.handleSourceRename(f, oldPath);
        }
      })
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

  /** Apply a wrap/unwrap plan through the Obsidian editor API. */
  private applyPlan(editor: Editor, plan: EditPlan) {
    if (!plan) return;
    if (plan.kind === "unwrap") {
      // Delete the end marker line first so start indices stay valid.
      if (plan.endLine !== null) this.deleteLine(editor, plan.endLine);
      this.deleteLine(editor, plan.startLine);
    } else {
      // Insert end marker first so the start insertion doesn't shift indices.
      const endLineText = editor.getLine(plan.to);
      editor.replaceRange("\n" + plan.endMarker, { line: plan.to, ch: endLineText.length });
      editor.replaceRange(plan.startMarker + "\n", { line: plan.from, ch: 0 });
    }
  }

  private deleteLine(editor: Editor, line: number) {
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
    // Mutate in place: PlayerSync holds a reference to this object.
    Object.assign(this.settings, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
