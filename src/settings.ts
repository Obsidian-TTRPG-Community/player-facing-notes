import { App, PluginSettingTab, Setting } from "obsidian";
import type PlayerFacingNotesPlugin from "./main";

export interface PfnSettings {
  /** Marker token: markers are `::<token>` and `::/<token>`. */
  token: string;
  /** Mirror folder for generated player copies. */
  outputFolder: string;
  /** Re-generate the player copy automatically when a flagged note is saved. */
  autoSync: boolean;
  /** Show the player-facing items in the editor right-click menu. */
  contextMenu: boolean;
}

export const DEFAULT_SETTINGS: PfnSettings = {
  token: "pf",
  outputFolder: "_player",
  autoSync: false,
  contextMenu: true,
};

export class PfnSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: PlayerFacingNotesPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Marker token")
      .setDesc("Markers become ::token and ::/token. Changing this does not update existing notes.")
      .addText((t) =>
        t.setValue(this.plugin.settings.token).onChange(async (v) => {
          this.plugin.settings.token = v.trim() || "pf";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Output folder")
      .setDesc("Player copies mirror your vault structure inside this folder. Publish only this folder.")
      .addText((t) =>
        t.setValue(this.plugin.settings.outputFolder).onChange(async (v) => {
          this.plugin.settings.outputFolder = (v.trim() || "_player").replace(/\/+$/, "");
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Right-click menu")
      .setDesc("Add player visibility actions to the editor context menu.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.contextMenu).onChange(async (v) => {
          this.plugin.settings.contextMenu = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Auto-sync on save")
      .setDesc("Regenerate a note's player copy whenever the note changes.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoSync).onChange(async (v) => {
          this.plugin.settings.autoSync = v;
          await this.plugin.saveSettings();
        })
      );
  }
}
