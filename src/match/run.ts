// Orchestrates match. Grade aggregation stays in grade.ts; deciders only score one requirement at a time.
import { basename, dirname, join, resolve } from "node:path";
import { InputError } from "../errors.ts";
import { resolveInputs } from "../content/tex.ts";
import { resolveConfig } from "../project/config.ts";
import { findPrivateUseMappings } from "../quality/pdf.ts";
import { hash, manifestPath } from "../rendering/measurements.ts";
import { decideJev } from "./deciders/jev.ts";
import { decideNone, scoreRequirement } from "./deciders/none.ts";
import { decideOpenAI, type DeciderCall, type RemoteRequirement } from "./deciders/openai.ts";
import type { FetchLike } from "./deciders/http.ts";
import { JEV_MODEL, OPENAI_DECISION_MODEL } from "./deciders/rubric.ts";
import { redactSnippets, retrieveEvidence, type EvidenceSnippet } from "./evidence.ts";
import { buildGaps, type Gap } from "./gaps.ts";
import { aggregateGrade } from "./grade.ts";
import { evaluateHardGates, type GateResult } from "./hard-gates.ts";
import { resolveJd } from "./jd.ts";
import { gateRequirements, loadProfile, scoredRequirements, type Requirement } from "./requirements.ts";
import { parseResume, type ParseFinding, type ResumeView } from "./resume.ts";
import { capSkillsOnly, stuffingFindings, type StuffingFinding } from "./stuffing.ts";
import { MATCH_DISCLAIMER, levelRank, oneHot, type DeciderName, type Grade, type Level, type Priority } from "./types.ts";

export interface MatchOptions {
  texPath: string;
  jd: string;
  profilePath?: string;
  /** Default openai, matching the CLI. */
  decider?: DeciderName;
  model?: string;
  refresh?: boolean;
  cwd?: string;
  now?: Date;
  fetch?: FetchLike;
  env?: Record<string, string | undefined>;
  /** Replaces the named decider. Tests use this so they never call a network. */
  decide?: (reqs: RemoteRequirement[]) => Promise<DeciderCall>;
}

export interface RequirementResult {
  id: string;
  text: string;
  kind: Requirement["kind"];
  priority: Priority;
  level: Level;
  probabilities: [number, number, number, number];
  confidence: number | null;
  matchType: "exact" | "alias" | "model" | "fallback" | "none";
  evidence: EvidenceSnippet[];
  fallback: boolean;
  modelLevel?: Level;
}

export interface MatchReport {
  disclaimer: string;
  calibration: "uncalibrated";
  decider: DeciderName;
  model: string | null;
  grade: Grade | null;
  gradeCapped: boolean;
  gradeProbabilities: Record<Grade, number> | null;
  stuffing: StuffingFinding[];
  hardGates: GateResult[];
  requirements: RequirementResult[];
  gaps: Gap[];
  parse: ParseFinding[];
  jd: {
    title?: string;
    company?: string;
    source: string | null;
    cacheDir: string | null;
    requirementsPath: string;
  };
  resume: {
    texPath: string;
    pdfPath: string | null;
    /** Levels are scored from visible .tex text, the same extraction the length gate uses. */
    textSource: "tex";
  };
  usage?: { inputTokens: number; outputTokens: number };
}

export async function runMatch(options: MatchOptions): Promise<MatchReport> {
  const cwd = options.cwd ?? process.cwd();
  const deciderName = options.decider ?? "openai";
  if (deciderName !== "openai" && deciderName !== "jev" && deciderName !== "none") {
    throw new InputError("--decider must be openai, jev, or none");
  }
  const texPath = resolve(cwd, options.texPath);
  if (!await Bun.file(texPath).exists()) throw new InputError(`TeX source not found: ${texPath}`);
  const tex = await resolveInputs(await Bun.file(texPath).text(), texPath);
  const resume = parseResume(tex, options.now ?? new Date());
  const jd = await resolveJd(options.jd, { cwd, refresh: options.refresh ?? false, ...(options.fetch ? { fetch: options.fetch } : {}) });
  const profile = options.profilePath ? await loadProfile(resolve(cwd, options.profilePath)) : undefined;
  const scored = scoredRequirements(jd.requirements.requirements);
  const hardGates = evaluateHardGates(gateRequirements(jd.requirements.requirements), resume, profile);
  const { rows, model, usage } = await scoreRequirements(deciderName, options, resume, scored);
  const adjusted = applySkillsCap(resume, scored, rows);
  const stuffing = stuffingFindings(resume, jd.jdText, scored, adjusted, profile?.facts);
  const graded = aggregateGrade(
    adjusted.map(row => ({ id: row.id, priority: row.priority, level: row.level, probabilities: row.probabilities })),
    { capAt: stuffing.length ? "B" : null },
  );
  const pdf = await pdfFindings(texPath, tex);
  const parse = [...resume.parse, ...pdf.findings];
  const gaps = buildGaps(scored, adjusted, hardGates, parse);
  return {
    disclaimer: MATCH_DISCLAIMER,
    calibration: "uncalibrated",
    decider: deciderName,
    model,
    grade: graded.grade,
    gradeCapped: graded.capped,
    gradeProbabilities: graded.probabilities,
    stuffing,
    hardGates,
    requirements: adjusted,
    gaps,
    parse,
    jd: {
      ...(jd.title ? { title: jd.title } : {}),
      ...(jd.company ? { company: jd.company } : {}),
      source: jd.sourceUrl,
      cacheDir: jd.cacheDir,
      requirementsPath: jd.requirementsPath,
    },
    resume: { texPath, pdfPath: pdf.pdfPath, textSource: "tex" },
    ...(usage ? { usage } : {}),
  };
}

async function scoreRequirements(
  deciderName: DeciderName,
  options: MatchOptions,
  resume: ResumeView,
  scored: Requirement[],
): Promise<{ rows: RequirementResult[]; model: string | null; usage?: { inputTokens: number; outputTokens: number } }> {
  if (deciderName === "none" && !options.decide) {
    return { rows: decideNone(resume, scored).map(row => fromLocal(row, scored)), model: null };
  }
  const model = options.model || (deciderName === "jev" ? JEV_MODEL : deciderName === "openai" ? OPENAI_DECISION_MODEL : null);
  const payload: RemoteRequirement[] = scored.map(req => ({
    id: req.id,
    text: req.text,
    terms: req.terms,
    evidence: redactSnippets(retrieveEvidence(resume, req), resume.name).map(snippet => ({
      section: snippet.section,
      quote: snippet.quote,
    })),
  }));
  const call = options.decide
    ? await options.decide(payload)
    : deciderName === "jev"
      ? await decideJev(payload, { ...(options.model ? { model: options.model } : {}), ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.env ? { env: options.env } : {}) })
      : await decideOpenAI(payload, { ...(options.model ? { model: options.model } : {}), ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.env ? { env: options.env } : {}) });
  const rows = call.rows.map(row => {
    const req = scored.find(item => item.id === row.id);
    if (!req) throw new InputError(`decider returned unknown requirement ${row.id}`);
    const local = scoreRequirement(resume, req);
    // Report quotes stay on the user's machine. Only the decider payload was redacted.
    const evidence = local.evidence;
    if (row.fallback) return { ...fromLocal(local, scored), fallback: true };
    // No retrieved quote was sent. A high model score here would be invented coverage.
    if (evidence.length === 0 && levelRank(row.level) > levelRank("Missing")) {
      const capped: RequirementResult = {
        id: row.id, text: req.text, kind: req.kind, priority: req.priority,
        level: "Missing", probabilities: oneHot("Missing"), confidence: row.confidence,
        matchType: "none", evidence, fallback: false, modelLevel: row.level,
      };
      return capped;
    }
    const matchType = evidence.some(snippet => snippet.matchType === "exact")
      ? "exact" as const
      : evidence.some(snippet => snippet.matchType === "alias") ? "alias" as const : local.matchType;
    return {
      id: row.id,
      text: req.text,
      kind: req.kind,
      priority: req.priority,
      level: row.level,
      probabilities: row.probabilities,
      confidence: row.confidence,
      matchType,
      evidence,
      fallback: false,
    };
  });
  return { rows, model, ...(call.usage ? { usage: call.usage } : {}) };
}

function fromLocal(row: ReturnType<typeof scoreRequirement>, scored: Requirement[]): RequirementResult {
  const req = scored.find(item => item.id === row.id)!;
  return {
    id: row.id,
    text: req.text,
    kind: req.kind,
    priority: req.priority,
    level: row.level,
    probabilities: row.probabilities,
    confidence: row.confidence,
    matchType: row.matchType,
    evidence: row.evidence,
    fallback: row.fallback,
  };
}

function applySkillsCap(resume: ResumeView, scored: Requirement[], rows: RequirementResult[]): RequirementResult[] {
  const capped = capSkillsOnly(resume, scored, rows);
  return rows.map(row => {
    const next = capped.find(item => item.id === row.id)!;
    return {
      ...row,
      level: next.level,
      probabilities: next.probabilities,
      ...(next.modelLevel ? { modelLevel: next.modelLevel } : {}),
    };
  });
}

async function pdfFindings(texPath: string, tex: string): Promise<{ pdfPath: string | null; findings: ParseFinding[] }> {
  let pdfPath = join(dirname(texPath), basename(texPath).replace(/\.tex$/i, ".pdf"));
  try {
    const { config } = await resolveConfig({ texPath });
    if (config.build.outDir) pdfPath = join(config.build.outDir, basename(texPath).replace(/\.tex$/i, ".pdf"));
  } catch (error) {
    if (error instanceof InputError && /TeX source not found/.test(error.message)) throw error;
  }
  if (!await Bun.file(pdfPath).exists()) {
    return {
      pdfPath: null,
      findings: [{
        code: "pdf_text",
        ok: true,
        detail: "No built PDF found. Coverage uses the .tex visible text, the same extraction as the length gate. Build the PDF to also check private-use mappings.",
      }],
    };
  }
  const bytes = await Bun.file(pdfPath).bytes();
  const privateUse = findPrivateUseMappings(bytes);
  let detail = privateUse.length
    ? `Private-use mappings: ${privateUse.map(cp => "U+" + cp.toString(16).toUpperCase()).join(", ")}`
    : "PDF text maps do not use private-use code points.";
  const manifest = manifestPath(pdfPath);
  if (await Bun.file(manifest).exists()) {
    try {
      const meta = await Bun.file(manifest).json() as { sourceHash?: string; pdfHash?: string };
      if (meta.sourceHash !== hash(tex) || meta.pdfHash !== hash(bytes)) {
        detail += " The PDF does not match the current source; rebuild before trusting this check.";
      }
    } catch {
      detail += " The render manifest could not be read.";
    }
  }
  return {
    pdfPath,
    findings: [{ code: "private_use", ok: privateUse.length === 0, detail }],
  };
}
