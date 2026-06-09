import { App, Notice, TFile, normalizePath } from "obsidian";
import { buildPlayerCopy, findRegions } from "./parser";
import type { PfnSettings } from "./settings";

const isMarkdown = (f: TFile) => f.extension === "md";

function playerPathFor(file: TFile, settings: PfnSettings): string {
  return normalizePath(`${settings.outputFolder}/${file.path}`);
}

/** Path without .md extension, for wikilink targets. */
const linkTarget = (path: string) => path.replace(/\.md$/, "");

export class PlayerSync {
  constructor(private app: App, private settings: PfnSettings) {}

  private sourceFiles(): TFile[] {
    const out = normalizePath(this.settings.outputFolder) + "/";
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => !f.path.startsWith(out));
  }

  /** Set of source paths that contain at least one player-facing region. */
  private async collectPlayerSet(files: TFile[]): Promise<Map<string, string>> {
    const set = new Map<string, string>(); // source path -> player link target
    for (const f of files) {
      const text = await this.app.vault.cachedRead(f);
      if (findRegions(text.split("\n"), this.settings.token).length > 0) {
        set.set(f.path, linkTarget(playerPathFor(f, this.settings)));
      }
    }
    return set;
  }

  private async ensureFolder(path: string): Promise<void> {
    const dir = path.split("/").slice(0, -1).join("/");
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir).catch(() => {});
    }
  }

  private async writeCopy(
    file: TFile,
    playerSet: Map<string, string>
  ): Promise<boolean> {
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
          if (!dest) return undefined; // unresolved — leave alone
          if (!isMarkdown(dest)) return undefined; // attachment — leave alone
          return playerSet.get(dest.path) ?? null; // null = DM-only, flatten
        },
      },
      { "pfn-source": `"${file.path}"` }
    );

    const outPath = playerPathFor(file, this.settings);
    const existing = this.app.vault.getAbstractFileByPath(outPath);

    if (result.content === null) {
      // No player content: remove stale copy if present.
      if (existing instanceof TFile) await this.app.vault.delete(existing);
      return false;
    }

    if (existing instanceof TFile) {
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
  async syncFile(file: TFile): Promise<void> {
    const files = this.sourceFiles();
    const playerSet = await this.collectPlayerSet(files);
    const wrote = await this.writeCopy(file, playerSet);
    new Notice(
      wrote
        ? `Player copy updated: ${playerPathFor(file, this.settings)}`
        : "No player-facing content in this note."
    );
  }

  /** Sync the whole vault; prunes stale copies. */
  async syncVault(): Promise<void> {
    const files = this.sourceFiles();
    const playerSet = await this.collectPlayerSet(files);
    let written = 0;
    for (const f of files) {
      if (await this.writeCopy(f, playerSet)) written++;
    }
    // Prune player copies whose source no longer exists / has no regions.
    const out = normalizePath(this.settings.outputFolder) + "/";
    const validOutputs = new Set(
      [...playerSet.keys()].map((p) =>
        normalizePath(`${this.settings.outputFolder}/${p}`)
      )
    );
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.path.startsWith(out) && !validOutputs.has(f.path)) {
        await this.app.vault.delete(f);
      }
    }
    new Notice(`Player sync complete: ${written} note(s) in ${this.settings.outputFolder}/`);
  }
}
