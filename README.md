# Player Facing Notes

An Obsidian plugin for Dungeon Masters. Flag blocks of any note as **player-facing**, then publish *only those blocks* to your players via Obsidian Publish. DM-only text never leaves your vault.

## How it works

1. **Flag content.** Three ways, no syntax to remember:
   - **Gutter eyes** — hover the left gutter: a closed eye appears at each block. Click it and the whole block (paragraph, callout, code fence, heading) becomes player-facing; the eye opens and stays cyan. Click an open eye to revoke.
   - **Right-click** — *Show block/selection to players* or *Hide from players*.
   - **Command palette** — *Toggle player-facing on selection or block* (assignable to a hotkey).

   Under the hood the plugin wraps content in lightweight markers:

   ```
   ::pf
   > [!quote] The note reads
   > Dear Friends, my name is Azumi...
   ::/pf
   ```

   Markers are standalone lines, so they wrap anything — callouts, nested callouts, tables, code blocks. They also work *inside* a callout (`> ::pf`) to flag part of one.

2. **Markers stay invisible.** In Live Preview they render as small "player-facing" pills with a tinted left border on the region (Realm Works style). In Reading view they're stripped entirely. Only Source mode shows raw markers.

3. **Sync.** Run **Sync all player copies** (ribbon eye icon or command palette). For each note with flagged content, the plugin writes a clean copy — flagged blocks only, markers stripped, `publish: true` — into a mirror folder (default `_player/`), preserving your folder structure. Stale copies are pruned automatically. Optional auto-sync on save in settings.

4. **Publish.** In Obsidian Publish, publish only the `_player/` folder. Your master notes keep `publish: false` (or simply never get selected). Because filtering happens *before* upload, players cannot recover DM text from page source — unlike CSS/publish.js hiding, which only hides content client-side.

## Rearranging the player folder

Player copies are tracked by the `pfn-source` property in their frontmatter, **not by their path**. Move or rename copies anywhere inside the player folder — build whatever structure your players should see — and future syncs update them in place. New copies start at the mirrored location; after that, layout is yours.

- Frontmatter you add to a copy (aliases, cssclasses, banners, ...) survives syncs; only `publish` and `pfn-source` are managed.
- Notes you create inside the player folder *without* `pfn-source` are never touched or pruned — handy for player-only index pages.
- Moving or renaming a *source* note updates its copy's `pfn-source` automatically, so your layout survives vault reorganizations.
- Wikilinks in copies always point at the copy's current location.
- **Rename copies with Obsidian's normal rename** (click the title or F2). The `pfn-source` property is the sync connection, so the new name sticks — and links in other player notes display the copy's player-facing name, never the original DM-side note name (unless you wrote an explicit alias).

## Link handling

Inside player copies, wikilinks are rewritten:

- Link to a note that has player content → rewritten to its `_player/` copy (display text preserved, `#heading` anchors kept).
- Link to a DM-only note → flattened to plain text, so the link target's existence doesn't leak.
- Attachments and unresolved links → left untouched (remember to also publish referenced images).

## Settings

- **Marker token** — default `pf`; markers are `::pf` / `::/pf`.
- **Output folder** — default `_player`.
- **Auto-sync on save** — regenerate a note's player copy on every change.

## Tips

- When flagging part of a callout, include the callout title line (`> [!note] ...`) in the region so it renders as a callout for players.
- A `pfn-source` frontmatter key in each player copy points back at the original note.
- An unclosed `::pf` flags everything to the end of the note.

## Development

```
npm install
npm run build    # production build -> main.js
npm run dev      # watch mode
npm test         # parser unit tests
```

Install by copying `manifest.json`, `main.js`, and `styles.css` into `<vault>/.obsidian/plugins/player-facing-notes/`.
