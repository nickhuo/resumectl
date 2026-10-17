// Facts read straight from the compiled PDF, including PDFs whose objects live
// in compressed object streams (xdvipdfmx's default).
import { inflateSync } from "node:zlib";

/** Every inflatable stream in the PDF, as latin1 text. Non-Flate streams (fonts, images) are skipped. */
function* inflatedStreams(bytes: Uint8Array, raw: string): Generator<string> {
  // (?<!end): "endstream\n" contains "stream\n"; matching it would misalign every stream after it.
  const streamRe = /(?<!end)stream\r?\n/g;
  for (let m = streamRe.exec(raw); m; m = streamRe.exec(raw)) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) return;
    try {
      yield inflateSync(bytes.subarray(start, end)).toString("latin1");
    } catch {
      // Not a Flate stream.
    }
    streamRe.lastIndex = end;
  }
}

const PAGES_COUNT = /\/Type\s*\/Pages\b[^]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^]*?\/Type\s*\/Pages\b/g;

function maxCount(text: string): number | null {
  let best: number | null = null;
  // Scan each dictionary separately so /Count never pairs with a neighbour's /Type.
  for (const dict of text.split(/>>|<</)) {
    for (const m of dict.matchAll(PAGES_COUNT)) {
      const n = Number(m[1] ?? m[2]);
      if (best === null || n > best) best = n;
    }
  }
  return best;
}

/** The root /Pages node holds the total, so the largest /Count wins. */
export function countPdfPages(bytes: Uint8Array): number | null {
  const raw = Buffer.from(bytes).toString("latin1");
  let best = maxCount(raw);
  for (const text of inflatedStreams(bytes, raw)) {
    const n = maxCount(text);
    if (n !== null && (best === null || n > best)) best = n;
  }
  return best;
}

const isPrivateUse = (cp: number) => (cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000;

/** First code point of a UTF-16BE hex string from a ToUnicode CMap, e.g. "D83DDE00" → 0x1F600. */
function firstCodePoint(hex: string): number {
  const hi = parseInt(hex.slice(0, 4), 16);
  if (hi >= 0xd800 && hi <= 0xdbff && hex.length >= 8) {
    return 0x10000 + ((hi - 0xd800) << 10) + (parseInt(hex.slice(4, 8), 16) - 0xdc00);
  }
  return hi;
}

/**
 * Private-use code points that glyphs map to in the PDF's ToUnicode CMaps.
 * Text drawn with such glyphs looks right but copies out (and parses, for ATS)
 * as garbage — typically OpenType alternates such as case-sensitive punctuation.
 */
export function findPrivateUseMappings(bytes: Uint8Array): number[] {
  const raw = Buffer.from(bytes).toString("latin1");
  const found = new Set<number>();
  for (const cmap of inflatedStreams(bytes, raw)) {
    if (!cmap.includes("begincmap")) continue;
    for (const [, block] of cmap.matchAll(/beginbfchar([^]*?)endbfchar/g)) {
      for (const [, , dst] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const cp = firstCodePoint(dst);
        if (isPrivateUse(cp)) found.add(cp);
      }
    }
    for (const [, block] of cmap.matchAll(/beginbfrange([^]*?)endbfrange/g)) {
      for (const [, lo, hi, dst, list] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g)) {
        const targets = dst !== undefined
          ? Array.from({ length: parseInt(hi, 16) - parseInt(lo, 16) + 1 }, (_, i) => firstCodePoint(dst) + i)
          : [...list.matchAll(/<([0-9A-Fa-f]+)>/g)].map(m => firstCodePoint(m[1]));
        for (const cp of targets) if (isPrivateUse(cp)) found.add(cp);
      }
    }
  }
  return [...found].sort((a, b) => a - b);
}
