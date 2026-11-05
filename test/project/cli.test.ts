import { afterAll, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { COMMANDS } from "../../src/cli/commands.ts";
import { initProject } from "../../src/project/init.ts";
import { BuildError, InputError } from "../../src/index.ts";

const root = await realpath(await mkdtemp(join(tmpdir(), "resume-cli-")));
await mkdir(join(root, ".git")); // Stop config discovery without creating a config.
afterAll(() => rm(root, { recursive: true, force: true }));
const cli = resolve(import.meta.dir, "../../src/cli.ts");
function run(args: string[], cwd = root, env: NodeJS.ProcessEnv = process.env) {
  const p = Bun.spawnSync([process.execPath, cli, ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}
function errorDocument(result: ReturnType<typeof run>, code: number, reason: string, status = "error") {
  expect(result.code).toBe(code);
  expect(result.out).toBe("");
  expect(result.err.trim().split("\n")).toHaveLength(1);
  const doc = JSON.parse(result.err);
  expect(doc).toMatchObject({ status, reason, retryable: false });
  expect(typeof doc.message).toBe("string");
  expect(doc.message.length).toBeGreaterThan(0);
  return doc;
}

test("public error constructors retain optional messages and ErrorOptions", () => {
  const cause = new Error("original error");
  for (const ErrorType of [InputError, BuildError]) {
    expect(new ErrorType().message).toBe("");
    expect(new ErrorType("detail", { cause })).toMatchObject({ message: "detail", cause });
  }
});

for (const [path, command] of Object.entries(COMMANDS)) {
  const segments = path ? path.split(" ") : [];
  test(`help for ${path || "root"} works at every depth without config or build tools`, async () => {
    const env = { ...process.env, PATH: "", RESUMECTL_ENGINE: "xelatex" };
    const canonical = run([...segments, "--help"], root, env);
    expect(canonical.code).toBe(0);
    expect(canonical.err).toBe("");
    expect(canonical.out).toContain(command.usage);
    expect(canonical.out).toContain(command.summary);
    expect(canonical.out).toContain("Options\n");
    expect(canonical.out).toContain(command.example);
    for (const args of [["help", ...segments], [...segments, "-h"],
      [...segments, "--unknown", "--config", "missing.yaml", "--help"], [...segments, "--config", "--help"]]) {
      expect(run(args, root, env)).toEqual(canonical);
    }
    expect(await Bun.file(join(root, "resume.config.yaml")).exists()).toBe(false);
    expect(await Bun.file(join(root, "resume.tex")).exists()).toBe(false);
  });
}

test("bare root and config show help; version is a bare value at every depth", async () => {
  expect(run([])).toEqual(run(["--help"]));
  expect(run(["config"])).toEqual(run(["config", "--help"]));
  const { version } = await Bun.file(resolve(import.meta.dir, "../../package.json")).json();
  for (const path of [[], ["build"], ["config"], ["config", "init"], ["check"]]) {
    for (const flag of ["--version", "-v"]) expect(run([...path, flag, "--json"])).toEqual({ code: 0, out: `${version}\n`, err: "" });
  }
  expect(run(["--version", "--help"])).toEqual(run(["--help"]));
});

test("unknown paths identify the segment and the nearest valid help", () => {
  for (const [args, segment, recovery] of [
    [["bogus"], "bogus", "resumectl --help"],
    [["config", "bogus", "--help"], "bogus", "resumectl config --help"],
    [["help", "config", "bogus"], "bogus", "resumectl config --help"],
    [["help", "build", "bogus"], "bogus", "resumectl build --help"],
  ] as const) {
    const result = run([...args]);
    expect(result.code).toBe(2);
    expect(result.out).toBe("");
    expect(result.err).toContain(`unknown command "${segment}"`);
    expect(result.err).toContain(`Run ${recovery}.`);
    errorDocument(run([...args, "--json"]), 2, "unknown_command");
  }
});

test("commands reject options with no effect before reading input or creating files", async () => {
  for (const args of [
    ["--bogus"], ["config", "--style", "sans"],
    ["check", "missing.tex", "--keep-logs"], ["check", "missing.tex", "--no-keep-logs"],
    ["build", "missing.tex", "--pdf", "missing.pdf"], ["config", "show", "--pdf", "missing.pdf"],
    ["init", "should-not-exist", "--section", "SUMMARY"], ["doctor", "--max-pages", "1"],
  ]) errorDocument(run([...args, "--json"]), 2, "unknown_option");
  for (const args of [
    ["build", "missing.tex", "--keep-logs", "--no-keep-logs"],
    ["check", "missing.tex", "--pdf", "missing.pdf", "--out-dir", "elsewhere"],
  ]) errorDocument(run([...args, "--json"]), 2, "conflicting_options");
  errorDocument(run(["check", "one.tex", "extra.tex", "--json"]), 2, "unexpected_argument");
  errorDocument(run(["build", "--config", "--json"]), 2, "invalid_option");
  errorDocument(run(["config", "show", "--config=", "--json"]), 2, "invalid_option");
  expect(await Bun.file(join(root, "should-not-exist/resume.tex")).exists()).toBe(false);
});

test("-- ends discovery and does not turn positional values into switches", () => {
  const result = run(["build", "--", "--help", "--json"]);
  expect(result.code).toBe(2);
  expect(result.out).toBe("");
  expect(result.err).toStartWith("resumectl: ");
  expect(run(["config", "show", "--config=--json"]).err).toStartWith("resumectl: ");
});

test("missing inputs, invalid config and filesystem failures use one error document", async () => {
  for (const args of [["build"], ["check"], ["build", "missing.tex"], ["config", "show", "missing.tex"],
    ["config", "show", "--config", "missing.yaml"]]) {
    errorDocument(run([...args, "--json"]), 2, "missing_input", "action_required");
  }
  errorDocument(run(["config", "show", "--max-lines", "abc", "--json"]), 2, "invalid_input");
  await Bun.write(join(root, "not-a-directory"), "file");
  errorDocument(run(["init", "not-a-directory/child", "--json"]), 1, "operation_failed");
  const human = run(["build", "missing.tex"]);
  expect(human).toMatchObject({ code: 2, out: "" });
  expect(human.err).toContain("TeX source not found:");
  expect(human.err).toContain("Run resumectl build --help.");
});

test("configuration is readable for people and keeps its machine fields and overrides", async () => {
  const human = run(["config", "show", "--style", "sans", "--keep-logs"]);
  expect(human.code).toBe(0);
  expect(human.err).toBe("");
  expect(human.out).toContain("Configuration: defaults and documentclass (no YAML file)");
  expect(human.out).toContain("layout.style: sans  [override]");
  expect(human.out).toContain("build.keepLogs: true  [override]");
  const machine = run(["config", "show", "--style", "sans", "--keep-logs", "--json"]);
  expect(machine.err).toBe("");
  expect(JSON.parse(machine.out)).toMatchObject({ config: { layout: { style: "sans" }, build: { keepLogs: true } }, sources: { "layout.style": "override" } });
  const dir = join(root, "config-init");
  await mkdir(dir);
  const created = run(["config", "init", "--json"], dir);
  expect(created.code).toBe(0);
  expect(created.err).toBe("");
  expect(JSON.parse(created.out)).toMatchObject({ configPath: join(dir, "resume.config.yaml"), config: { version: 1 } });
});

test("passing and failing builds/checks separate requested reports from progress and next steps", async () => {
  for (const pass of [true, false]) {
    const project = await initProject(join(root, pass ? "passing" : "failing"));
    if (!pass) await Bun.write(project.texPath, (await Bun.file(project.texPath).text()).replace(/\\item [^\n]+/, String.raw`\item Short.`));
    for (const command of ["build", "check"]) {
      const args = [command, project.texPath, "--section", "WORK EXPERIENCE", "--max-lines", "3", "--max-pages", "2"];
      const human = run(args);
      expect(human.code).toBe(pass ? 0 : 1);
      expect(human.out).toStartWith("Gate 1");
      expect(human.out).toContain(pass ? "OK — all gates passed." : "FAIL — quality gates failed.");
      expect(human.out).not.toContain("[1/2]");
      expect(human.out).not.toContain("resumectl: built");
      expect(human.out).not.toContain("then run");
      if (command === "build") {
        expect(human.err).toContain("[1/2]");
        expect(human.err).toContain("[2/2]");
      }
      if (pass && command === "check") expect(human.err).toBe("");
      if (!pass) expect(human.err).toContain(`then run resumectl build ${project.texPath} --section 'WORK EXPERIENCE' --max-lines 3 --max-pages 2.`);
      const machine = run([...args, "--json"]);
      expect(machine.code).toBe(pass ? 0 : 1);
      expect(machine.err).toBe("");
      expect(JSON.parse(machine.out)).toMatchObject({ pdf: join(project.directory, "output/resume.pdf"), pass, config: { version: 1 }, sources: {}, sections: [{}] });
    }
  }
});

test("missing executables exit 1 while missing files exit 2, in both formats", async () => {
  const { texPath } = await initProject(join(root, "dependencies"));
  for (const engine of ["", "xelatex", "tectonic"]) {
    const env = { ...process.env, PATH: "", RESUMECTL_ENGINE: engine };
    errorDocument(run(["build", texPath, "--json"], root, env), 1, "dependency_missing");
    const human = run(["build", texPath], root, env);
    expect(human).toMatchObject({ code: 1, out: "" });
    expect(human.err).toContain("Run resumectl doctor.");
  }
  const missing = run(["check", texPath, "--style", "sans", "--json"]);
  const doc = errorDocument(missing, 2, "missing_input", "action_required");
  expect(doc.message).toContain(`Run resumectl build ${texPath} --style sans.`);
  const doctor = run(["doctor", "--json"], root, { ...process.env, PATH: "", RESUMECTL_ENGINE: "" });
  expect(doctor).toMatchObject({ code: 1, err: "" });
  expect(JSON.parse(doctor.out).pass).toBe(false);
});

test("compiler failures emit no result and escape multiline diagnostics into one JSON line", async () => {
  const project = await initProject(join(root, "broken"));
  await Bun.write(project.texPath, (await Bun.file(project.texPath).text()).replace("\\begin{document}", "\\begin{document}\n\\ThisCommandDoesNotExist"));
  const doc = errorDocument(run(["build", project.texPath, "--json"]), 1, "compile_failed");
  expect(doc.message).toContain("failed");
  const human = run(["build", project.texPath]);
  expect(human).toMatchObject({ code: 1, out: "" });
  expect(human.err).toContain("failed");
});

test("init and doctor put human recovery on stderr; missing manifests name an exact rebuild", async () => {
  const initialized = run(["init", "human project"]);
  expect(initialized.code).toBe(0);
  expect(initialized.out).toStartWith("Created ");
  expect(initialized.out).not.toContain("then run");
  expect(initialized.err).toContain("then run resumectl build '");
  const doctor = run(["doctor"], root, { ...process.env, PATH: "", RESUMECTL_ENGINE: "" });
  expect(doctor.code).toBe(1);
  expect(doctor.out).toContain("FAIL TeX engine:");
  expect(doctor.out).not.toContain("brew install");
  expect(doctor.err).toContain("brew install tectonic");
  const project = await initProject(join(root, "missing-manifest"));
  const built = run(["build", project.texPath, "--json"]);
  expect(built.code).toBe(0);
  const { pdf } = JSON.parse(built.out);
  await rm(pdf.replace(/\.pdf$/, ".resumectl.json"));
  const doc = errorDocument(run(["check", project.texPath, "--json"]), 2, "missing_input", "action_required");
  expect(doc.message).toContain(`Run resumectl build ${project.texPath}.`);
});

for (const target of ["child", "parent", "group", "ignores-interrupt"] as const) {
  test(`SIGINT during compile (${target}) exits 130 without a success claim`, async () => {
    const dir = join(root, `signal-${target}`);
    await mkdir(dir);
    const ready = join(dir, "ready");
    await Bun.write(join(dir, "resume.tex"), String.raw`\documentclass{resume}`);
    const engine = join(dir, "xelatex");
    await Bun.write(engine, `#!/bin/sh\n${target === "ignores-interrupt" ? "trap '' INT\n" : ""}printf '%s' "$$" > "$SIGNAL_READY"\nexec /bin/sleep 15\n`);
    await chmod(engine, 0o755);
    const child = spawn(process.execPath, [cli, "build", join(dir, "resume.tex"), "--json"], {
      detached: true, env: { ...process.env, PATH: dir, RESUMECTL_ENGINE: "xelatex", SIGNAL_READY: ready },
    });
    let out = "", err = "";
    child.stdout!.on("data", data => out += data);
    child.stderr!.on("data", data => err += data);
    const done = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code, signal) => resolve({ code, signal }));
    });
    let enginePid: number | undefined;
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      if (enginePid && enginePid > 1) { try { process.kill(enginePid, "SIGKILL"); } catch {} }
    }, 5_000);
    try {
      const deadline = Date.now() + 3_000;
      while (!await Bun.file(ready).exists() && Date.now() < deadline) await Bun.sleep(10);
      expect(await Bun.file(ready).exists()).toBe(true);
      enginePid = Number(await Bun.file(ready).text());
      expect(enginePid).toBeGreaterThan(1);
      expect(child.pid).toBeGreaterThan(1);
      process.kill(target === "child" ? enginePid : target === "group" ? -child.pid! : child.pid!, "SIGINT");
      const result = await done;
      expect(result).toEqual({ code: 130, signal: null });
      errorDocument({ code: result.code!, out, err }, 130, "interrupted");
      expect(err).toContain("no quality report is available");
      expect(await Bun.file(join(dir, "resume.pdf")).exists()).toBe(false);
      expect(await Bun.file(join(dir, "resume.resumectl.json")).exists()).toBe(false);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        if (enginePid && enginePid > 1) { try { process.kill(enginePid, "SIGKILL"); } catch {} }
      }
      await done;
      clearTimeout(timeout);
    }
  }, 10_000);
}

test("every command's help example executes successfully in a fresh project", async () => {
  const dir = join(root, "help-examples");
  await mkdir(dir);
  for (const command of Object.values(COMMANDS)) {
    const result = run(command.example.split(" ").slice(1), dir);
    expect({ example: command.example, ...result }).toMatchObject({ code: 0 });
  }
});
