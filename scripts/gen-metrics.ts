#!/usr/bin/env bun
// Regenerates src/rendering/metrics/*.json from the fonts the template actually uses.
// Run after swapping a font: bun run gen-metrics
import { join } from "node:path";
import { readFontMetrics } from "../src/rendering/font-metrics.ts";

const root = join(import.meta.dir, "..");
// Printable ASCII plus the punctuation résumés tend to use.
const CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") + "–—·•→←↑↓↗×±≈≤≥°€£’‘“”…";

function kpsewhich(file: string): string {
  const out = Bun.spawnSync(["kpsewhich", file]).stdout.toString().trim();
  if (!out) throw new Error(`kpsewhich could not find ${file} — is TeX Live installed?`);
  return out;
}

const fonts = {
  serif: kpsewhich("texgyretermes-regular.otf"),
  // Body weight: bullets are set in the 430 cut.
  sans: join(root, "template/fonts/Inter-430.ttf"),
};

for (const [style, path] of Object.entries(fonts)) {
  const metrics = await readFontMetrics(path, CHARS);
  const out = join(root, "src/rendering/metrics", `${style}.json`);
  await Bun.write(out, JSON.stringify(metrics, null, 2) + "\n");
  console.log(`${style}: ${Object.keys(metrics.widths).length} glyphs from ${metrics.source} → ${out}`);
}
