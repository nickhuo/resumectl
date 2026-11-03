import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "bun:test";
import { loadRequirements, validateRequirements } from "../../src/match/requirements.ts";

const root = await mkdtemp(join(tmpdir(), "resume-yaml-"));
afterAll(() => rm(root, { recursive: true, force: true }));

const valid = {
  version: 1,
  title: "Backend Engineer",
  requirements: [
    { id: "python", text: "Python", kind: "skill", priority: "required", terms: ["Python"] },
  ],
};

test("loads a requirements file", async () => {
  const path = join(root, "jd.requirements.yaml");
  await Bun.write(path, Bun.YAML.stringify(valid));
  const file = await loadRequirements(path);
  expect(file.requirements[0].terms).toEqual(["Python"]);
  expect(file.title).toBe("Backend Engineer");
});

test("rejects duplicate ids, bad kinds, and unknown fields", () => {
  expect(() => validateRequirements({
    requirements: [
      { id: "python", text: "Python", kind: "skill", priority: "required", terms: ["Python"] },
      { id: "python", text: "Again", kind: "skill", priority: "preferred", terms: ["Python"] },
    ],
  })).toThrow(/duplicate/);
  expect(() => validateRequirements({
    requirements: [{ id: "x", text: "X", kind: "magic", priority: "required", terms: ["X"] }],
  })).toThrow(/kind/);
  expect(() => validateRequirements({
    requirements: [{ id: "x", text: "X", kind: "skill", priority: "required", terms: ["X"], weight: 2 }],
  })).toThrow(/unknown field/);
  expect(() => validateRequirements({
    requirements: [{ id: "bad id", text: "X", kind: "skill", priority: "required", terms: ["X"] }],
  })).toThrow(/id/);
});
