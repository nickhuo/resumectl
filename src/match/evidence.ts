// Local retrieval: the decider sees a requirement and its top snippets, not the whole résumé.
import { hitTerm } from "./aliases.ts";
import type { Requirement } from "./requirements.ts";
import type { ResumeView } from "./resume.ts";
import { clip, redactText } from "./text.ts";

export interface EvidenceSnippet {
  section: string;
  quote: string;
  matchType: "exact" | "alias" | "none";
}

const ACTION = /\b(built|designed|shipped|optimized|optimised|automated|reduced|migrated|instrumented|led|owned|implemented|developed|created|launched|improved|added|introduced|moved|cut|wrote|rewrote|packaged|fine-tuned|finetuned|trained|deployed|scaled|raised|dropped|lifting|lifted)\b/i;
const RESULT = /\d|%|\b(from|to)\b/i;

export function hasAction(text: string): boolean {
  return ACTION.test(text);
}

export function hasResult(text: string): boolean {
  return RESULT.test(text);
}

export function retrieveEvidence(resume: ResumeView, req: Requirement, limit = 3): EvidenceSnippet[] {
  const ranked: { score: number; snippet: EvidenceSnippet }[] = [];
  const push = (section: string, text: string, roleIndex: number | undefined, base: number) => {
    const hit = req.terms.length ? hitTerm(text, req.terms) : hitTerm(text, [req.text]);
    if (!hit) return;
    let score = base + (hit.alias ? 2 : 3);
    if (roleIndex === 0) score += 1;
    if (hasAction(text) && hasResult(text)) score += 1;
    ranked.push({
      score,
      snippet: { section, quote: clip(text), matchType: hit.alias ? "alias" : "exact" },
    });
  };
  for (const bullet of resume.bullets) {
    const base = bullet.sectionKind === "experience" ? 3 : bullet.sectionKind === "projects" ? 2 : bullet.sectionKind === "summary" ? 1 : 0;
    push(bullet.section, bullet.text, bullet.roleIndex, base);
  }
  resume.roles.forEach((role, index) => {
    push(resume.sections.find(s => s.kind === "experience")?.name ?? "WORK EXPERIENCE", `${role.title} ${role.org}`.trim(), index, 2);
  });
  const seen = new Set<string>();
  return ranked
    .sort((a, b) => b.score - a.score)
    .filter(row => {
      const key = row.snippet.quote;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(row => row.snippet);
}

export function redactSnippets(snippets: EvidenceSnippet[], name?: string): EvidenceSnippet[] {
  return snippets.map(snippet => ({ ...snippet, quote: redactText(snippet.quote, name) }));
}
