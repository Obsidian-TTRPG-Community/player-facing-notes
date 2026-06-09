/**
 * Pure parsing logic for Player Facing Notes.
 * No Obsidian imports — fully unit-testable in Node.
 *
 * Markers are standalone lines (optionally inside blockquotes/callouts):
 *   ::pf      — start of a player-facing region
 *   ::/pf     — end of a player-facing region
 */

export interface ParserOptions {
  /** Marker token, default "pf" (markers are `::pf` / `::/pf`). */
  token: string;
  /**
   * Resolve a wikilink path found in player content.
   * Return the rewritten link target (player-copy path, no extension) if the
   * target note has player content, null if it does not (link should be
   * flattened to plain text), or undefined to leave the link untouched
   * (e.g. attachments, unresolvable links).
   */
  resolveLink?: (linkpath: string) => string | null | undefined;
}

export interface PfRegion {
  /** 0-based line index of the start marker line. */
  startLine: number;
  /** 0-based line index of the end marker line (or last line if unclosed). */
  endLine: number;
  /** True when the region was never explicitly closed. */
  unclosed: boolean;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches a marker line: optional blockquote prefix, then ::pf or ::/pf */
export function markerRegex(token: string): RegExp {
  const t = escapeRe(token);
  return new RegExp(`^((?:\\s{0,3}>\\s?)*)::(\\/?)${t}\\s*$`);
}

export function isStartMarker(line: string, token: string): boolean {
  const m = line.match(markerRegex(token));
  return !!m && m[2] === "";
}

export function isEndMarker(line: string, token: string): boolean {
  const m = line.match(markerRegex(token));
  return !!m && m[2] === "/";
}

/** Returns the [start, end) line range of YAML frontmatter, or null. */
export function frontmatterRange(lines: string[]): [number, number] | null {
  if (lines[0]?.trim() !== "---") return null;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "---" || t === "...") return [0, i + 1];
  }
  return null;
}

/** Find all player-facing regions in the document. Regions do not nest. */
export function findRegions(lines: string[], token: string): PfRegion[] {
  const regions: PfRegion[] = [];
  const fm = frontmatterRange(lines);
  let i = fm ? fm[1] : 0;
  let open: number | null = null;
  for (; i < lines.length; i++) {
    if (open === null) {
      if (isStartMarker(lines[i], token)) open = i;
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

/** Rewrite wikilinks/embeds in a player-content line. */
export function rewriteLinks(
  line: string,
  resolveLink: NonNullable<ParserOptions["resolveLink"]>
): string {
  // [[path]], [[path|alias]], ![[path]], ![[path#heading|alias]]
  return line.replace(
    /(!?)\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g,
    (full, embed: string, path: string, hash: string | undefined, alias: string | undefined) => {
      const target = resolveLink(path.trim());
      if (target === undefined) return full; // leave untouched
      const display = alias ?? path.trim();
      if (target === null) {
        // DM-only target: flatten to plain text so nothing leaks.
        return embed ? "" : display;
      }
      return `${embed}[[${target}${hash ?? ""}|${display}]]`;
    }
  );
}

export interface PlayerCopyResult {
  /** Player-safe markdown (with frontmatter), or null if no regions found. */
  content: string | null;
  regionCount: number;
}

/**
 * Build the player-safe version of a note: only content inside ::pf regions,
 * marker lines stripped, links rewritten, fresh frontmatter.
 */
export function buildPlayerCopy(
  source: string,
  opts: ParserOptions,
  extraFrontmatter: Record<string, string> = {}
): PlayerCopyResult {
  const lines = source.split("\n");
  const regions = findRegions(lines, opts.token);
  if (regions.length === 0) return { content: null, regionCount: 0 };

  const out: string[] = [];
  out.push("---");
  out.push("publish: true");
  for (const [k, v] of Object.entries(extraFrontmatter)) out.push(`${k}: ${v}`);
  out.push("---");

  for (const r of regions) {
    const from = r.startLine + 1;
    const to = r.unclosed ? r.endLine + 1 : r.endLine;
    let chunk = lines.slice(from, to);
    // Trim leading/trailing blank lines inside the region.
    while (chunk.length && chunk[0].trim() === "") chunk.shift();
    while (chunk.length && chunk[chunk.length - 1].trim() === "") chunk.pop();
    if (chunk.length === 0) continue;
    if (opts.resolveLink) chunk = chunk.map((l) => rewriteLinks(l, opts.resolveLink!));
    out.push("");
    out.push(...chunk);
  }

  out.push("");
  return { content: out.join("\n"), regionCount: regions.length };
}

/**
 * Toggle helper: wrap the given full-line range in markers, matching the
 * blockquote prefix of the first line (so it works inside callouts).
 * Returns the replacement text for that range.
 */
export function wrapLines(lines: string[], token: string): string[] {
  const prefix = (lines.find((l) => l.trim() !== "") ?? "").match(/^((?:\s{0,3}>\s?)*)/)?.[1] ?? "";
  return [`${prefix}::${token}`, ...lines, `${prefix}::/${token}`];
}
