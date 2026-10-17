import serifMetrics from "./metrics/serif.json";
import sansMetrics from "./metrics/sans.json";
import type { ClassOptions } from "../content/tex.ts";

/** Legacy width estimate retained for API consumers; never used by the gates. */
export function typographicWidth(visible: string, opts: ClassOptions): number {
  const table: Record<string, number> = opts.style === "sans" ? sansMetrics.widths : serifMetrics.widths;
  let units = 0;
  for (const ch of visible) units += (table[ch] ?? 500) + opts.tracking * 10;
  return Math.round(units * opts.scale);
}
