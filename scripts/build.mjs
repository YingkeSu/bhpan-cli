import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

await fs.rm(distDir, { recursive: true, force: true });

await build({
  entryPoints: [path.join(rootDir, "src", "main.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  outfile: path.join(distDir, "main.js"),
  sourcemap: false,
  logLevel: "info",
});

await fs.chmod(path.join(distDir, "main.js"), 0o755);
