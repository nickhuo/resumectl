// Knockouts are application-question risks. They are never averaged into the letter grade.
// Years and degrees are computed here. Decision models are weak at dates and arithmetic.
import { clip, containsTerm } from "./text.ts";
import type { Profile, Requirement } from "./requirements.ts";
import { totalWorkYears, type ResumeView } from "./resume.ts";
import type { EvidenceSnippet } from "./evidence.ts";
import type { Level } from "./types.ts";

export interface GateResult {
  id: string;
  text: string;
  kind: Requirement["kind"];
  priority: Requirement["priority"];
  level: Level;
  detail: string;
  evidence: EvidenceSnippet[];
}

const DEGREE_RANK = { highschool: 1, associate: 2, bachelor: 3, master: 4, phd: 5 } as const;
type DegreeLevel = keyof typeof DEGREE_RANK;

const EQUIVALENT_YEARS: Record<DegreeLevel, number> = {
  highschool: 0, associate: 2, bachelor: 4, master: 6, phd: 8,
};

const REMOTE = /^(remote|hybrid|anywhere|distributed|work from home)$/i;

export function normalizeDegree(raw: string | undefined): DegreeLevel | null {
  if (!raw) return null;
  const tokens = raw.toLowerCase().replace(/\./g, "").split(/[^a-z0-9+]+/).filter(Boolean);
  const has = (...words: string[]) => words.some(word => tokens.includes(word));
  if (has("phd", "doctorate", "doctoral")) return "phd";
  if (has("master", "masters", "mba", "meng", "msc", "ms")) return "master";
  if (has("bachelor", "bachelors", "bs", "ba", "bsc", "beng")) return "bachelor";
  if (has("associate", "associates")) return "associate";
  if (has("highschool") || (tokens.includes("high") && tokens.includes("school"))) return "highschool";
  return null;
}

function bestDegree(resume: ResumeView, profile?: Profile): { level: DegreeLevel; quote: string } | null {
  const blobs = [
    ...resume.education.map(entry => ({ quote: `${entry.label} ${entry.detail}`, level: normalizeDegree(`${entry.label} ${entry.detail}`) })),
    ...(profile?.degrees ?? []).map(degree => ({ quote: `profile: ${degree.level}${degree.field ? ` ${degree.field}` : ""}`, level: normalizeDegree(degree.level) })),
  ];
  let best: { level: DegreeLevel; quote: string } | null = null;
  for (const blob of blobs) {
    if (!blob.level) continue;
    if (!best || DEGREE_RANK[blob.level] > DEGREE_RANK[best.level]) best = { level: blob.level, quote: blob.quote };
  }
  return best;
}

function yearsNeeded(req: Requirement): number | undefined {
  if (req.minYears !== undefined) return req.minYears;
  const match = req.text.match(/(\d+(?:\.\d+)?)\s*\+?\s*years/i);
  return match ? Number(match[1]) : undefined;
}

function quote(section: string, text: string): EvidenceSnippet {
  return { section, quote: clip(text), matchType: "exact" };
}

export function evaluateHardGates(reqs: Requirement[], resume: ResumeView, profile?: Profile): GateResult[] {
  const { years, unparsed } = totalWorkYears(resume.roles);
  return reqs.map(req => {
    if (req.kind === "years" || req.id.endsWith("#years")) return yearsGate(req, years, unparsed);
    if (req.kind === "education") return educationGate(req, resume, profile, years);
    if (req.kind === "location") return locationGate(req, resume, profile);
    if (req.kind === "work_authorization") return authGate(req, resume, profile);
    if (req.kind === "license") return licenseGate(req, resume, profile);
    return {
      id: req.id, text: req.text, kind: req.kind, priority: req.priority,
      level: "Missing" as const, detail: "No deterministic check for this gate.", evidence: [],
    };
  });
}

function yearsGate(req: Requirement, years: number, unparsed: number): GateResult {
  const needed = yearsNeeded(req);
  const counted = `${years.toFixed(1)} years from dated roles${unparsed ? `; ${unparsed} role(s) had no parseable dates and were not counted` : ""}`;
  if (needed === undefined) {
    return {
      id: req.id, text: req.text, kind: req.kind, priority: req.priority, level: "Missing",
      detail: "No minimum year count on this requirement. Set min_years.", evidence: [quote("WORK EXPERIENCE", counted)],
    };
  }
  const met = years + 1e-9 >= needed;
  return {
    id: req.id, text: req.text, kind: req.kind, priority: req.priority,
    level: met ? "Demonstrated" : "Missing",
    detail: met ? `Parsed history meets ${needed} years (${counted}).` : `Parsed history is short of ${needed} years (${counted}).`,
    evidence: [quote("WORK EXPERIENCE", counted)],
  };
}

function educationGate(req: Requirement, resume: ResumeView, profile: Profile | undefined, years: number): GateResult {
  const needed = normalizeDegree(req.level ?? req.text);
  const have = bestDegree(resume, profile);
  if (!needed) {
    return {
      id: req.id, text: req.text, kind: req.kind, priority: req.priority, level: "Missing",
      detail: "No degree level on this requirement. Set level: bachelor (or associate, master, phd).", evidence: [],
    };
  }
  if (have && DEGREE_RANK[have.level] >= DEGREE_RANK[needed]) {
    const relation = DEGREE_RANK[have.level] > DEGREE_RANK[needed] ? "exceeds" : "meets";
    return {
      id: req.id, text: req.text, kind: req.kind, priority: req.priority, level: "Demonstrated",
      detail: `Highest parsed degree ${relation} ${needed}.`,
      evidence: [quote("EDUCATION", have.quote)],
    };
  }
  if (/equivalent/i.test(req.text) && years + 1e-9 >= EQUIVALENT_YEARS[needed]) {
    return {
      id: req.id, text: req.text, kind: req.kind, priority: req.priority, level: "Partial",
      detail: `Degree not found. The requirement mentions equivalent experience and parsed work history meets a local heuristic of ${EQUIVALENT_YEARS[needed]} years. Confirm on the application. This heuristic is not an employer's rule.`,
      evidence: [quote("WORK EXPERIENCE", `${years.toFixed(1)} years from dated roles`)],
    };
  }
  return {
    id: req.id, text: req.text, kind: req.kind, priority: req.priority, level: "Missing",
    detail: have ? `Highest parsed degree is ${have.level}; requirement asks for ${needed}.` : `No degree found; requirement asks for ${needed}.`,
    evidence: have ? [quote("EDUCATION", have.quote)] : [],
  };
}

function locationGate(req: Requirement, resume: ResumeView, profile?: Profile): GateResult {
  const hints = [...resume.locationHints, ...(profile?.location ? [profile.location] : [])];
  const terms = req.terms.length ? req.terms : [];
  const remoteTerm = (term: string) => REMOTE.test(term.trim()) || /\bremote\b|\bhybrid\b/i.test(term);
  const places = terms.filter(term => !remoteTerm(term));
  const allowsRemote = terms.some(remoteTerm) || /\bremote\b|\bhybrid\b/i.test(req.text);
  const candidateRemote = hints.some(hint => /\bremote\b|\bhybrid\b/i.test(hint)) || profile?.openToRemote === true;
  const placeHit = places.find(place => hints.some(hint => containsTerm(hint, place) || containsTerm(place, hint)));
  if (placeHit) {
    return {
      id: req.id, text: req.text, kind: req.kind, priority: req.priority, level: "Demonstrated",
      detail: `Location matches ${placeHit}.`,
      evidence: [quote("contact", hints.find(hint => containsTerm(hint, placeHit) || containsTerm(placeHit, hint)) ?? placeHit)],
    };
  }
  if (allowsRemote && candidateRemote) {
    return {
      id: req.id, text: req.text, kind: req.kind, priority: req.priority, level: "Demonstrated",
      detail: "Requirement allows remote or hybrid, and the résumé or profile says so.",
      evidence: [quote("contact", profile?.openToRemote ? "profile: open_to_remote" : hints.find(hint => /\bremote\b|\bhybrid\b/i.test(hint)) ?? "remote")],
    };
  }
  const relocate = profile?.willingToRelocate ? " Profile says willing to relocate; that is not treated as already being in the location." : "";
  return {
    id: req.id, text: req.text, kind: req.kind, priority: req.priority, level: "Missing",
    detail: `No matching location in the résumé or profile.${relocate}`,
    evidence: hints.slice(0, 2).map(hint => quote("contact", hint)),
  };
}

function authGate(req: Requirement, resume: ResumeView, profile?: Profile): GateResult {
  const terms = req.terms.length ? req.terms : [];
  if (profile?.workAuthorization) {
    const stated = profile.workAuthorization;
    const matches = terms.length === 0 || terms.some(term => containsTerm(stated, term));
    return {
      id: req.id, text: req.text, kind: req.kind, priority: req.priority,
      level: matches ? "Demonstrated" : "Missing",
      detail: matches ? "Profile states work authorization that matches the requirement terms." : `Profile says "${stated}", which does not match the requirement terms.`,
      evidence: [quote("profile", stated)],
    };
  }
  const blob = resume.visibleText;
  const hit = terms.find(term => containsTerm(blob, term));
  if (hit) {
    return {
      id: req.id, text: req.text, kind: req.kind, priority: req.priority, level: "Demonstrated",
      detail: "The résumé text contains a work-authorization term. Real knockouts are usually application questions, not résumé lines.",
      evidence: [quote("résumé", hit)],
    };
  }
  return {
    id: req.id, text: req.text, kind: req.kind, priority: req.priority, level: "Missing",
    detail: "No work-authorization statement in the résumé or profile. Handle this on the application form. Do not invent one.",
    evidence: [],
  };
}

function licenseGate(req: Requirement, resume: ResumeView, profile?: Profile): GateResult {
  const terms = req.terms.length ? req.terms : [req.text];
  const fromProfile = (profile?.licenses ?? []).find(license => terms.some(term => containsTerm(license, term) || containsTerm(term, license)));
  if (fromProfile) {
    return {
      id: req.id, text: req.text, kind: req.kind, priority: req.priority, level: "Demonstrated",
      detail: "Profile lists a matching license.", evidence: [quote("profile", fromProfile)],
    };
  }
  const hit = terms.find(term => containsTerm(resume.visibleText, term));
  if (hit) {
    return {
      id: req.id, text: req.text, kind: req.kind, priority: req.priority, level: "Demonstrated",
      detail: "Résumé text contains the license term.", evidence: [quote("résumé", hit)],
    };
  }
  return {
    id: req.id, text: req.text, kind: req.kind, priority: req.priority, level: "Missing",
    detail: "No matching license in the résumé or profile.", evidence: [],
  };
}
