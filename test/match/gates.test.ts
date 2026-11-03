import { expect, test } from "bun:test";
import { evaluateHardGates } from "../../src/match/hard-gates.ts";
import { aggregateGrade } from "../../src/match/grade.ts";
import { gateRequirements, isHardGate, scoredRequirements, type Requirement } from "../../src/match/requirements.ts";
import { monthIndex, parseResume, totalWorkYears } from "../../src/match/resume.ts";

const tex = String.raw`
\name{CASE EXAMPLE}
\basicInfo{case@example.com \sep (555) 010-0199 \sep Austin, TX}
\section{WORK EXPERIENCE}
\datedsubsection{\textbf{Example Co}}{Jan 2020 -- Jan 2022}
\datedline{\role{Software Engineer}}{Austin, TX}
\begin{itemize}
\item Built a Python service that cut latency 30\%
\end{itemize}
\datedsubsection{\textbf{Overlap Co}}{Jun 2021 -- Jun 2023}
\datedline{\role{Engineer}}{Remote}
\begin{itemize}
\item Kept the overlap from double-counting years
\end{itemize}
\datedsubsection{\textbf{Undated Co}}{}
\datedline{\role{Consultant}}{Austin, TX}
\begin{itemize}
\item No dates on this role
\end{itemize}
\section{EDUCATION}
\datedsubsection{\textbf{State University}, B.S. in Computer Science}{Sep 2016 -- May 2020}
`;

const resume = parseResume(tex, new Date("2026-11-03T00:00:00Z"));

test("overlapping roles merge and undated roles are not counted", () => {
  const { years, unparsed } = totalWorkYears(resume.roles);
  expect(unparsed).toBe(1);
  // Jan 2020 through Jun 2023 inclusive = 42 months.
  expect(years).toBeCloseTo(3.5);
  expect(monthIndex(resume.roles[0].start!)).toBe(2020 * 12);
});

test("years, degree, location, and work authorization stay out of the grade", () => {
  const reqs: Requirement[] = [
    { id: "python", text: "Python", kind: "skill", priority: "required", terms: ["Python"], minYears: 5 },
    { id: "years", text: "3 years", kind: "years", priority: "required", terms: [], minYears: 3 },
    { id: "degree", text: "Bachelor or equivalent experience", kind: "education", priority: "required", terms: ["Bachelor"], level: "bachelor" },
    { id: "onsite", text: "Onsite in New York", kind: "location", priority: "required", terms: ["New York"] },
    { id: "auth", text: "US work authorization", kind: "work_authorization", priority: "required", terms: ["United States"] },
    { id: "license", text: "PE license", kind: "license", priority: "required", terms: ["PE license"] },
  ];
  expect(scoredRequirements(reqs).map(r => r.id)).toEqual(["python"]);
  expect(gateRequirements(reqs).map(r => r.id)).toEqual(["years", "degree", "onsite", "auth", "license", "python#years"]);
  expect(isHardGate(reqs[0])).toBe(false);
  const gates = evaluateHardGates(gateRequirements(reqs), resume, {
    workAuthorization: "Canadian citizen",
    location: "Austin, TX",
    willingToRelocate: true,
  });
  const byId = Object.fromEntries(gates.map(gate => [gate.id, gate]));
  expect(byId.years.level).toBe("Demonstrated");
  expect(byId["python#years"].level).toBe("Missing");
  expect(byId.degree.level).toBe("Demonstrated");
  expect(byId.onsite.level).toBe("Missing");
  expect(byId.onsite.detail).toContain("willing to relocate");
  expect(byId.auth.level).toBe("Missing");
  expect(byId.license.level).toBe("Missing");
  const grade = aggregateGrade([{ id: "python", priority: "required", level: "Demonstrated" }]);
  expect(grade.grade).toBe("A");
  expect(gates.some(gate => gate.level === "Missing")).toBe(true);
});

test("equivalent-experience wording is a partial gate, not a degree", () => {
  const noDegree = parseResume(String.raw`
\section{WORK EXPERIENCE}
\datedsubsection{\textbf{Co}}{Jan 2016 -- Jan 2022}
\datedline{\role{Engineer}}{Remote}
\begin{itemize}
\item Built services for six years
\end{itemize}
`);
  const [gate] = evaluateHardGates([
    { id: "degree", text: "Bachelor's degree or equivalent experience", kind: "education", priority: "required", terms: [], level: "bachelor" },
  ], noDegree);
  expect(gate.level).toBe("Partial");
  expect(gate.detail).toContain("heuristic");
});

test("remote-friendly locations pass when the profile is open to remote", () => {
  const [gate] = evaluateHardGates([
    { id: "where", text: "New York or remote", kind: "location", priority: "required", terms: ["New York", "remote"] },
  ], resume, { openToRemote: true });
  expect(gate.level).toBe("Demonstrated");
});
