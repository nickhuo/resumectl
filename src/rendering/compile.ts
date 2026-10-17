// Compile with XeLaTeX and retain actual paragraph geometry for later checks.
import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { layoutToClassOptions, resolveConfig, type LayoutOptions } from "../project/config.ts";
import { hash, manifestPath, parseMeasurements, type BuildManifest } from "./measurements.ts";
import { resolveInputs } from "../content/tex.ts";

import { TEMPLATE_DIR, FONT_DIR } from "./assets.ts";
export { TEMPLATE_DIR, FONT_DIR } from "./assets.ts";
export interface BuildOptions { outDir?: string; layout?: LayoutOptions }
export interface BuildResult {
  pdfPath: string;
  logPath: string;
  manifestPath: string;
  output: string;
}
export class BuildError extends Error {}

function texPathLiteral(path: string): string {
  if (/[{}%#\\\r\n]/.test(path)) throw new BuildError(`path contains characters unsupported by TeX: ${path}`);
  return `\\detokenize{${path}}`;
}
/** The string second argument remains supported for existing library consumers. */
export async function compile(texPath: string, options: string | BuildOptions = {}): Promise<BuildResult> {
  texPath = resolve(texPath);
  const opts = typeof options === "string" ? { outDir: options } : options;
  if (!/\.tex$/i.test(texPath)) throw new BuildError("source must have a .tex extension");
  const { config } = await resolveConfig({ texPath, configPath: opts.layout ? null : undefined, overrides: {
    ...(opts.layout ? { layout: opts.layout } : {}), ...(opts.outDir ? { build: { outDir: opts.outDir } } : {}),
  } });
  const tex = await resolveInputs(await Bun.file(texPath).text(), texPath);
  const job = basename(texPath).replace(/\.tex$/i, "");
  texPathLiteral(job);
  const out = resolve(config.build.outDir!);
  await mkdir(out, { recursive: true });
  const pdfPath = join(out, `${job}.pdf`);
  const logPath = join(out, `${job}.log`);
  const measurementPath = join(out, `${job}.rmlayout`);
  const metadataPath = manifestPath(pdfPath);
  // Neither old PDFs nor old measurements may survive a failed compile.
  await Promise.all([pdfPath, metadataPath, measurementPath].map(p => rm(p, { force: true })));
  const proc = Bun.spawnSync([
    "xelatex", "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape",
    `-output-directory=${out}`, `-jobname=${job}`,
    `\\edef\\ResumeFontDir{${texPathLiteral(FONT_DIR + "/")}}\\def\\ResumeMeasure{1}`
      + `\\def\\ResumeConfigOptions{${layoutToClassOptions(config.layout)}}\\input{${texPathLiteral(basename(texPath))}}`,
  ], {
    cwd: dirname(texPath),
    env: { ...process.env, TEXINPUTS: `${TEMPLATE_DIR}//:${process.env.TEXINPUTS ?? ""}` },
    stdout: "pipe", stderr: "pipe",
  });
  const output = (proc.stdout.toString() + proc.stderr.toString()).split("\n").slice(-40).join("\n");
  if (proc.exitCode !== 0 || !await Bun.file(pdfPath).exists()) {
    await rm(pdfPath, { force: true });
    throw new BuildError(`xelatex failed${proc.signalCode ? ` (${proc.signalCode})` : ""}\n\n${output}`);
  }
  if (!await Bun.file(measurementPath).exists()) throw new BuildError("the resume class did not emit layout measurements; remove any outdated local resume.cls");
  const log = await Bun.file(logPath).text();
  const manifest: BuildManifest = {
    version: 1, sourceHash: hash(tex), pdfHash: hash(await Bun.file(pdfPath).bytes()), layout: config.layout,
    bullets: parseMeasurements(await Bun.file(measurementPath).text()),
    overflows: [...log.matchAll(/Overfull \\[hv]box \([^\n]+/g)].map(m => m[0]),
  };
  await Bun.write(metadataPath, JSON.stringify(manifest, null, 2) + "\n");
  return { pdfPath, logPath, manifestPath: metadataPath, output };
}
export async function cleanIntermediates(pdfPath: string): Promise<void> {
  const stem = pdfPath.replace(/\.pdf$/i, "");
  await Promise.all(["aux", "log", "out", "rmlayout"].map(ext => rm(`${stem}.${ext}`, { force: true })));
}
