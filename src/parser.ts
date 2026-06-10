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
      if (target === null) {
        // DM-only target: flatten to plain text so nothing leaks.
        return embed ? "" : alias ?? path.trim();
      }
      // Display the copy's (player-facing) name, not the DM-side note name —
      // the user may have renamed the copy in the player folder.
      const display = alias ?? target.split("/").pop()!;
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
 * Extract just the player-safe body (no frontmatter): content inside ::pf
 * regions, marker lines stripped, links rewritten. Null if no regions.
 */
export function buildPlayerBody(
  source: string,
  opts: ParserOptions
): string | null {
  const lines = source.split("\n");

  // Whole-note flag: everything after frontmatter is player-facing
  // (any stray region markers are stripped).
  if (isWholeNoteFlagged(lines)) {
    const fm = frontmatterRange(lines);
    // Replace marker lines with blanks (keeps paragraphs separated), then
    // collapse runs of blank lines.
    let body = lines
      .slice(fm ? fm[1] : 0)
      .map((l) => (markerRegex(opts.token).test(l) ? "" : l))
      .filter((l, i, arr) => !(l.trim() === "" && arr[i - 1]?.trim() === ""));
    while (body.length && body[0].trim() === "") body.shift();
    while (body.length && body[body.length - 1].trim() === "") body.pop();
    if (body.length === 0) return null;
    if (opts.resolveLink) body = body.map((l) => rewriteLinks(l, opts.resolveLink!));
    return body.join("\n");
  }

  const regions = findRegions(lines, opts.token);
  if (regions.length === 0) return null;

  const chunks: string[] = [];
  for (const r of regions) {
    const from = r.startLine + 1;
    const to = r.unclosed ? r.endLine + 1 : r.endLine;
    let chunk = lines.slice(from, to);
    // Trim leading/trailing blank lines inside the region.
    while (chunk.length && chunk[0].trim() === "") chunk.shift();
    while (chunk.length && chunk[chunk.length - 1].trim() === "") chunk.pop();
    if (chunk.length === 0) continue;
    if (opts.resolveLink) chunk = chunk.map((l) => rewriteLinks(l, opts.resolveLink!));
    chunks.push(chunk.join("\n"));
  }
  return chunks.join("\n\n");
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
  const body = buildPlayerBody(source, opts);
  if (body === null) return { content: null, regionCount: 0 };
  const regionCount = findRegions(source.split("\n"), opts.token).length;
  const fm = ["---", "publish: true"];
  for (const [k, v] of Object.entries(extraFrontmatter)) fm.push(`${k}: ${v}`);
  fm.push("---");
  return { content: fm.join("\n") + "\n\n" + body + "\n", regionCount };
}

/** True when the note's frontmatter flags the WHOLE note as player-facing. */
export function isWholeNoteFlagged(lines: string[]): boolean {
  const fm = frontmatterRange(lines);
  if (!fm) return false;
  for (let i = 1; i < fm[1] - 1; i++) {
    if (/^pfn\s*:\s*(true|yes)\s*$/i.test(lines[i])) return true;
  }
  return false;
}

/** Read the pfn-source property from a player copy's raw content. */
export function readPfnSource(content: string): string | null {
  const lines = content.split("\n");
  const fm = frontmatterRange(lines);
  if (!fm) return null;
  for (let i = 1; i < fm[1] - 1; i++) {
    const m = lines[i].match(/^pfn-source:\s*["']?(.*?)["']?\s*$/);
    if (m && m[1]) return m[1];
  }
  return null;
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

// ---------------------------------------------------------------------------
// Block detection & toggle planning (for gutter eyes / context menu)
// ---------------------------------------------------------------------------

export interface BlockRange {
  /** 0-based inclusive line range. */
  from: number;
  to: number;
}

const isBlockquote = (l: string) => /^\s{0,3}>/.test(l);
const isFenceDelim = (l: string) => /^\s{0,3}(```|~~~)/.test(l);
const blockquotePrefix = (l: string) =>
  l.match(/^((?:\s{0,3}>\s?)*)/)?.[1] ?? "";

/** Region containing the given line (markers inclusive), or null. */
export function regionContaining(
  regions: PfRegion[],
  line: number
): PfRegion | null {
  return regions.find((r) => line >= r.startLine && line <= r.endLine) ?? null;
}

/**
 * The block (paragraph, blockquote/callout run, fenced code, table, heading)
 * containing the given line. Returns null for blank lines, marker lines and
 * frontmatter. Blocks never cross marker lines.
 */
export function blockAt(
  lines: string[],
  idx: number,
  token: string
): BlockRange | null {
  if (idx < 0 || idx >= lines.length) return null;
  const fm = frontmatterRange(lines);
  const start = fm ? fm[1] : 0;
  if (idx < start) return null;
  const line = lines[idx];
  const isMarker = (l: string) => markerRegex(token).test(l);

  // Fenced code block? (checked first: blank/marker-looking lines inside a
  // fence are literal content and belong to the fence block)
  let fenceOpen = -1;
  let prevOpen = -1;
  for (let i = start; i <= idx; i++) {
    if (isFenceDelim(lines[i])) {
      prevOpen = fenceOpen;
      fenceOpen = fenceOpen === -1 ? i : -1;
    }
  }
  // idx on a closing delim: the fence it closes is prevOpen.
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

  if (line.trim() === "" || isMarker(line)) return null;

  // Heading: standalone block.
  if (/^\s{0,3}#{1,6}\s/.test(line)) return { from: idx, to: idx };

  // Blockquote / callout run.
  if (isBlockquote(line)) {
    let from = idx;
    let to = idx;
    while (from > start && isBlockquote(lines[from - 1]) && !isMarker(lines[from - 1])) from--;
    while (to < lines.length - 1 && isBlockquote(lines[to + 1]) && !isMarker(lines[to + 1])) to++;
    return { from, to };
  }

  // Paragraph / list / table: contiguous non-blank, non-marker, non-bq lines.
  const boundary = (l: string) =>
    l.trim() === "" || isMarker(l) || isBlockquote(l) || isFenceDelim(l) || /^\s{0,3}#{1,6}\s/.test(l);
  let from = idx;
  let to = idx;
  while (from > start && !boundary(lines[from - 1])) from--;
  while (to < lines.length - 1 && !boundary(lines[to + 1])) to++;
  return { from, to };
}

/**
 * Compute the marker lines for wrapping [from, to]. Markers go *outside* a
 * blockquote when the range starts/ends the quote run (so callout syntax is
 * preserved), and *inside* (prefixed) when the range is partial.
 */
export function markersFor(
  lines: string[],
  from: number,
  to: number,
  token: string
): { start: string; end: string } {
  let startPrefix = "";
  let endPrefix = "";
  if (isBlockquote(lines[from]) && from > 0 && isBlockquote(lines[from - 1]))
    startPrefix = blockquotePrefix(lines[from]);
  if (isBlockquote(lines[to]) && to < lines.length - 1 && isBlockquote(lines[to + 1]))
    endPrefix = blockquotePrefix(lines[to]);
  return { start: `${startPrefix}::${token}`, end: `${endPrefix}::/${token}` };
}

export type EditPlan =
  | {
      kind: "unwrap";
      /** Line index of the start marker. */
      startLine: number;
      /** Line index of the end marker, or null if the region is unclosed. */
      endLine: number | null;
    }
  | {
      kind: "wrap";
      from: number;
      to: number;
      startMarker: string;
      endMarker: string;
    }
  | null;

/** Plan a one-click toggle at the given line (gutter eye / block toggle). */
export function planToggle(
  lines: string[],
  idx: number,
  token: string
): EditPlan {
  const region = regionContaining(findRegions(lines, token), idx);
  if (region) {
    return {
      kind: "unwrap",
      startLine: region.startLine,
      endLine: region.unclosed ? null : region.endLine,
    };
  }
  const block = blockAt(lines, idx, token);
  if (!block) return null;
  const m = markersFor(lines, block.from, block.to, token);
  return { kind: "wrap", from: block.from, to: block.to, startMarker: m.start, endMarker: m.end };
}

/** Plan wrapping an explicit line range (selection). Null if it overlaps a region. */
export function planWrapRange(
  lines: string[],
  from: number,
  to: number,
  token: string
): EditPlan {
  // Trim blank edges.
  while (from < to && lines[from].trim() === "") from++;
  while (to > from && lines[to].trim() === "") to--;
  if (lines[from].trim() === "") return null;
  const regions = findRegions(lines, token);
  for (let i = from; i <= to; i++) {
    if (regionContaining(regions, i) || markerRegex(token).test(lines[i])) return null;
  }
  const m = markersFor(lines, from, to, token);
  return { kind: "wrap", from, to, startMarker: m.start, endMarker: m.end };
}
