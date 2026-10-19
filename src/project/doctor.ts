import { join } from "node:path";
import { FONT_DIR, TEMPLATE_DIR } from "../rendering/assets.ts";

export interface Diagnostic {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}
export interface DoctorReport { pass: boolean; checks: Diagnostic[] }

const TEX_FILES = [
  "article.cls", "fontspec.sty", "kvoptions.sty", "geometry.sty", "titlesec.sty",
  "enumitem.sty", "hyperref.sty", "url.sty", "tabularx.sty", "tikz.sty",
  "texgyretermes-regular.otf", "texgyretermes-bold.otf",
  "texgyretermes-italic.otf", "texgyretermes-bolditalic.otf",
];

/** Inspect dependencies without installing anything or modifying the user's project. */
export async function doctor(): Promise<DoctorReport> {
  const [major, minor] = Bun.version.split(".").map(Number);
  const checks: Diagnostic[] = [{
    name: "Bun", ok: (major > 1 || (major === 1 && minor >= 3)) && !!Bun.YAML,
    detail: Bun.version, fix: "Install Bun >= 1.3.",
  }];
  for (const command of ["xelatex", "kpsewhich"]) {
    const path = Bun.which(command);
    let ok = false;
    let detail = "not found in PATH";
    if (path) {
      try {
        const result = Bun.spawnSync([path, "--version"], { stdout: "pipe", stderr: "pipe", timeout: 10_000 });
        ok = result.exitCode === 0;
        detail = ok ? `${path}: ${result.stdout.toString().split("\n")[0]}` : `${path}: failed to run`;
      } catch (error) { detail = `${path}: ${(error as Error).message}`; }
    }
    checks.push({ name: command, ok, detail, fix: "Install TinyTeX-1 or TeX Live and add its bin directory to PATH." });
  }
  if (checks.find(c => c.name === "kpsewhich")!.ok) {
    const missing = TEX_FILES.filter(file => {
      const result = Bun.spawnSync([Bun.which("kpsewhich")!, file], { stdout: "pipe", stderr: "pipe", timeout: 10_000 });
      return result.exitCode !== 0 || !result.stdout.toString().trim();
    });
    checks.push({
      name: "TeX dependencies", ok: missing.length === 0,
      detail: missing.length ? `missing: ${missing.join(", ")}` : `${TEX_FILES.length} required files found`,
      fix: "Install the README's TeX packages; with TinyTeX-1: tlmgr install titlesec enumitem pgf tex-gyre.",
    });
  }
  for (const path of [join(TEMPLATE_DIR, "resume.cls"), join(TEMPLATE_DIR, "resume-measure.tex"),
    ...[430, 500, 600].map(weight => join(FONT_DIR, `Inter-${weight}.ttf`))]) {
    checks.push({ name: "Bundled asset", ok: await Bun.file(path).exists(), detail: path, fix: "Restore the template directory or reinstall resumectl." });
  }
  return { pass: checks.every(c => c.ok), checks };
}

export function formatDoctor(report: DoctorReport): string {
  return report.checks.map(c => `${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.detail}${!c.ok && c.fix ? `\n  ${c.fix}` : ""}`).join("\n")
    + `\n\n${report.pass ? "OK — build dependencies are available." : "Fix the failed checks before building."}`;
}
