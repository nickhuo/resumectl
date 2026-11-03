import { expect, test } from "bun:test";
import { decideNone } from "../../src/match/deciders/none.ts";
import { parseResume } from "../../src/match/resume.ts";
import type { Requirement } from "../../src/match/requirements.ts";

const resume = parseResume(await Bun.file(new URL("./fixtures/resume.tex", import.meta.url)).text());
const file = Bun.YAML.parse(await Bun.file(new URL("./fixtures/jd.requirements.yaml", import.meta.url)).text()) as {
  requirements: Requirement[];
};

test("exact, alias, skills-only, and missing requirements stay distinct", () => {
  const scored = file.requirements.filter(req => ["skill", "tool", "language"].includes(req.kind));
  const rows = Object.fromEntries(decideNone(resume, scored).map(row => [row.id, row]));
  expect(rows.python.level).toBe("Demonstrated");
  expect(rows.python.matchType).toBe("exact");
  expect(rows.python.evidence[0].quote).toContain("Python");
  expect(rows.postgresql.level).toBe("Partial");
  expect(rows.postgresql.matchType).toBe("exact");
  expect(rows.go.level).toBe("Mentioned");
  expect(rows.go.evidence[0].quote.toLowerCase()).toContain("go");
  expect(rows.graphql.level).toBe("Missing");
  expect(rows.graphql.evidence).toEqual([]);
});

test("an alias counts once and is not an exact term hit", () => {
  const [row] = decideNone(resume, [{
    id: "k8s", text: "Kubernetes", kind: "skill", priority: "required", terms: ["k8s"],
  }]);
  expect(row.level).toBe("Mentioned");
  expect(row.matchType).toBe("alias");
});

test("changing the name does not change local coverage", async () => {
  const renamed = parseResume((await Bun.file(new URL("./fixtures/resume.tex", import.meta.url)).text()).replace("CASE EXAMPLE", "OTHER PERSON"));
  const reqs = file.requirements.filter(req => req.kind === "skill");
  const left = decideNone(resume, reqs).map(row => [row.id, row.level, row.matchType]);
  const right = decideNone(renamed, reqs).map(row => [row.id, row.level, row.matchType]);
  expect(left).toEqual(right);
});

test("a title match on the current role can be Demonstrated", () => {
  const [row] = decideNone(resume, [{
    id: "title", text: "Software Engineer", kind: "title", priority: "required", terms: ["Software Engineer"],
  }]);
  expect(row.level).toBe("Demonstrated");
  expect(row.matchType).toBe("exact");
});
