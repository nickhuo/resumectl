import { afterAll, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = await mkdtemp(join(tmpdir(), "resume-doctor-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const cli = resolve(import.meta.dir, "../../src/cli.ts");
const run = (path: string) => Bun.spawnSync([process.execPath, cli, "doctor", "--json"], {
  cwd: root, env: { ...process.env, PATH: path, RESUMECTL_ENGINE: "" }, stdout: "pipe", stderr: "pipe",
});

test("doctor reports missing tools as dependency failures and keeps JSON parseable", () => {
  const result = run("");
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toBe("");
  const report = JSON.parse(result.stdout.toString());
  expect(report.pass).toBe(false);
  expect(report.checks.filter((c: { ok: boolean }) => !c.ok).map((c: { name: string }) => c.name)).toEqual(["TeX engine"]);
  expect(report.checks.find((c: { name: string }) => c.name === "TeX engine").fix).toContain("brew install tectonic");
});

test("doctor accepts Tectonic alone, without TeX Live package checks", async () => {
  const dir = join(root, "tectonic-only");
  const tectonic = join(dir, "tectonic");
  await Bun.write(tectonic, "#!/bin/sh\nexit 0\n");
  await chmod(tectonic, 0o755);
  const result = run(dir);
  expect(result.exitCode).toBe(0);
  const report = JSON.parse(result.stdout.toString());
  expect(report.checks.map((c: { name: string }) => c.name)).not.toContain("TeX dependencies");
  expect(report.checks.find((c: { name: string }) => c.name === "tectonic")).toMatchObject({ ok: true });
});

test("doctor detects a missing TeX package even when executables are present", async () => {
  const xelatex = join(root, "xelatex");
  const kpsewhich = join(root, "kpsewhich");
  await Bun.write(xelatex, '#!/bin/sh\nprintf "test XeTeX\\n"\n');
  await Bun.write(kpsewhich, '#!/bin/sh\nif [ "$1" = "titlesec.sty" ]; then exit 1; fi\nprintf "%s\\n" "$1"\n');
  await chmod(xelatex, 0o755);
  await chmod(kpsewhich, 0o755);
  const result = run(root);
  expect(result.exitCode).toBe(1);
  const report = JSON.parse(result.stdout.toString());
  const failed = report.checks.filter((c: { ok: boolean }) => !c.ok);
  expect(failed).toHaveLength(1);
  expect(failed[0]).toMatchObject({ name: "TeX dependencies", detail: "missing: titlesec.sty" });
  expect(failed[0].fix).toContain("tlmgr install");
});
