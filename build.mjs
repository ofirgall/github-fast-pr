import { build } from "esbuild";
import { rmSync, mkdirSync, copyFileSync } from "node:fs";

// --release: minified, no source maps (for the packaged zip).
const release = process.argv.includes("--release");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: {
    "data-hook": "src/data-hook.ts",
    "settings-sync": "src/settings-sync.ts",
    content: "src/content.ts",
    popup: "src/popup/popup.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: release,
  sourcemap: release ? false : "inline",
  logLevel: "info",
});

copyFileSync("manifest.json", "dist/manifest.json");
copyFileSync("src/styles.css", "dist/styles.css");
copyFileSync("src/popup/popup.html", "dist/popup.html");
copyFileSync("src/popup/popup.css", "dist/popup.css");
