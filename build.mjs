import { build } from "esbuild";
import { rmSync, mkdirSync, copyFileSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: { "data-hook": "src/data-hook.ts", content: "src/content.ts" },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: false,
  sourcemap: "inline",
  logLevel: "info",
});

copyFileSync("manifest.json", "dist/manifest.json");
copyFileSync("src/styles.css", "dist/styles.css");
