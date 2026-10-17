import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { resolveConfig, validateConfig } from "../../src/project/config.ts";

const root = await mkdtemp(join(tmpdir(), "resume-config-test-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const cli = resolve(import.meta.dir, "../../src/cli.ts");
function run(args: string[], cwd = root) {
  return Bun.spawnSync([process.execPath, cli, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
}

// Real nested files exercise discovery, path bases and per-field merging.
describe("YAML config", () => {
  test("CLI > YAML > documentclass > defaults, with nested merge and correct relative paths", async () => {
    const dir = join(root, "precedence");
    await mkdir(join(dir, "src"), { recursive: true });
    await Bun.write(join(dir, "resume.config.yaml"), `version: 1
layout:
  paper: letter
  scale: 0.9
  margins:
    left: 0.5in
checks:
  bullets:
    minLastLineFill: 0.85 # comments are supported
build:
  outDir: output
  keepLogs: true
`);
    const texPath = join(dir, "src/resume.tex");
    await Bun.write(texPath, String.raw`\documentclass[style=sans,scale=0.8]{resume}`);
    const r = await resolveConfig({ texPath, cwd: root, overrides: { layout: { scale: 0.95 }, build: { keepLogs: false } } });
    expect(r.config.layout).toMatchObject({ style: "sans", paper: "letter", scale: 0.95, margins: { left: "0.5in", right: "0.35in" }, sectionSpacing: { before: "*2", after: "*0.8" } });
    expect(r.config.checks.bullets).toEqual({ maxLines: 2, minLastLineFill: 0.85 });
    expect(r.config.build).toEqual({ outDir: join(dir, "output"), keepLogs: false });
    expect(r.sources["layout.style"]).toBe("documentclass");
    expect(r.sources["layout.scale"]).toBe("override");
    expect(r.sources["layout.paper"]).toBe(join(dir, "resume.config.yaml"));
    const overridden = await resolveConfig({ texPath, cwd: root, overrides: { build: { outDir: "elsewhere" } } });
    expect(overridden.config.build.outDir).toBe(join(root, "elsewhere"));
  });

  test("reports invalid fields, numeric ranges, dimensions and malformed YAML", async () => {
    for (const bad of [
      { layout: { typo: 1 } }, { checks: { minChars: 110 } },
      { checks: { bullets: { maxLines: 0 } } }, { checks: { bullets: { maxLines: 1.5 } } },
      { checks: { bullets: { minLastLineFill: 1.1 } } }, { checks: { maxPages: "1" } },
      { layout: { style: "unknown" } }, { layout: { scale: NaN } },
      { layout: { margins: { left: "-1in" } } }, { layout: { margins: { left: String.raw`1in}\input{secret}` } } },
      { build: { keepLogs: "false" } }, { version: 2 }, [],
    ]) expect(() => validateConfig(bad)).toThrow();
    const path = join(root, "bad.yaml");
    await Bun.write(path, "checks: [\n");
    await expect(resolveConfig({ configPath: path })).rejects.toThrow(path);
    await expect(resolveConfig({ configPath: join(root, "missing.yaml") })).rejects.toThrow("config not found");
    await expect(resolveConfig({ configPath: null, overrides: { layout: { margins: { left: "9in" } } } })).rejects.toThrow("no printable area");
  });

  test("supports yml but requires a choice if both filenames exist", async () => {
    const dir = join(root, "ambiguous");
    await mkdir(dir);
    await Bun.write(join(dir, "resume.config.yml"), "checks: { maxPages: 2 }\n");
    expect((await resolveConfig({ cwd: dir })).config.checks.maxPages).toBe(2);
    await Bun.write(join(dir, "resume.config.yaml"), "version: 1\n");
    await expect(resolveConfig({ cwd: dir })).rejects.toThrow("both resume.config.yaml");
    expect((await resolveConfig({ configPath: join(dir, "resume.config.yml") })).config.checks.maxPages).toBe(2);
  });

  test("section policies inherit defaults, preserve literal names and honor CLI overrides", async () => {
    const path = join(root, "sections.yaml");
    await Bun.write(path, `checks:
  bullets: { maxLines: 2, minLastLineFill: 0.8 }
sections:
  work experience:
    editable: true
    checks: { maxLines: 1 }
  R&D. PROJECTS:
    checks: { minLastLineFill: 0.5 }
  EDUCATION:
    editable: false
    checks: false
`);
    const r = await resolveConfig({ configPath: path });
    expect(r.config.sections["WORK EXPERIENCE"]).toEqual({ editable: true, checks: { maxLines: 1, minLastLineFill: 0.8 } });
    expect(r.config.sections["R&D. PROJECTS"]).toEqual({ editable: false, checks: { maxLines: 2, minLastLineFill: 0.5 } });
    expect(r.config.sections.EDUCATION.checks).toBe(false);
    expect(r.sources["sections.WORK EXPERIENCE.checks.minLastLineFill"]).toBe(path);
    const overridden = await resolveConfig({ configPath: path, overrides: {
      checks: { bullets: { maxLines: 3 } },
      sections: { " Work   Experience ": { checks: { minLastLineFill: 0.7 } } },
    } });
    expect(overridden.config.sections["WORK EXPERIENCE"].checks).toEqual({ maxLines: 3, minLastLineFill: 0.7 });
    expect(overridden.config.sections.EDUCATION.checks).toBe(false);
    expect(overridden.sources["sections.WORK EXPERIENCE.checks.maxLines"]).toBe("override");
    for (const sections of [
      { "WORK EXPERIENCE": {}, "work  experience": {} },
      { "": {} }, { SUMMARY: { editable: "yes" } }, { SUMMARY: { checks: true } },
      { SUMMARY: { checks: { maxLines: 0 } } }, { SUMMARY: { checks: { minLastLineFill: -0.1 } } },
      { SUMMARY: { unknown: 1 } }, JSON.parse('{"__proto__": {}}'),
    ]) expect(() => validateConfig({ sections })).toThrow();
  });

  test("discovery stops at a repository boundary", async () => {
    const dir = join(root, "repo-parent");
    await mkdir(join(dir, "child/.git"), { recursive: true });
    await Bun.write(join(dir, "resume.config.yaml"), "checks: { maxPages: 2 }\n");
    expect((await resolveConfig({ cwd: join(dir, "child") })).configPath).toBeUndefined();
  });

  test("init creates valid YAML with schema, never overwrites; show explains effective config", async () => {
    const dir = join(root, "init");
    await mkdir(dir);
    expect(run(["config", "init"], dir).exitCode).toBe(0);
    const path = join(dir, "resume.config.yaml");
    const before = await Bun.file(path).text();
    expect(before).toContain("# yaml-language-server: $schema=");
    expect(validateConfig(Bun.YAML.parse(before)).checks?.bullets?.maxLines).toBe(2);
    expect(run(["config", "init"], dir).exitCode).toBe(2);
    expect(await Bun.file(path).text()).toBe(before);
    const shown = run(["config", "show", "--json"], dir);
    expect(shown.exitCode).toBe(0);
    expect(JSON.parse(shown.stdout.toString()).config.checks.bullets.minLastLineFill).toBe(0.8);
    expect(run(["config", "show", "--max-lines", "0"], dir).exitCode).toBe(2);
    expect(run(["build", "--bogus"], dir).exitCode).toBe(2);
  });
});
