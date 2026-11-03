import { expect, test } from "bun:test";
import { capSkillsOnly, stuffingFindings, type ScoredRow } from "../../src/match/stuffing.ts";
import { parseResume } from "../../src/match/resume.ts";
import type { Requirement } from "../../src/match/requirements.ts";
import { oneHot } from "../../src/match/types.ts";

const resume = parseResume(String.raw`
\name{CASE EXAMPLE}
\basicInfo{case@example.com \sep (555) 010-0199 \sep Austin, TX}
\section{WORK EXPERIENCE}
\datedsubsection{\textbf{Example Co}}{Jan 2022 -- Jan 2024}
\datedline{\role{Software Engineer}}{Austin, TX}
\begin{itemize}
\item Built a Python service that cut checkout latency 30\% for 2M requests
\end{itemize}
\section{SKILLS}
\resumeentry{Python, Kubernetes, Kubernetes, Kubernetes, Kubernetes, Kubernetes, Kubernetes, Kubernetes}
`);

function req(id: string, terms: string[], kind: Requirement["kind"] = "skill"): Requirement {
  return { id, text: id, kind, priority: "required", terms };
}

function scored(id: string, level: ScoredRow["level"]): ScoredRow {
  return { id, level, probabilities: oneHot(level), evidence: [] };
}

test("JD 8-gram overlap, repetition, and skills-only terms are flagged", () => {
  const jd = "the posting says built python service that cut checkout latency 30 for clients";
  const findings = stuffingFindings(
    resume,
    jd,
    [req("python", ["Python"]), req("kubernetes", ["Kubernetes"])],
    [scored("python", "Demonstrated"), scored("kubernetes", "Mentioned")],
  );
  expect(findings.map(f => f.kind)).toContain("jd_paste");
  expect(findings.some(f => f.kind === "repetition" && f.requirementId === "kubernetes")).toBe(true);
  expect(findings.some(f => f.kind === "skills_without_evidence" && f.requirementId === "kubernetes")).toBe(true);
  expect(findings.some(f => f.requirementId === "python" && f.kind === "skills_without_evidence")).toBe(false);
});

test("skills-list-only coverage is capped at Mentioned", () => {
  const [row] = capSkillsOnly(resume, [req("kubernetes", ["Kubernetes"])], [scored("kubernetes", "Demonstrated")]);
  expect(row.level).toBe("Mentioned");
  expect(row.modelLevel).toBe("Demonstrated");
  expect(row.probabilities).toEqual([0, 1, 0, 0]);
});

test("facts that do not mention a claimed term are unbacked", () => {
  const findings = stuffingFindings(
    resume,
    null,
    [req("python", ["Python"])],
    [scored("python", "Demonstrated")],
    ["Unrelated fact about writing documentation"],
  );
  expect(findings.map(f => f.kind)).toEqual(["unbacked"]);
});

test("a clean résumé with no posting text has no stuffing findings", () => {
  const findings = stuffingFindings(resume, null, [req("python", ["Python"])], [scored("python", "Demonstrated")]);
  expect(findings).toEqual([]);
});
