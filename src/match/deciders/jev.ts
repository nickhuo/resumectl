// TypeSafe Jev (System One). Pinned to jev-1.14.0 — the jev-latest alias moves.
// One request per requirement so the state is only that requirement's evidence.
// A large state of unrelated résumé text hurts accuracy.
// https://docs.typesafe.ai/primitives/score
import { InputError } from "../../errors.ts";
import { levelFromDistribution, normalizeDistribution, type Level } from "../types.ts";
import type { DeciderCall, RemoteRequirement } from "./openai.ts";
import type { LocalScore } from "./none.ts";
import { postJson, type FetchLike } from "./http.ts";
import { JEV_MODEL, JEV_URL, LEVEL_CRITERIA, LEVEL_LABELS } from "./rubric.ts";

export interface JevOptions {
  apiKey?: string;
  model?: string;
  fetch?: FetchLike;
  env?: Record<string, string | undefined>;
}

export async function decideJev(reqs: RemoteRequirement[], options: JevOptions = {}): Promise<DeciderCall> {
  const env = options.env ?? process.env;
  const apiKey = options.apiKey ?? env.TYPESAFE_API_KEY;
  if (!apiKey) {
    throw new InputError("TYPESAFE_API_KEY is not set. Export it, pass --decider openai with OPENAI_API_KEY, or pass --decider none for offline exact/alias matching.");
  }
  const model = options.model || JEV_MODEL;
  const calls = await Promise.all(reqs.map(async req => {
    const body = {
      model,
      state: { requirement: req.text, terms: req.terms, evidence: req.evidence },
      questions: {
        coverage: {
          type: "score",
          instructions: "How well do the evidence quotes in state demonstrate the requirement? Use only this state. Empty evidence is the lowest level. Do not assume unstated experience.",
          criteria: [...LEVEL_CRITERIA],
        },
      },
    };
    const parsed = await postJson(JEV_URL, body, { Authorization: `Bearer ${apiKey}` }, options.fetch) as {
      answers?: { coverage?: { type?: string; score?: number; confidence?: number; probabilities?: Record<string, number> | number[] } };
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return { req, answer: parsed.answers?.coverage, usage: parsed.usage };
  }));
  let inputTokens = 0;
  let outputTokens = 0;
  let sawUsage = false;
  const rows = calls.map(({ req, answer, usage }): LocalScore => {
    if (usage) {
      sawUsage = true;
      inputTokens += usage.input_tokens ?? 0;
      outputTokens += usage.output_tokens ?? 0;
    }
    if (!answer || answer.type !== "score") return refused(req);
    const probs = jevProbabilities(answer.probabilities);
    const level = probs ? levelFromDistribution(probs) : levelFromScore(answer.score);
    return {
      id: req.id,
      level,
      probabilities: probs ?? oneHot(level),
      confidence: typeof answer.confidence === "number" ? answer.confidence : null,
      matchType: "model",
      evidence: req.evidence.map(snippet => ({ ...snippet, matchType: "none" as const })),
      fallback: false,
    };
  });
  return { rows, ...(sawUsage ? { usage: { inputTokens, outputTokens } } : {}) };
}

function jevProbabilities(raw: Record<string, number> | number[] | undefined): [number, number, number, number] | null {
  if (!raw) return null;
  const probs = [0, 0, 0, 0];
  if (Array.isArray(raw)) {
    for (let i = 0; i < 4; i++) probs[i] = Number(raw[i] ?? 0);
    return normalizeDistribution(probs);
  }
  for (let i = 0; i < 4; i++) probs[i] = Number(raw[String(i)] ?? 0);
  return normalizeDistribution(probs);
}

function levelFromScore(score: number | undefined): Level {
  if (typeof score !== "number" || !Number.isFinite(score)) return "Missing";
  return LEVEL_LABELS[Math.max(0, Math.min(3, Math.round(score)))];
}

function oneHot(level: Level): [number, number, number, number] {
  const probs: [number, number, number, number] = [0, 0, 0, 0];
  probs[LEVEL_LABELS.indexOf(level)] = 1;
  return probs;
}

function refused(req: RemoteRequirement): LocalScore {
  return {
    id: req.id, level: "Missing", probabilities: [1, 0, 0, 0], confidence: 0,
    matchType: "fallback", evidence: req.evidence.map(snippet => ({ ...snippet, matchType: "none" })), fallback: true,
  };
}
