import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { compile, cleanIntermediates } from "../../src/rendering/compile.ts";
import { resolveConfig } from "../../src/project/config.ts";
import { formatReport, runGates } from "../../src/quality/gates.ts";
import { manifestPath } from "../../src/rendering/measurements.ts";

const root = await mkdtemp(join(tmpdir(), "resume-render-test-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const cli = resolve(import.meta.dir, "../../src/cli.ts");
const sentence = String.raw`Built a tool-calling agent runtime with retries and idempotent steps, raising end-to-end task success from 61\% to 84\%`;
const document = (items: string[], extra = "") => String.raw`\documentclass{resume}
\begin{document}
\section{WORK EXPERIENCE}
\begin{itemize}
` + items.map(t => String.raw`\item ` + t).join("\n") + String.raw`
\end{itemize}
` + extra + String.raw`
\end{document}
`;
function cliRun(args: string[], cwd = root) {
  return Bun.spawnSync([process.execPath, cli, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
}

for (const style of ["serif", "sans"]) {
  test(`${style} example: actual 14 bullets, one page, all gates pass; check survives log cleanup`, async () => {
    const tex = resolve(import.meta.dir, `../../examples/${style}.tex`);
    const { pdfPath } = await compile(tex, join(root, style));
    await cleanIntermediates(pdfPath);
    const report = await runGates(tex, pdfPath);
    expect(report.pass).toBe(true);
    expect(report.pages).toBe(1);
    expect(report.bullets).toHaveLength(14);
    expect(report.bullets.every(b => b.lines === 1 && b.lastLineFill > 0.9)).toBe(true);
    expect(await Bun.file(manifestPath(pdfPath)).exists()).toBe(true);
    expect(await Bun.file(pdfPath.replace(/pdf$/, "log")).exists()).toBe(false);
    const { config } = await resolveConfig({ texPath: tex });
    const all = await runGates(tex, pdfPath, { ...config.checks, sections: config.sections }, config.layout);
    expect(all.pass).toBe(true);
    expect(all.sections.map(s => [s.section, s.bullets.length])).toEqual([
      ["SUMMARY", 1], ["EDUCATION", 2], ["WORK EXPERIENCE", 14], ["PROJECTS", 3], ["TALKS & AWARDS", 3], ["SKILLS", 4],
    ]);
    expect(all.bullets.every(b => b.text.length > 0)).toBe(true);
    expect(all.sections.find(s => s.section === "SKILLS")!.editable).toBe(false);
  });
}

test.skipIf(!Bun.which("tectonic") || !Bun.which("xelatex"))("tectonic renders the sans example with the same measurements as xelatex", async () => {
  const tex = resolve(import.meta.dir, "../../examples/sans.tex");
  const built = async (engine: string) => {
    process.env.RESUMECTL_ENGINE = engine;
    try {
      const { manifestPath: path } = await compile(tex, join(root, `engine-${engine}`));
      return (await Bun.file(path).json()).bullets;
    } finally { delete process.env.RESUMECTL_ENGINE; }
  };
  const tectonic = await built("tectonic");
  expect(tectonic).toHaveLength(27);
  expect(tectonic).toEqual(await built("xelatex"));
}, 300_000); // a cold Tectonic cache downloads ~45 MB

test("actual wrapping: short/full single lines, sparse/full second lines, three lines and manual breaks", async () => {
  const tex = join(root, "wrapping.tex");
  await Bun.write(tex, document([
    "A short bullet.", sentence, `${sentence} Additional scope and context.`,
    `${sentence}. ${sentence}`, `${sentence}. ${sentence}. ${sentence}`,
    `${sentence}\\\\${sentence}`, `${sentence}\n\n${sentence}`,
    String.raw`\textbf{Built} a tool-calling agent runtime with retries and idempotent steps, raising end-to-end task success from \href{https://example.com}{61\% to 84\%}`,
  ]));
  const { pdfPath } = await compile(tex);
  const r = await runGates(tex, pdfPath);
  expect(r.bullets.map(b => b.lines)).toEqual([1, 1, 2, 2, 3, 2, 2, 1]);
  expect(r.bullets.map(b => b.status)).toEqual(["sparse-last-line", "ok", "sparse-last-line", "ok", "too-many-lines", "ok", "ok", "ok"]);
  expect(r.pass).toBe(false);
  expect(r.bullets[0].lastLineFill).toBeLessThan(0.2);
  expect(r.bullets[3].lastLineFill).toBeGreaterThan(0.9);
  // Changing only checking policy needs no rebuild.
  expect((await runGates(tex, pdfPath, { bullets: { minLastLineFill: 0, maxLines: 3 } })).pass).toBe(true);
});

test("independent section rules, prose and table-cell wrapping, disabled checks and CLI selection", async () => {
  const tex = join(root, "sections.tex");
  await Bun.write(tex, document([sentence], String.raw`
\section{SUMMARY}
\resumeentry{A short summary.}
\section{R\&D. PROJECTS}
\begin{tabularx}{\textwidth}{@{}p{0.5\textwidth} X@{}}
\textbf{Project} & \resumeentry{` + sentence + String.raw`} \\
\textbf{Second} & \resumeentry{Brief description.} \\
\end{tabularx}
\section{EDUCATION}
\begin{plainlist}\item Degree and GPA.\end{plainlist}
`));
  const configPath = join(root, "section-policies.yaml");
  await Bun.write(configPath, `checks:
  bullets: { maxLines: 2, minLastLineFill: 0.8 }
sections:
  WORK EXPERIENCE: { editable: true }
  SUMMARY: { editable: true, checks: { maxLines: 1, minLastLineFill: 0.8 } }
  R&D. PROJECTS: { editable: true, checks: { maxLines: 1, minLastLineFill: 0 } }
  EDUCATION: { editable: false, checks: false }
`);
  const { config } = await resolveConfig({ texPath: tex, configPath });
  const { pdfPath } = await compile(tex, { layout: config.layout });
  const report = await runGates(tex, pdfPath, { ...config.checks, sections: config.sections });
  expect(report.pass).toBe(false);
  expect(report.sections.map(s => s.pass)).toEqual([true, false, false, true]);
  expect(report.sections[1].bullets[0]).toMatchObject({ text: "A short summary.", lines: 1, status: "sparse-last-line" });
  expect(report.sections[2].bullets).toHaveLength(2); // tabularx trial passes must not duplicate entries
  const project = report.sections[2].bullets[0];
  expect(project.lines).toBeGreaterThan(1);
  expect(project.status).toBe("too-many-lines");
  expect(project.lineWidthPt).toBeLessThan(report.sections[1].bullets[0].lineWidthPt * 0.5);
  expect(project.text).toContain("Built a tool-calling agent runtime");
  expect(formatReport(report)).toContain("SPARSE-LAST-LINE SUMMARY #1");
  expect(formatReport(report)).toContain("TOO-MANY-LINES R&D. PROJECTS #1");
  expect(formatReport(report)).toContain("EDUCATION: SKIP");
  const readOnly = await runGates(tex, pdfPath, { sections: { SUMMARY: { editable: false } } });
  expect(readOnly.sections[0].editable).toBe(false);
  expect(readOnly.pass).toBe(false); // Editing permission never suppresses length checks.
  const selected = cliRun(["check", tex, "--config", configPath, "--section", "summary", "--min-last-line-fill", "0", "--json"]);
  expect(selected.exitCode).toBe(0);
  const json = JSON.parse(selected.stdout.toString());
  expect(json.sections).toHaveLength(1);
  expect(json.sections[0]).toMatchObject({ section: "SUMMARY", editable: true, checks: { maxLines: 1, minLastLineFill: 0 } });
  const all = cliRun(["check", tex, "--config", configPath, "--max-lines", "5", "--min-last-line-fill", "0", "--json"]);
  expect(all.exitCode).toBe(0);
  expect(JSON.parse(all.stdout.toString()).sections).toHaveLength(4);
  await expect(runGates(tex, pdfPath, { sections: { MISSING: {} } })).rejects.toThrow("no rendered bullets or entries");
});

test("paper, margins and indentation change the measured available width", async () => {
  const tex = join(root, "geometry.tex");
  await Bun.write(tex, document([sentence]));
  const base = await compile(tex, join(root, "geometry-base"));
  const a = (await runGates(tex, base.pdfPath)).bullets[0];
  const resolved = await resolveConfig({ texPath: tex, overrides: { layout: { paper: "letter", margins: { left: "1in", right: "1in" }, bulletIndent: "24pt", sectionSpacing: { before: "2ex", after: "1ex" } } } });
  const changed = await compile(tex, { layout: resolved.config.layout, outDir: join(root, "geometry-changed") });
  const b = (await runGates(tex, changed.pdfPath)).bullets[0];
  expect(b.lineWidthPt).toBeCloseTo(8.5 * 72.27 - 2 * 72.27 - 24, 1);
  expect(b.lineWidthPt).toBeLessThan(a.lineWidthPt);
  expect(b.lines).toBe(2);
  expect(b.status).toBe("sparse-last-line");
});

test("CLI style override changes the font actually compiled; explicit YAML wins over discovered config", async () => {
  const tex = join(root, "override.tex");
  await Bun.write(tex, document([sentence]));
  const configPath = join(root, "explicit.yaml");
  await Bun.write(configPath, "layout:\n  style: serif\n  scale: 0.7\nbuild:\n  outDir: explicit-output\n  keepLogs: true\n");
  const discovered = join(root, "resume.config.yaml");
  await Bun.write(discovered, "invalid: config\n");
  try {
    const result = cliRun(["build", tex, "--config", configPath, "--style", "sans", "--min-last-line-fill", "0", "--json"]);
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout.toString());
    expect(report.layout.style).toBe("sans");
    expect(report.config.layout.scale).toBe(0.7);
    expect(report.sources["layout.style"]).toBe("override");
    expect(await Bun.file(report.pdf.replace(/pdf$/, "log")).text()).toContain("Inter");
    expect(cliRun(["check", tex, "--config", configPath, "--style", "sans", "--min-last-line-fill", "0", "--json"]).exitCode).toBe(0);
    const mismatch = cliRun(["check", tex, "--config", configPath, "--json"]);
    expect(mismatch.exitCode).toBe(2);
    expect(mismatch.stderr.toString()).toContain("layout config differs");
  } finally { await rm(discovered); }
});

test("stale source, missing metadata and changed PDF cannot pass checks", async () => {
  const tex = join(root, "stale.tex");
  const source = document([sentence]);
  await Bun.write(tex, source);
  const { pdfPath } = await compile(tex);
  await Bun.write(tex, source.replace("Built", "Created"));
  await expect(runGates(tex, pdfPath)).rejects.toThrow("no longer match");
  await Bun.write(tex, source);
  const originalPdf = await Bun.file(pdfPath).bytes();
  await Bun.write(pdfPath, new Uint8Array([...originalPdf, 32]));
  await expect(runGates(tex, pdfPath)).rejects.toThrow("no longer match");
  await Bun.write(pdfPath, originalPdf);
  await rm(manifestPath(pdfPath));
  await expect(runGates(tex, pdfPath)).rejects.toThrow("run resumectl build first");
});

test("overflow is rejected even when it is on an earlier line", async () => {
  const tex = join(root, "overflow.tex");
  await Bun.write(tex, document([String.raw`\mbox{` + "W".repeat(160) + String.raw`}\\` + sentence]));
  const { pdfPath } = await compile(tex);
  const r = await runGates(tex, pdfPath);
  expect(r.bullets[0].lines).toBe(2);
  expect(r.overflows.length).toBeGreaterThan(0);
  expect(r.bulletsPass).toBe(false);
});

test("failed compilation removes an old PDF and manifest, even if TeX emitted a partial PDF", async () => {
  const tex = join(root, "failure.tex");
  await Bun.write(tex, document([sentence]));
  const { pdfPath } = await compile(tex);
  await Bun.write(tex, document([sentence], String.raw`\newpage\UndefinedCommand`));
  await expect(compile(tex)).rejects.toThrow("xelatex failed");
  expect(await Bun.file(pdfPath).exists()).toBe(false);
  expect(await Bun.file(manifestPath(pdfPath)).exists()).toBe(false);
});

test("page limits and section selection use compiled output", async () => {
  const tex = join(root, "pages.tex");
  await Bun.write(tex, document([sentence], String.raw`\newpage\section{PROJECTS}\begin{itemize}\item ` + sentence + String.raw`\end{itemize}`));
  const { pdfPath } = await compile(tex);
  expect((await runGates(tex, pdfPath)).pagesPass).toBe(false);
  expect((await runGates(tex, pdfPath, { section: "projects", maxPages: 2 })).pass).toBe(true);
  await expect(runGates(tex, pdfPath, { section: "NOT PRESENT" })).rejects.toThrow("no rendered bullets");
});
