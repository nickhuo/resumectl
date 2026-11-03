// Ordered low → high. Both deciders use this order. Do not shuffle it:
// score levels are a scale, and Jev reads each description on its own.
export const LEVEL_CRITERIA = [
  "No evidence quote shows this requirement or a close alias.",
  "The requirement appears only as a keyword, in a skills list, or in a summary, with no use in a role or project bullet.",
  "A role or project quote shows the skill or an adjacent tool in use, without scope, mechanism, or a concrete outcome.",
  "A role or project quote names the requirement together with scope or a concrete outcome.",
] as const;

export const LEVEL_LABELS = ["Missing", "Mentioned", "Partial", "Demonstrated"] as const;

export const OPENAI_DECISION_MODEL = "gpt-6-luna";
export const OPENAI_DECISIONS_URL = "https://api.openai.com/v1/decisions";
export const JEV_MODEL = "jev-1.14.0";
export const JEV_URL = "https://api.typesafe.ai/v1/systemone";

export function questionInstructions(id: string, text: string, terms: string[], evidence: { section: string; quote: string }[]): string {
  const quotes = evidence.length
    ? evidence.map(snippet => `- [${snippet.section}] ${snippet.quote}`).join("\n")
    : "(no evidence quotes)";
  return [
    `Requirement ${id}: ${text}`,
    terms.length ? `Terms: ${terms.join(", ")}` : "",
    "Judge only the evidence below. If it is empty, use the lowest level. Do not assume unstated experience.",
    "Evidence:",
    quotes,
  ].filter(Boolean).join("\n");
}
