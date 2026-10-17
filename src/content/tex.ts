// Reading the parts of a résumé .tex the gates care about.
import { dirname, join } from "node:path";
import { InputError } from "../errors.ts";

export type Style = "serif" | "sans";

export interface ClassOptions {
  style: Style;
  /** Font scale relative to the 11pt body (sans only; serif is always 1). */
  scale: number;
  /** Letter spacing in % of the em (sans only; serif is always 0). */
  tracking: number;
}

export const DEFAULT_CLASS_OPTIONS: ClassOptions = { style: "serif", scale: 1, tracking: 0 };
export const sectionKey = (s: string) => stripToVisible(s).replace(/\s+/g, " ").trim().toUpperCase();
const SANS_DEFAULTS = { scale: 0.86, tracking: -1.5 };

export function stripComments(tex: string): string {
  return tex.replace(/(^|[^\\])%[^\n]*/g, "$1");
}

/** Inline \input{x} / \include{x} relative to the including file, so split sources check as one. */
export async function resolveInputs(tex: string, texPath: string, depth = 0): Promise<string> {
  if (depth > 8) throw new InputError(`\\input nesting deeper than 8 levels in ${texPath}`);
  const src = stripComments(tex);
  let out = "";
  let last = 0;
  for (const m of src.matchAll(/\\(?:input|include)\s*\{([^}]+)\}/g)) {
    const name = m[1].trim();
    const path = join(dirname(texPath), name.endsWith(".tex") ? name : `${name}.tex`);
    const file = Bun.file(path);
    if (!await file.exists()) throw new InputError(`\\input target not found: ${path}`);
    out += src.slice(last, m.index) + await resolveInputs(await file.text(), path, depth + 1);
    last = m.index! + m[0].length;
  }
  return out + src.slice(last);
}

/** Read style/scale/tracking from \documentclass[...]{resume}. Missing keys fall back to the class defaults. */
export function readClassOptions(tex: string): ClassOptions {
  const m = stripComments(tex).match(/\\documentclass\s*(?:\[([^\]]*)\])?\s*\{\s*resume\s*\}/);
  if (!m) return { ...DEFAULT_CLASS_OPTIONS };
  const kv = new Map<string, string>();
  for (const part of (m[1] ?? "").split(",")) {
    const [k, v] = part.split("=").map(s => s?.trim());
    if (k) kv.set(k, v ?? "");
  }
  if (kv.get("style") !== "sans") return { ...DEFAULT_CLASS_OPTIONS };
  const num = (key: "scale" | "tracking") => {
    const raw = kv.get(key);
    const n = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(n) ? n : SANS_DEFAULTS[key];
  };
  return { style: "sans", scale: num("scale"), tracking: num("tracking") };
}

/** Raw \item bodies of the named \section, up to the next \section. */
export function extractSectionItems(tex: string, section: string): string[] {
  const block = sectionBody(tex, section);
  const itemRe = /\\item\b([\s\S]*?)(?=\\item\b|\\end\{(?:itemize|plainlist)\}|\\datedsubsection|$)/g;
  return [...block.matchAll(itemRe)].map(m => m[1].trim());
}
function sectionBody(tex: string, section: string): string {
  tex = stripComments(tex);
  const headings = [...tex.matchAll(/\\section\*?\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
  return headings.flatMap((h, i) => sectionKey(h[1]) === sectionKey(section)
    ? [tex.slice(h.index! + h[0].length, headings[i + 1]?.index)] : []).join("\n");
}
/** Source snippets for measured lists and explicit paragraph/table entries, in render order. */
export function extractSectionEntries(tex: string, section: string): string[] {
  const block = sectionBody(tex, section);
  const entries = [...block.matchAll(/\\item\b([\s\S]*?)(?=\\item\b|\\end\{(?:itemize|plainlist)\}|\\datedsubsection|$)/g)]
    .map(m => ({ index: m.index!, text: m[1].trim() }));
  for (const m of block.matchAll(/\\resumeentry\s*\{/g)) {
    const start = m.index! + m[0].length;
    let depth = 1, end = start;
    for (; end < block.length && depth > 0; end++) {
      if (block[end] === "\\") { end++; continue; }
      if (block[end] === "{") depth++;
      if (block[end] === "}") depth--;
    }
    if (depth === 0) entries.push({ index: m.index!, text: block.slice(start, end - 1) });
  }
  return entries.sort((a, b) => a.index - b.index).map(e => e.text);
}

const MATH_SYMBOLS: Record<string, string> = { rightarrow: "→", to: "→", leftarrow: "←", times: "×", pm: "±", approx: "≈", leq: "≤", geq: "≥", sim: "~" };

/** Reduce LaTeX markup to the characters that end up on the page. */
export function stripToVisible(raw: string): string {
  let s = raw
    .replace(/\$\\(\w+)\$/g, (_, cmd: string) => MATH_SYMBOLS[cmd] ?? "")
    .replace(/\\href\s*\{[^}]*\}\s*\{([^}]*)\}/g, "$1")
    .replace(/\\([%&$_#{}])/g, "$1")
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/(^|[^\\])~/g, "$1 ");
  const cmdBrace = /\\[a-zA-Z@]+\*?\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g;
  while (cmdBrace.test(s)) s = s.replace(cmdBrace, "$1");
  return s
    .replace(/\\\\/g, "")
    .replace(/\\[a-zA-Z@]+\*?/g, "")
    .replace(/[{}$]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
