# Releasing

## One-time setup

```bash
git remote add origin https://github.com/<your-username>/player-facing-notes.git
git push -u origin main
```

## Each release

1. Bump the version (updates package.json, manifest.json, versions.json together):

   ```bash
   npm version patch   # or minor / major
   git push
   ```

2. Tag and push — the tag must be the bare version, no "v" prefix:

   ```bash
   git tag 1.1.1
   git push origin 1.1.1
   ```

   The GitHub Action builds the plugin and creates a **draft** release named
   `1.1.1` with `main.js`, `manifest.json`, and `styles.css` attached.

3. On GitHub: Releases → edit the draft → add release notes → **Publish**.

## First-time directory submission

After the 1.1.1 release is published:

1. Fork <https://github.com/obsidianmd/obsidian-releases>.
2. Add an entry to the END of `community-plugins.json`:

   ```json
   {
     "id": "player-facing-notes",
     "name": "Player Facing Notes",
     "author": "Josh Plunkett",
     "description": "Selectively publish parts of your notes. Flag blocks as public, then sync them into publish-ready copies, keeping secrets, drafts, and private content out of your published site.",
     "repo": "<your-username>/player-facing-notes"
   }
   ```

   id, name, and description must match manifest.json exactly.

3. Open a PR using their template and complete the checklist. The automated
   review usually reports within minutes; after fixes, push to your repo and
   it rescans within ~6 hours.

## Pre-flight checks

```bash
npm test        # parser unit tests
npm run lint    # official Obsidian ESLint rules (eslint-plugin-obsidianmd)
npm run build   # production main.js
```
