import { InputError } from "../errors.ts";
import type { LayoutOptions } from "../project/config.ts";

export interface RenderedBullet {
  id: number;
  section: string;
  lines: number;
  lineWidthPt: number;
  lastLineWidthPt: number;
  lastLineFill: number;
  unsupported: boolean;
}
export interface BuildManifest {
  version: 1;
  sourceHash: string;
  pdfHash: string;
  layout: LayoutOptions;
  bullets: RenderedBullet[];
  overflows: string[];
}
export const hash = (data: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(data).digest("hex");
export const manifestPath = (pdf: string) => pdf.replace(/\.pdf$/i, "") + ".resume-mode.json";

/** Read positions in scaled TeX points. No font-width approximation is involved. */
export function parseMeasurements(raw: string): RenderedBullet[] {
  type Paragraph = { width?: number; start?: number; end?: number; lines?: number };
  const bullets = new Map<number, { section: string; unsupported: boolean; paragraphs: Map<number, Paragraph> }>();
  for (const line of raw.trim().split(/\r?\n/).filter(Boolean)) {
    const [tag, idText, paraText, value] = line.split("|");
    const id = Number(idText);
    if (!Number.isInteger(id) || id < 1) throw new InputError("invalid bullet measurement ID; rebuild the PDF");
    if (tag === "B") {
      if (bullets.has(id)) throw new InputError("duplicate bullet measurement ID; rebuild the PDF");
      bullets.set(id, { section: line.split("|").slice(2).join("|"), unsupported: false, paragraphs: new Map() });
      continue;
    }
    const bullet = bullets.get(id);
    if (!bullet) throw new InputError("incomplete bullet measurements; rebuild the PDF");
    if (tag === "U") { bullet.unsupported = true; continue; }
    const paragraph = Number(paraText);
    const n = Number(value);
    if (!["P", "S", "E", "L"].includes(tag) || !Number.isInteger(paragraph) || paragraph < 1 || !Number.isFinite(n)) {
      throw new InputError("invalid paragraph measurements; rebuild the PDF");
    }
    const p = bullet.paragraphs.get(paragraph) ?? {};
    const key = ({ P: "width", S: "start", E: "end", L: "lines" } as const)[tag as "P" | "S" | "E" | "L"];
    if (p[key] !== undefined) throw new InputError("duplicate paragraph measurement; unsupported bullet structure");
    p[key] = n;
    bullet.paragraphs.set(paragraph, p);
  }
  return [...bullets].map(([id, bullet]) => {
    const paragraphs = [...bullet.paragraphs].sort(([a], [b]) => a - b).map(([, p]) => p);
    if (!paragraphs.length || paragraphs.some(p => !(p.width! > 0) || !Number.isInteger(p.lines) || p.lines! < 1 || p.start === undefined || p.end === undefined)) {
      throw new InputError(`bullet ${id} has no complete rendered measurements; use ordinary itemize paragraphs`);
    }
    const last = paragraphs.at(-1)!;
    const width = last.end! - last.start!;
    if (width < 0) throw new InputError(`bullet ${id} has an unsupported paragraph layout`);
    return {
      id, section: bullet.section, lines: paragraphs.reduce((n, p) => n + p.lines!, 0),
      lineWidthPt: last.width! / 65536, lastLineWidthPt: width / 65536,
      lastLineFill: width / last.width!, unsupported: bullet.unsupported,
    };
  });
}

export async function readManifest(pdfPath: string): Promise<BuildManifest> {
  const path = manifestPath(pdfPath);
  if (!await Bun.file(path).exists()) throw new InputError(`render measurements not found: ${path}; run resume-mode build first`);
  let value: BuildManifest;
  try { value = await Bun.file(path).json(); }
  catch { throw new InputError(`invalid build metadata: ${path}; rebuild the PDF`); }
  if (!value || value.version !== 1 || !value.layout || typeof value.sourceHash !== "string" || typeof value.pdfHash !== "string" || !Array.isArray(value.bullets) || !Array.isArray(value.overflows)
    || value.overflows.some(v => typeof v !== "string")
    || value.bullets.some(b => !b || typeof b.section !== "string" || !Number.isInteger(b.id) || b.id < 1 || !Number.isInteger(b.lines) || b.lines < 1
      || !Number.isFinite(b.lineWidthPt) || b.lineWidthPt <= 0 || !Number.isFinite(b.lastLineWidthPt) || b.lastLineWidthPt < 0
      || !Number.isFinite(b.lastLineFill) || b.lastLineFill < 0 || typeof b.unsupported !== "boolean")) {
    throw new InputError(`invalid build metadata: ${path}; rebuild the PDF`);
  }
  return value;
}
