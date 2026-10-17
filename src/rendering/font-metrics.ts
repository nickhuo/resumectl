// Minimal sfnt reader: advance widths for a set of characters, straight from a
// TrueType/OpenType file's cmap + hmtx tables. Used by scripts/gen-metrics.ts.

export interface FontMetrics {
  /** Font file the table was generated from (basename only). */
  source: string;
  /** Advance widths in 1/1000 em, keyed by character. */
  widths: Record<string, number>;
}

function tables(view: DataView): Map<string, number> {
  const count = view.getUint16(4);
  const out = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(...[0, 1, 2, 3].map(k => view.getUint8(rec + k)));
    out.set(tag, view.getUint32(rec + 8));
  }
  return out;
}

/** Unicode code point → glyph id, from a format 4 or format 12 cmap subtable. */
function readCmap(view: DataView, cmap: number): (cp: number) => number {
  const n = view.getUint16(cmap + 2);
  let best: { format: number; offset: number } | null = null;
  for (let i = 0; i < n; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = view.getUint16(rec);
    const encoding = view.getUint16(rec + 2);
    const offset = cmap + view.getUint32(rec + 4);
    const format = view.getUint16(offset);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (unicode && (format === 12 || (format === 4 && best?.format !== 12))) best = { format, offset };
  }
  if (!best) throw new Error("no Unicode cmap subtable");
  const { format, offset } = best;

  if (format === 12) {
    const groups = view.getUint32(offset + 12);
    return cp => {
      for (let g = 0; g < groups; g++) {
        const rec = offset + 16 + g * 12;
        const start = view.getUint32(rec);
        const end = view.getUint32(rec + 4);
        if (cp >= start && cp <= end) return view.getUint32(rec + 8) + (cp - start);
      }
      return 0;
    };
  }

  const segX2 = view.getUint16(offset + 6);
  const ends = offset + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  return cp => {
    for (let s = 0; s < segX2; s += 2) {
      if (cp > view.getUint16(ends + s)) continue;
      const start = view.getUint16(starts + s);
      if (cp < start) return 0;
      const delta = view.getInt16(deltas + s);
      const rangeOffset = view.getUint16(ranges + s);
      if (rangeOffset === 0) return (cp + delta) & 0xffff;
      const glyph = view.getUint16(ranges + s + rangeOffset + (cp - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

export async function readFontMetrics(path: string, chars: string): Promise<FontMetrics> {
  const view = new DataView(await Bun.file(path).arrayBuffer());
  const t = tables(view);
  const head = t.get("head"), hhea = t.get("hhea"), hmtx = t.get("hmtx"), cmap = t.get("cmap");
  if (head === undefined || hhea === undefined || hmtx === undefined || cmap === undefined) {
    throw new Error(`${path}: missing head/hhea/hmtx/cmap table`);
  }
  const unitsPerEm = view.getUint16(head + 18);
  const numHMetrics = view.getUint16(hhea + 34);
  const glyphOf = readCmap(view, cmap);
  const advance = (gid: number) => view.getUint16(hmtx + 4 * Math.min(gid, numHMetrics - 1));

  const widths: Record<string, number> = {};
  for (const ch of chars) {
    const gid = glyphOf(ch.codePointAt(0)!);
    if (gid !== 0) widths[ch] = Math.round((advance(gid) * 1000) / unitsPerEm);
  }
  return { source: path.split("/").pop()!, widths };
}
