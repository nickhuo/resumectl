import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "bun:test";
import { ExternalServiceError, InputError } from "../../src/errors.ts";
import { decideOpenAI } from "../../src/match/deciders/openai.ts";
import type { FetchLike } from "../../src/match/deciders/http.ts";
import { LEVEL_LABELS, OPENAI_DECISION_MODEL, OPENAI_DECISIONS_URL } from "../../src/match/deciders/rubric.ts";
import { runMatch } from "../../src/match/run.ts";

const root = await mkdtemp(join(tmpdir(), "resume-openai-"));
afterAll(() => rm(root, { recursive: true, force: true }));

const tex = String.raw`
\name{CASE EXAMPLE}
\basicInfo{case@example.com \sep (555) 010-0199 \sep Austin, TX}
\section{WORK EXPERIENCE}
\datedsubsection{\textbf{Example Co}}{Jan 2022 -- Jan 2024}
\datedline{\role{Software Engineer}}{Austin, TX}
\begin{itemize}
\item Built a Python service for CASE EXAMPLE that cut checkout latency 30\% and mailed case@example.com
\item Designed a PostgreSQL schema for orders
\end{itemize}
\section{SKILLS}
\resumeentry{Kubernetes}
`;
const yaml = `version: 1
requirements:
  - id: python
    text: Production Python
    kind: skill
    priority: required
    terms: [Python]
  - id: kubernetes
    text: Kubernetes
    kind: skill
    priority: required
    terms: [Kubernetes]
`;

function score(name: string, probabilities: number[]) {
  return {
    type: "score",
    name,
    score: 3,
    confidence: 0.8,
    probabilities: LEVEL_LABELS.map((label, value) => ({ value, label, probability: probabilities[value] })),
  };
}

test("the OpenAI client sends one score question per requirement and keeps evidence isolated", async () => {
  const texPath = join(root, "resume.tex");
  const jdPath = join(root, "jd.requirements.yaml");
  await Bun.write(texPath, tex);
  await Bun.write(jdPath, yaml);
  let body: { model?: string; input?: string; questions?: { name: string; type: string; instructions: string; levels: { label: string }[] }[] } = {};
  let auth = "";
  const fetchImpl: FetchLike = async (input, init) => {
    expect(String(input)).toBe(OPENAI_DECISIONS_URL);
    auth = String((init?.headers as Record<string, string>).Authorization);
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      model: OPENAI_DECISION_MODEL,
      answers: [score("python", [0, 0, 0.2, 0.8]), score("kubernetes", [0, 0.1, 0, 0.9])],
      usage: { input_tokens: 120, output_tokens: 0 },
    }), { status: 200 });
  };
  const report = await runMatch({
    texPath, jd: jdPath, cwd: root, decider: "openai", env: { OPENAI_API_KEY: "sk-test" }, fetch: fetchImpl,
  });
  expect(auth).toBe("Bearer sk-test");
  expect(JSON.stringify(body)).not.toContain("sk-test");
  expect(JSON.stringify(body)).not.toContain("case@example.com");
  expect(JSON.stringify(body)).not.toContain("CASE EXAMPLE");
  expect(body.model).toBe(OPENAI_DECISION_MODEL);
  expect(body.questions?.map(q => q.type)).toEqual(["score", "score"]);
  expect(body.questions?.map(q => q.levels.map(level => level.label))).toEqual([
    ["Missing", "Mentioned", "Partial", "Demonstrated"],
    ["Missing", "Mentioned", "Partial", "Demonstrated"],
  ]);
  const python = body.questions?.find(q => q.name === "python")?.instructions ?? "";
  const kubernetes = body.questions?.find(q => q.name === "kubernetes")?.instructions ?? "";
  expect(python).toContain("Python");
  expect(python).not.toContain("Kubernetes");
  expect(kubernetes).toContain("Kubernetes");
  expect(kubernetes).not.toContain("checkout latency");
  const py = report.requirements.find(row => row.id === "python")!;
  const k8s = report.requirements.find(row => row.id === "kubernetes")!;
  expect(py.level).toBe("Demonstrated");
  expect(py.probabilities[3]).toBeCloseTo(0.8);
  // The model said Demonstrated, but the term is only in the skills list.
  expect(k8s.level).toBe("Mentioned");
  expect(k8s.modelLevel).toBe("Demonstrated");
  expect(report.model).toBe(OPENAI_DECISION_MODEL);
  expect(report.calibration).toBe("uncalibrated");
  expect(report.usage).toEqual({ inputTokens: 120, outputTokens: 0 });
  expect(report.disclaimer).toContain("Not an ATS score");
});

test("a model score with no retrieved evidence does not count as coverage", async () => {
  const texPath = join(root, "empty-evidence.tex");
  const jdPath = join(root, "empty-evidence.yaml");
  await Bun.write(texPath, tex);
  await Bun.write(jdPath, `version: 1
requirements:
  - id: rust
    text: Rust services
    kind: skill
    priority: required
    terms: [Rust]
`);
  const report = await runMatch({
    texPath, jd: jdPath, cwd: root, decider: "openai", env: { OPENAI_API_KEY: "sk-test" },
    fetch: async () => new Response(JSON.stringify({
      answers: [score("rust", [0, 0, 0, 1])],
    }), { status: 200 }),
  });
  expect(report.requirements[0].level).toBe("Missing");
  expect(report.requirements[0].modelLevel).toBe("Demonstrated");
});

test("a refusal falls back to the local decider for that requirement only", async () => {
  const rows = await decideOpenAI([
    { id: "python", text: "Python", terms: ["Python"], evidence: [{ section: "WORK EXPERIENCE", quote: "Built a Python service that cut latency 30%" }] },
    { id: "rust", text: "Rust", terms: ["Rust"], evidence: [] },
  ], {
    apiKey: "sk-test",
    fetch: async () => new Response(JSON.stringify({
      answers: [score("python", [0, 0, 0, 1]), { type: "refusal", name: "rust" }],
    }), { status: 200 }),
  });
  expect(rows.rows[0].level).toBe("Demonstrated");
  expect(rows.rows[0].fallback).toBe(false);
  expect(rows.rows[1].fallback).toBe(true);
  const texPath = join(root, "refusal.tex");
  const jdPath = join(root, "refusal.yaml");
  await Bun.write(texPath, tex);
  await Bun.write(jdPath, yaml);
  const report = await runMatch({
    texPath, jd: jdPath, cwd: root, decider: "openai", env: { OPENAI_API_KEY: "sk-test" },
    fetch: async () => new Response(JSON.stringify({
      answers: [{ type: "refusal", name: "python" }, score("kubernetes", [0, 1, 0, 0])],
    }), { status: 200 }),
  });
  const python = report.requirements.find(row => row.id === "python")!;
  expect(python.fallback).toBe(true);
  expect(python.level).toBe("Demonstrated");
  expect(python.evidence[0].quote).toContain("Python");
});

test("missing API key and HTTP errors are explicit", async () => {
  await expect(decideOpenAI([], { env: {} })).rejects.toThrow(InputError);
  await expect(decideOpenAI(
    [{ id: "python", text: "Python", terms: ["Python"], evidence: [] }],
    { apiKey: "sk-test", fetch: async () => new Response("nope", { status: 500 }) },
  )).rejects.toThrow(ExternalServiceError);
});
