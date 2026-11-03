import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { runMatch } from "../../src/match/run.ts";
import { aggregateGrade } from "../../src/match/grade.ts";

const dir = resolve(import.meta.dir, "fixtures");
const cli = resolve(import.meta.dir, "../../src/cli.ts");
const run = (args: string[]) => Bun.spawnSync([process.execPath, cli, ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });

test("fixture: met, partial, mentioned, and a failed hard gate", async () => {
  const report = await runMatch({
    texPath: "resume.tex",
    jd: "jd.requirements.yaml",
    profilePath: "facts.yaml",
    decider: "none",
    cwd: dir,
    now: new Date("2026-11-03T00:00:00Z"),
  });
  const level = Object.fromEntries(report.requirements.map(row => [row.id, row.level]));
  expect(level).toEqual({ python: "Demonstrated", postgresql: "Partial", go: "Mentioned", graphql: "Missing" });
  expect(report.requirements.map(row => row.id)).not.toContain("onsite-nyc");
  const gates = Object.fromEntries(report.hardGates.map(gate => [gate.id, gate.level]));
  expect(gates["work-auth"]).toBe("Demonstrated");
  expect(gates.years).toBe("Demonstrated");
  expect(gates.degree).toBe("Demonstrated");
  expect(gates["onsite-nyc"]).toBe("Missing");
  const graded = aggregateGrade(report.requirements.map(row => ({
    id: row.id, priority: row.priority, level: row.level, probabilities: row.probabilities,
  })));
  expect(report.grade).toBe("C");
  expect(report.grade).toBe(graded.grade);
  expect(report.gradeCapped).toBe(false);
  expect(report.stuffing.map(item => item.kind).sort()).toEqual(["skills_without_evidence", "unbacked"]);
  expect(report.gaps.map(gap => `${gap.type}:${gap.requirementId ?? ""}`)).toEqual([
    "placement:go",
    "missing evidence:postgresql",
    "knockout:onsite-nyc",
    "missing evidence:graphql",
  ]);
  expect(report.disclaimer).toContain("Not an ATS score");
  expect(report.calibration).toBe("uncalibrated");
  expect(report.resume.textSource).toBe("tex");
});

test("CLI help, JSON, and --fail-under", () => {
  const help = run(["match", "--help"]);
  expect(help.exitCode).toBe(0);
  expect(help.stdout.toString()).toContain("not an ATS score");
  expect(help.stdout.toString().toLowerCase()).not.toContain("your ats score");
  const ok = run(["match", "resume.tex", "--jd", "jd.requirements.yaml", "--profile", "facts.yaml", "--decider", "none", "--json"]);
  expect(ok.exitCode).toBe(0);
  expect(ok.stderr.toString()).toBe("");
  const report = JSON.parse(ok.stdout.toString());
  expect(report.grade).toBe("C");
  expect(report.decider).toBe("none");
  const below = run(["match", "resume.tex", "--jd", "jd.requirements.yaml", "--profile", "facts.yaml", "--decider", "none", "--fail-under", "B", "--json"]);
  expect(below.exitCode).toBe(1);
  expect(JSON.parse(below.stdout.toString()).grade).toBe("C");
  const met = run(["match", "resume.tex", "--jd", "jd.requirements.yaml", "--profile", "facts.yaml", "--decider", "none", "--fail-under", "C"]);
  expect(met.exitCode).toBe(0);
  expect(run(["match", "resume.tex"]).exitCode).toBe(2);
  expect(run(["build", "resume.tex", "--jd", "jd.requirements.yaml"]).exitCode).toBe(2);
});
