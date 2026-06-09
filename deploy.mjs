// Copies the built plugin into the test vault.
// Usage: npm run deploy            (uses default vault below)
//        npm run deploy -- "C:\\path\\to\\OtherVault"
import { cpSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const DEFAULT_VAULT = "D:\\Obsidian\\Obsidian5eVault";
const vault = process.argv[2] ?? DEFAULT_VAULT;
const dest = join(vault, ".obsidian", "plugins", "player-facing-notes");

if (!existsSync(join(vault, ".obsidian"))) {
  console.error(`Not an Obsidian vault: ${vault}`);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) {
  cpSync(f, join(dest, f));
  console.log(`copied ${f} -> ${dest}`);
}
console.log("Done. Reload Obsidian (Ctrl+R) or toggle the plugin to pick up changes.");
