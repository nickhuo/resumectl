// Offline decider: exact term or alias only. No embeddings and no fuzzy semantic credit.
import { hitTerm } from "../aliases.ts";
import { hasAction, hasResult, retrieveEvidence, type EvidenceSnippet } from "../evidence.ts";
import type { Requirement } from "../requirements.ts";
import type { ResumeView } from "../resume.ts";
import { levelRank, oneHot, type Level } from "../types.ts";

export interface LocalScore {
  id: string;
  level: Level;
  probabilities: [number, number, number, number];
  confidence: number | null;
  matchType: "exact" | "alias" | "model" | "fallback" | "none";
  evidence: EvidenceSnippet[];
  fallback: boolean;
}

export function scoreRequirement(resume: ResumeView, req: Requirement): LocalScore {
  const terms = req.terms.length ? req.terms : [req.text];
  let best: Level = "Missing";
  let exact = false;
  let alias = false;
  const consider = (text: string, placement: "bullet" | "title" | "other", recent: boolean) => {
    const hit = hitTerm(text, terms);
    if (!hit) return;
    if (hit.alias) alias = true;
    else exact = true;
    let level: Level = "Mentioned";
    if (placement === "bullet") level = hasAction(text) && hasResult(text) ? "Demonstrated" : "Partial";
    else if (placement === "title") level = req.kind === "title" && recent ? "Demonstrated" : "Partial";
    if (levelRank(level) > levelRank(best)) best = level;
  };
  for (const bullet of resume.bullets) {
    const placement = bullet.sectionKind === "experience" || bullet.sectionKind === "projects" ? "bullet" : "other";
    consider(bullet.text, placement, bullet.roleIndex === 0);
  }
  resume.roles.forEach((role, index) => consider(`${role.title} ${role.org}`, "title", index === 0));
  const evidence = best === "Missing" ? [] : retrieveEvidence(resume, req);
  return {
    id: req.id,
    level: best,
    probabilities: oneHot(best),
    confidence: 1,
    matchType: exact ? "exact" : alias ? "alias" : "none",
    evidence,
    fallback: false,
  };
}

export function decideNone(resume: ResumeView, reqs: Requirement[]): LocalScore[] {
  return reqs.map(req => scoreRequirement(resume, req));
}
