import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(
  root,
  "node_modules/signalsmith-stretch/SignalsmithStretch.mjs",
);
const destDir = join(root, "public/vendor");
const dest = join(destDir, "SignalsmithStretch.mjs");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`Copied signalsmith-stretch → ${dest}`);
