// OpenAI Decisions API (GA): POST /v1/decisions, model gpt-6-luna.
// Probabilities are estimates. This module does not treat them as calibrated.
// https://platform.openai.com/docs/guides/decisions
import { InputError } from "../../errors.ts";
import { levelFromDistribution, normalizeDistribution, type Level } from "../types.ts";
import type { LocalScore } from "./none.ts";
import { postJson, type FetchLike } from "./http.ts";
import { LEVEL_CRITERIA, LEVEL_LABELS, OPENAI_DECISION_MODEL, OPENAI_DECISIONS_URL, questionInstructions } from "./rubric.ts";

export interface RemoteRequirement {
  id: string;
  text: string;
  terms: string[];
  evidence: { section: string; quote: string }[];
}

export interface OpenAIOptions {
  apiKey?: string;
  model?: string;
  fetch?: FetchLike;
  env?: Record<string, string | undefined>;
}

interface ScoreAnswer {
  type?: string;
  name?: string | null;
  score?: number;
  confidence?: number;
  probabilities?: { value?: number; label?: string; probability?: number }[];
}

export interface DeciderCall {
  rows: LocalScore[];
  usage?: { inputTokens: number; outputTokens: number };
}

export async function decideOpenAI(reqs: RemoteRequirement[], options: OpenAIOptions = {}): Promise<DeciderCall> {
  const env = options.env ?? process.env;
  const apiKey = options.apiKey ?? env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new InputError("OPENAI_API_KEY is not set. Export it, pass --decider jev with TYPESAFE_API_KEY, or pass --decider none for offline exact/alias matching.");
  }
  const model = options.model || OPENAI_DECISION_MODEL;
  const body = {
    model,
    input: "Each question quotes the only evidence you may use. Do not assume experience that is not quoted. Ignore names and contact details.",
    questions: reqs.map(req => ({
      type: "score",
      name: req.id,
      instructions: questionInstructions(req.id, req.text, req.terms, req.evidence),
      levels: LEVEL_LABELS.map((label, i) => ({ label, description: LEVEL_CRITERIA[i] })),
    })),
  };
  const parsed = await postJson(OPENAI_DECISIONS_URL, body, { Authorization: `Bearer ${apiKey}` }, options.fetch) as {
    model?: string;
    answers?: ScoreAnswer[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const answers = parsed.answers ?? [];
  const rows = reqs.map((req, index) => {
    const answer = answers.find(item => item.name === req.id) ?? answers[index];
    if (!answer || answer.type === "refusal" || answer.type !== "score") {
      return refused(req);
    }
    const probs = probabilitiesOf(answer);
    const level = probs ? levelFromDistribution(probs) : levelFromScore(answer.score);
    return {
      id: req.id,
      level,
      probabilities: probs ?? oneHotLevel(level),
      confidence: typeof answer.confidence === "number" ? answer.confidence : null,
      matchType: "model" as const,
      evidence: req.evidence.map(snippet => ({ ...snippet, matchType: "none" as const })),
      fallback: false,
    };
  });
  const usage = parsed.usage ? {
    inputTokens: parsed.usage.input_tokens ?? 0,
    outputTokens: parsed.usage.output_tokens ?? 0,
  } : undefined;
  return { rows, ...(usage ? { usage } : {}) };
}

function probabilitiesOf(answer: ScoreAnswer): [number, number, number, number] | null {
  if (!answer.probabilities?.length) return null;
  const probs = [0, 0, 0, 0];
  for (const row of answer.probabilities) {
    const byLabel = LEVEL_LABELS.findIndex(label => label.toLowerCase() === String(row.label ?? "").toLowerCase());
    const index = byLabel >= 0 ? byLabel : Number(row.value);
    if (index >= 0 && index < 4) probs[index] = Number(row.probability ?? 0);
  }
  return normalizeDistribution(probs);
}

function levelFromScore(score: number | undefined): Level {
  if (typeof score !== "number" || !Number.isFinite(score)) return "Missing";
  const index = Math.max(0, Math.min(3, Math.round(score)));
  return LEVEL_LABELS[index];
}

function oneHotLevel(level: Level): [number, number, number, number] {
  const probs: [number, number, number, number] = [0, 0, 0, 0];
  probs[LEVEL_LABELS.indexOf(level)] = 1;
  return probs;
}

function refused(req: RemoteRequirement): LocalScore {
  return {
    id: req.id,
    level: "Missing",
    probabilities: [1, 0, 0, 0],
    confidence: 0,
    matchType: "fallback",
    evidence: req.evidence.map(snippet => ({ ...snippet, matchType: "none" })),
    fallback: true,
  };
}
