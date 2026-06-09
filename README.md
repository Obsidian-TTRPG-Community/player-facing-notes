# Player Facing Notes

An Obsidian plugin for Dungeon Masters. Flag blocks of any note as **player-facing**, then publish *only those blocks* to your players via Obsidian Publish. DM-only text never leaves your vault.

## How it works

1. **Flag content.** Select lines and run **Toggle player-facing on selection** (command palette or hotkey). The plugin wraps the selection in lightweight markers:

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
