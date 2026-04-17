import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const rel of [".next", path.join("node_modules", ".cache")]) {
  const target = path.join(root, rel);
  try {
    fs.rmSync(target, { recursive: true, force: true });
    console.log("removed", rel);
  } catch (e) {
    console.warn("skip", rel, e instanceof Error ? e.message : e);
  }
}
