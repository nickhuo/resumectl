// Normalization shared by local matching, the stuffing guard, and decider redaction.

const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]\d{4}/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lowercase, keep letters, numbers, and the symbols that appear inside skill names. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsTerm(haystack: string, term: string): boolean {
  const h = normalizeText(haystack);
  const t = normalizeText(term);
  if (!t) return false;
  const pattern = t.split(" ").map(escapeRegExp).join("\\s+");
  return new RegExp(`(?:^|\\s)${pattern}(?:$|\\s)`, "i").test(h);
}

export function countTerm(haystack: string, term: string): number {
  const h = normalizeText(haystack);
  const t = normalizeText(term);
  if (!t) return 0;
  const pattern = t.split(" ").map(escapeRegExp).join("\\s+");
  return [...h.matchAll(new RegExp(`(?:^|\\s)${pattern}(?=$|\\s)`, "gi"))].length;
}

export function wordTokens(s: string): string[] {
  return normalizeText(s).split(" ").filter(w => w.length > 1);
}

export function ngrams(words: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

export function clip(s: string, max = 240): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

export function findEmail(s: string): string | undefined {
  return s.match(EMAIL)?.[0];
}

export function findPhone(s: string): string | undefined {
  return s.match(PHONE)?.[0];
}

/** Names and contact details stay in the local report. Deciders never see them. */
export function redactText(s: string, name?: string): string {
  let out = s.replace(EMAIL, "[redacted]").replace(PHONE, "[redacted]");
  const cleaned = name?.replace(/\s+/g, " ").trim();
  if (cleaned && cleaned.length > 1) {
    out = out.replace(new RegExp(escapeRegExp(cleaned), "gi"), "[redacted]");
  }
  return out;
}

export function decodeEntities(s: string): string {
  let out = s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
  // A second pass turns &amp;lt; into < after the first amp decode.
  if (out.includes("&")) {
    out = out.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&");
  }
  return out;
}

export function htmlToText(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const withBreaks = noScript
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ");
  const stripped = decodeEntities(withBreaks.replace(/<[^>]+>/g, " "));
  return stripped
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
