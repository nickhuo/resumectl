// Shared types for resume ↔ job-description coverage. The letter grade is never a model output.

export const LEVELS = ["Missing", "Mentioned", "Partial", "Demonstrated"] as const;
export type Level = (typeof LEVELS)[number];

export const GRADES = ["A", "B", "C", "D"] as const;
export type Grade = (typeof GRADES)[number];

export const REQUIREMENT_KINDS = [
  "skill", "tool", "domain", "title", "years", "education", "certification",
  "license", "location", "work_authorization", "language", "soft",
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export type Priority = "required" | "preferred";
export type DeciderName = "openai" | "jev" | "none";
export type GapType = "wording" | "placement" | "missing evidence" | "parse" | "knockout";

export const MATCH_DISCLAIMER =
  "Diagnostic coverage of this résumé against requirements you supply. Not an ATS score, and not a prediction that an employer will pass or reject the résumé. Recruiter tools are configured per job and often rank relative to other applicants. The letter grade is computed in code from per-requirement levels. Probabilities are uncalibrated until you label your own examples.";

export function levelRank(level: Level): number {
  return LEVELS.indexOf(level);
}

/** Partial and Demonstrated count as met. Mentioned is a keyword hit, not coverage. */
export function isMet(level: Level): boolean {
  return levelRank(level) >= levelRank("Partial");
}

export function oneHot(level: Level): [number, number, number, number] {
  const probs: [number, number, number, number] = [0, 0, 0, 0];
  probs[levelRank(level)] = 1;
  return probs;
}

/** Highest probability wins. Ties resolve to the lower (weaker) level. */
export function levelFromDistribution(probs: readonly number[]): Level {
  let best = 0;
  for (let i = 1; i < LEVELS.length; i++) if (probs[i] > probs[best]) best = i;
  return LEVELS[best] ?? "Missing";
}

export function normalizeDistribution(probs: readonly number[]): [number, number, number, number] {
  const four = [0, 1, 2, 3].map(i => (Number.isFinite(probs[i]) ? Math.max(0, probs[i]) : 0)) as [number, number, number, number];
  const sum = four.reduce((a, b) => a + b, 0);
  if (sum <= 0) return [1, 0, 0, 0];
  return four.map(p => p / sum) as [number, number, number, number];
}
