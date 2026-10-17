import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { initProject, resolveConfig } from "../../src/index.ts";

const root = await mkdtemp(join(tmpdir(), "resume-init-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const cli = resolve(import.meta.dir, "../../src/cli.ts");
const run = (args: string[]) => Bun.spawnSync([process.execPath, cli, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });

for (const style of ["serif", "sans"] as const) {
  test(`init ${style}: creates a standalone project that builds and checks with default gates`, async () => {
    const result = run(["init", `${style} resume`, "--style", style, "--paper", "letter", "--json"]);
    expect(result.exitCode).toBe(0);
    const { texPath, configPath } = JSON.parse(result.stdout.toString());
    const { config } = await resolveConfig({ texPath });
    expect(config.layout.style).toBe(style);
    expect(config.layout.paper).toBe("letter");
    expect(config.sections["WORK EXPERIENCE"].editable).toBe(true);
    const yaml = await Bun.file(configPath).text();
    const schema = yaml.split("\n")[0].split("$schema=")[1];
    expect(await Bun.file(resolve(dirname(configPath), schema)).exists()).toBe(true);
    const build = run(["build", texPath, "--json"]);
    expect(build.stderr.toString()).toBe("");
    expect(build.exitCode).toBe(0);
    const report = JSON.parse(build.stdout.toString());
    expect(report.pass).toBe(true);
    expect(report.pages).toBe(1);
    expect(report.bullets[0].lines).toBeLessThanOrEqual(2);
    expect(run(["check", texPath, "--json"]).exitCode).toBe(0);
  });
}

test("init refuses existing source and either YAML filename without changing user files", async () => {
  for (const name of ["resume.tex", "resume.config.yaml", "resume.config.yml"]) {
    const dir = join(root, `existing-${name}`);
    await mkdir(dir);
    const path = join(dir, name);
    await Bun.write(path, "user content\n");
    await expect(initProject(dir)).rejects.toThrow("already exists");
    expect(await Bun.file(path).text()).toBe("user content\n");
    const other = name === "resume.tex" ? "resume.config.yaml" : "resume.tex";
    expect(await Bun.file(join(dir, other)).exists()).toBe(false);
  }
});

test("init and doctor reject unsupported arguments before doing work", async () => {
  for (const args of [
    ["init", "invalid", "--style", "comic"], ["init", "invalid", "--paper", "a3"],
    ["init", "invalid", "extra"], ["init", "invalid", "--out-dir", "output"],
    ["doctor", "resume.tex"], ["doctor", "--style", "sans"],
    ["config", "init", "extra"],
  ]) expect(run(args).exitCode).toBe(2);
  expect(await Bun.file(join(root, "invalid/resume.tex")).exists()).toBe(false);
});
