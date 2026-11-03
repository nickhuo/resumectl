// Canonical term plus a small alias table. Multiple aliases count once per requirement
// (Greenhouse-style): extra synonyms do not raise coverage.
import { containsTerm, normalizeText } from "./text.ts";

const PAIRS: readonly [string, string][] = [
  ["k8s", "kubernetes"],
  ["js", "javascript"],
  ["ts", "typescript"],
  ["postgres", "postgresql"],
  ["nodejs", "node.js"],
  ["node", "node.js"],
  ["golang", "go"],
  ["ml", "machine learning"],
  ["nlp", "natural language processing"],
  ["aws", "amazon web services"],
  ["gcp", "google cloud platform"],
  ["llm", "large language model"],
  ["reactjs", "react"],
];

const ALIASES = new Map<string, string[]>();
for (const [a, b] of PAIRS) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  ALIASES.set(left, [...(ALIASES.get(left) ?? []), right]);
  ALIASES.set(right, [...(ALIASES.get(right) ?? []), left]);
}

export interface ExpandedTerm {
  term: string;
  /** True when the term was added from the alias table or is not terms[0]. */
  alias: boolean;
}

export function expandTerms(terms: string[]): ExpandedTerm[] {
  const out: ExpandedTerm[] = [];
  const seen = new Set<string>();
  const add = (term: string, alias: boolean) => {
    const key = normalizeText(term);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ term, alias });
  };
  terms.forEach((term, i) => {
    add(term, i > 0);
    for (const alt of ALIASES.get(normalizeText(term)) ?? []) add(alt, true);
  });
  return out;
}

export interface TermHit {
  alias: boolean;
  term: string;
}

/** Canonical term (terms[0]) is an exact hit. Every other expansion is an alias. */
export function hitTerm(haystack: string, terms: string[]): TermHit | null {
  const expanded = expandTerms(terms);
  let aliasHit: TermHit | null = null;
  for (const term of expanded) {
    if (!containsTerm(haystack, term.term)) continue;
    if (!term.alias) return { alias: false, term: term.term };
    aliasHit ??= { alias: true, term: term.term };
  }
  return aliasHit;
}
