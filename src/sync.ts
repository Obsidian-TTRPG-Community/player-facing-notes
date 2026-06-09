import { App, Notice, TFile, normalizePath } from "obsidian";
import { buildPlayerBody, findRegions, frontmatterRange, readPfnSource } from "./parser";
import type { PfnSettings } from "./settings";

const isMarkdown = (f: TFile) => f.extension === "md";

/** Default location for a brand-new copy: mirrors the vault structure. */
function defaultPlayerPath(file: TFile, settings: PfnSettings): string {
  return normalizePath(`${settings.outputFolder}/${file.path}`);
}

/** Path without .md extension, for wikilink targets. */
const linkTarget = (path: string) => path.replace(/\.md$/, "");

interface CacheEntry<T> {
  mtime: number;
  size: number;
  token: string;
  value: T;
}

/**
 * One long-lived instance per plugin. File-level facts (has regions /
 * pfn-source) are cached by mtime+size, so repeated syncs — especially
 * auto-sync on save — only re-read files that actually changed.
 */
export class PlayerSync {
  /** source path -> has at least one ::pf region */
  private regionCache = new Map<string, CacheEntry<boolean>>();
  /** copy path -> its pfn-source property */
  private sourceCache = new Map<string, CacheEntry<string | null>>();

  constructor(private app: App, private settings: PfnSettings) {}

  private outPrefix(): string {
    return normalizePath(this.settings.outputFolder) + "/";
  }

  private sourceFiles(): TFile[] {
    const out = this.outPrefix();
    return this.app.vault.getMarkdownFiles().filter((f) => !f.path.startsWith(out));
  }

  private outputFiles(): TFile[] {
    const out = this.outPrefix();
    return this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(out));
  }

  private cached<T>(cache: Map<string, CacheEntry<T>>, f: TFile): T | undefined {
    const c = cache.get(f.path);
    return c &&
      c.mtime === f.stat.mtime &&
      c.size === f.stat.size &&
      c.token === this.settings.token
      ? c.value
      : undefined;
  }

  private store<T>(cache: Map<string, CacheEntry<T>>, f: TFile, value: T): T {
    cache.set(f.path, {
      mtime: f.stat.mtime,
      size: f.stat.size,
      token: this.settings.token,
      value,
    });
    return value;
  }

  private async hasRegions(f: TFile): Promise<boolean> {
    const hit = this.cached(this.regionCache, f);
    if (hit !== undefined) return hit;
    const text = await this.app.vault.cachedRead(f);
    return this.store(
      this.regionCache,
      f,
      findRegions(text.split("\n"), this.settings.token).length > 0
    );
  }

  private async pfnSourceOf(f: TFile): Promise<string | null> {
    const hit = this.cached(this.sourceCache, f);
    if (hit !== undefined) return hit;
    return this.store(this.sourceCache, f, readPfnSource(await this.app.vault.cachedRead(f)));
  }

  /** Drop cache entries for a path (rename/delete housekeeping). */
  forget(path: string): void {
    this.regionCache.delete(path);
    this.sourceCache.delete(path);
  }

  /**
   * Index existing player copies by their pfn-source property. The user may
   * move/rename copies anywhere inside the output folder — we follow the
   * property, not the path. Output notes WITHOUT pfn-source are user-owned
   * and never touched.
   */
  private async copyIndex(): Promise<Map<string, TFile>> {
    const idx = new Map<string, TFile>();
    for (const f of this.outputFiles()) {
      const src = await this.pfnSourceOf(f);
      if (src && !idx.has(src)) idx.set(src, f);
    }
    return idx;
  }

  /** Source paths with player content -> wikilink target of their copy. */
  private async collectPlayerSet(
    files: TFile[],
    copies: Map<string, TFile>
  ): Promise<Map<string, string>> {
    const set = new Map<string, string>();
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

  private async ensureFolder(path: string): Promise<void> {
    const dir = path.split("/").slice(0, -1).join("/");
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir).catch(() => {});
    }
  }

  /**
   * Compose the full copy content. For an existing copy, every frontmatter
   * key the user added (aliases, cssclasses, banners, ...) is preserved;
   * only publish and pfn-source are normalized.
   */
  private composeCopy(sourcePath: string, body: string, existingContent: string | null): string {
    const userFm: string[] = [];
    if (existingContent) {
      const lines = existingContent.split("\n");
      const fm = frontmatterRange(lines);
      if (fm) {
        for (const l of lines.slice(1, fm[1] - 1)) {
          if (!/^(publish|pfn-source)\s*:/.test(l)) userFm.push(l);
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
      "",
    ].join("\n");
  }

  private async writeCopy(
    file: TFile,
    playerSet: Map<string, string>,
    copies: Map<string, TFile>
  ): Promise<boolean> {
    const text = await this.app.vault.cachedRead(file);
    const body = buildPlayerBody(text, {
      token: this.settings.token,
      resolveLink: (linkpath) => {
        const dest = this.app.metadataCache.getFirstLinkpathDest(linkpath, file.path);
        if (!dest) return undefined; // unresolved — leave alone
        if (!isMarkdown(dest)) return undefined; // attachment — leave alone
        return playerSet.get(dest.path) ?? null; // null = DM-only, flatten
      },
    });

    const existing = copies.get(file.path) ?? null;

    if (body === null) {
      // No player content: remove the plugin-owned copy if present.
      if (existing) await this.app.vault.delete(existing);
      return false;
    }

    if (existing) {
      // Update in place — wherever the user moved/renamed it.
      const current = await this.app.vault.cachedRead(existing);
      const content = this.composeCopy(file.path, body, current);
      if (current !== content) await this.app.vault.modify(existing, content);
      return true;
    }

    // New copy at the default mirrored location.
    const outPath = defaultPlayerPath(file, this.settings);
    const atPath = this.app.vault.getAbstractFileByPath(outPath);
    const content = this.composeCopy(file.path, body, null);
    if (atPath instanceof TFile) {
      await this.app.vault.modify(atPath, content);
    } else {
      await this.ensureFolder(outPath);
      await this.app.vault.create(outPath, content);
    }
    return true;
  }

  /** Sync a single file. */
  async syncFile(file: TFile): Promise<void> {
    const copies = await this.copyIndex();
    const playerSet = await this.collectPlayerSet(this.sourceFiles(), copies);
    const wrote = await this.writeCopy(file, playerSet, copies);
    const copy = copies.get(file.path);
    new Notice(
      wrote
        ? `Player copy updated: ${copy ? copy.path : defaultPlayerPath(file, this.settings)}`
        : "No player-facing content in this note."
    );
  }

  /** Sync the whole vault; prunes stale plugin-owned copies. */
  async syncVault(): Promise<void> {
    const copies = await this.copyIndex();
    const files = this.sourceFiles();
    const playerSet = await this.collectPlayerSet(files, copies);
    let written = 0;
    // Only files with player content need writing; stale copies are pruned below.
    for (const f of files) {
      if (playerSet.has(f.path) && (await this.writeCopy(f, playerSet, copies))) written++;
    }
    // Prune copies whose source was deleted or no longer has regions.
    // Only files WITH pfn-source are plugin-owned; everything else is left alone.
    for (const [src, copy] of copies) {
      if (!playerSet.has(src)) {
        await this.app.vault.delete(copy).catch(() => {});
        this.forget(copy.path);
      }
    }
    new Notice(`Player sync complete: ${written} note(s) in ${this.settings.outputFolder}/`);
  }

  /** Keep a copy's pfn-source pointing at its source when the source moves. */
  async handleSourceRename(newFile: TFile, oldPath: string): Promise<void> {
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
}
