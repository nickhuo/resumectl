// Keyword stuffing cannot raise the letter grade above B.
// Coverage credit for a skills-list-only term is capped at Mentioned.
import { expandTerms } from "./aliases.ts";
import type { EvidenceSnippet } from "./evidence.ts";
import type { Requirement } from "./requirements.ts";
import type { ResumeView } from "./resume.ts";
import { containsTerm, countTerm, ngrams, wordTokens } from "./text.ts";
import { levelRank, oneHot, type Level } from "./types.ts";

export interface StuffingFinding {
  kind: "jd_paste" | "repetition" | "skills_without_evidence" | "unbacked";
  detail: string;
  requirementId?: string;
}

export interface ScoredRow {
  id: string;
  level: Level;
  probabilities: [number, number, number, number];
  evidence: EvidenceSnippet[];
  modelLevel?: Level;
}

const REPEAT_LIMIT = 6;
const PASTE_N = 8;

export function skillsOnly(resume: ResumeView, req: Requirement): boolean {
  if (!["skill", "tool", "domain", "language", "soft"].includes(req.kind)) return false;
  const terms = req.terms.length ? req.terms : [req.text];
  let inSkills = false;
  let inEvidence = false;
  const hit = (text: string) => hitAny(text, terms);
  for (const bullet of resume.bullets) {
    if (!hit(bullet.text)) continue;
    if (bullet.sectionKind === "experience" || bullet.sectionKind === "projects") inEvidence = true;
    if (bullet.sectionKind === "skills") inSkills = true;
  }
  resume.roles.forEach(role => {
    if (hit(`${role.title} ${role.org}`)) inEvidence = true;
  });
  return inSkills && !inEvidence;
}

function hitAny(text: string, terms: string[]): boolean {
  return expandTerms(terms).some(term => containsTerm(text, term.term));
}

export function stuffingFindings(
  resume: ResumeView,
  jdText: string | null,
  reqs: Requirement[],
  rows: ScoredRow[],
  facts?: string[],
): StuffingFinding[] {
  const findings: StuffingFinding[] = [];
  if (jdText) {
    const resumeGrams = ngrams(wordTokens(resume.visibleText), PASTE_N);
    const pasted = [...ngrams(wordTokens(jdText), PASTE_N)].find(gram => resumeGrams.has(gram));
    if (pasted) findings.push({ kind: "jd_paste", detail: `An ${PASTE_N}-word sequence from the posting also appears in the résumé: "${pasted}".` });
  }
  const corpus = resume.visibleText;
  for (const req of reqs) {
    for (const term of req.terms) {
      if (normalizeLen(term) < 4) continue;
      const count = countTerm(corpus, term);
      if (count > REPEAT_LIMIT) {
        findings.push({
          kind: "repetition",
          requirementId: req.id,
          detail: `"${term}" appears ${count} times. More than ${REPEAT_LIMIT} repetitions is treated as stuffing.`,
        });
      }
    }
    if (skillsOnly(resume, req)) {
      findings.push({
        kind: "skills_without_evidence",
        requirementId: req.id,
        detail: `${req.id} appears in the skills list and not in a role or project. That cannot count as demonstrated coverage.`,
      });
    }
  }
  if (facts && facts.length) {
    const blob = facts.join("\n");
    const factGrams = facts.flatMap(fact => [...ngrams(wordTokens(fact), 4)]);
    for (const row of rows) {
      if (row.level === "Missing") continue;
      const req = reqs.find(item => item.id === row.id);
      if (!req) continue;
      const termHit = (req.terms.length ? req.terms : [req.text]).some(term => containsTerm(blob, term));
      const quote = row.evidence.map(snippet => snippet.quote).join(" ");
      const quoteGrams = ngrams(wordTokens(quote), 4);
      const overlap = factGrams.some(gram => quoteGrams.has(gram));
      if (!termHit && !overlap) {
        findings.push({
          kind: "unbacked",
          requirementId: req.id,
          detail: `${req.id} is on the résumé but not in the profile facts. Ask before treating it as demonstrated.`,
        });
      }
    }
  }
  return findings;
}

function normalizeLen(term: string): number {
  return term.trim().length;
}

/** Skills-list-only rows cannot sit above Mentioned, whatever the decider returned. */
export function capSkillsOnly(resume: ResumeView, reqs: Requirement[], rows: ScoredRow[]): ScoredRow[] {
  return rows.map(row => {
    const req = reqs.find(item => item.id === row.id);
    if (!req || !skillsOnly(resume, req) || levelRank(row.level) <= levelRank("Mentioned")) return row;
    return { ...row, modelLevel: row.level, level: "Mentioned", probabilities: oneHot("Mentioned") };
  });
}
