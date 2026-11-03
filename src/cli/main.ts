import { parseArgs } from "node:util";
import { basename, join, resolve } from "node:path";
import { cleanIntermediates, compile, tectonicCacheReady, texEngine } from "../rendering/compile.ts";
import { resolveConfig, type ConfigInput } from "../project/config.ts";
import { formatReport, runGates } from "../quality/gates.ts";
import { InputError } from "../errors.ts";
import { initConfig, initProject } from "../project/init.ts";
import { doctor, formatDoctor } from "../project/doctor.ts";
import { formatMatchReport } from "../match/format.ts";
import { gradeMeets } from "../match/grade.ts";
import { runMatch } from "../match/run.ts";
import type { DeciderName, Grade } from "../match/types.ts";

const USAGE = `resumectl — configure, render and check a résumé

Usage
  resumectl init [directory] [--style <serif|sans>] [--paper <a4|letter>] [--json]
  resumectl doctor [--json]
  resumectl config init [--config <path>]
  resumectl config show [resume.tex] [--config <path>] [--json]
  resumectl build <resume.tex> [options]
  resumectl check <resume.tex> [options]
  resumectl match <resume.tex> --jd <url|txt|yaml> [options]

Options
  --config <path>             use this YAML config; otherwise discover resume.config.yaml
  --style <serif|sans>        override the rendered style
  --paper <a4|letter>         override the paper size
  --section <name>            check only this section (default: all configured sections)
  --max-lines <n>             override maximum rendered lines for selected sections
  --min-last-line-fill <0–1>   override minimum last-line fill for selected sections
  --max-pages <n>             page limit (default: 1)
  --out-dir <dir>             output directory, relative to the current directory
  --pdf <path>                existing PDF to check (check only)
  --keep-logs                 keep compiler intermediates after a passing build
  --no-keep-logs              override keepLogs: true from config
  --jd <url|txt|yaml>         job URL, pasted jd.txt, requirements YAML, or a jd/<slug>/ directory (match)
  --profile <facts.yaml>      work authorization, location, degrees, licenses, facts (match)
  --decider <openai|jev|none> per-requirement decider (match, default openai)
  --model <id>                override gpt-6-luna or jev-1.14.0 (match)
  --fail-under <A|B|C|D>      exit 1 when the grade is below this letter (match, off by default)
  --refresh                   refetch a cached job URL (match)
  --json                     machine-readable report, including effective config
  -h, --help

Match is diagnostic coverage, not an ATS score and not a prediction that an employer
will pass or reject the résumé. The letter grade is computed in code from per-requirement
levels (Missing / Mentioned / Partial / Demonstrated). Hard gates — work authorization,
location, license, minimum degree or years — are reported separately and are not averaged
into the grade. openai uses OPENAI_API_KEY and the Decisions API (gpt-6-luna). jev uses
TYPESAFE_API_KEY and pinned model jev-1.14.0. none is offline exact/alias matching.
Probabilities are uncalibrated until you label your own examples. Exit 0 is advisory.

Precedence: CLI > config > documentclass > defaults.
Exit codes: 0 success · 1 quality/compile/dependency failure · 2 invalid input.`;

export async function main(args: string[]): Promise<number> {
  const { values: v, positionals } = parseArgs({
    args, allowPositionals: true,
    options: {
      config: { type: "string" }, pdf: { type: "string" }, "out-dir": { type: "string" },
      style: { type: "string" }, paper: { type: "string" }, section: { type: "string" },
      "max-lines": { type: "string" }, "min-last-line-fill": { type: "string" }, "max-pages": { type: "string" },
      "keep-logs": { type: "boolean" }, "no-keep-logs": { type: "boolean" }, json: { type: "boolean" }, help: { type: "boolean", short: "h" },
      jd: { type: "string" }, profile: { type: "string" }, decider: { type: "string" }, model: { type: "string" },
      "fail-under": { type: "string" }, refresh: { type: "boolean" },
    },
  });
  const [command, arg, texArg] = positionals;
  if (v.help || !command) { console.log(USAGE); return v.help ? 0 : 2; }
  const matchOnly = ["jd", "profile", "decider", "model", "fail-under", "refresh"] as const;
  if (command !== "match" && matchOnly.some(key => v[key] !== undefined)) {
    throw new InputError(`--${matchOnly.find(key => v[key] !== undefined)} is only supported by match`);
  }
  if (command === "match") return matchCommand(positionals, v);
  if (v["keep-logs"] && v["no-keep-logs"]) throw new InputError("choose either --keep-logs or --no-keep-logs");
  if (command === "init") {
    if (positionals.length > 2 || Object.keys(v).some(k => !["style", "paper", "json"].includes(k))) {
      throw new InputError("init accepts a directory, --style, --paper and --json");
    }
    const result = await initProject(arg, {
      ...(v.style !== undefined ? { style: v.style as "serif" | "sans" } : {}),
      ...(v.paper !== undefined ? { paper: v.paper as "a4" | "letter" } : {}),
    });
    console.log(v.json ? JSON.stringify(result, null, 2)
      : `Created ${result.texPath} and ${result.configPath}\nReplace the placeholders, then run resumectl build "${result.texPath}".`);
    return 0;
  }
  if (command === "doctor") {
    if (positionals.length > 1 || Object.keys(v).some(k => k !== "json")) throw new InputError("doctor accepts only --json");
    const report = await doctor();
    console.log(v.json ? JSON.stringify(report, null, 2) : formatDoctor(report));
    return report.pass ? 0 : 1;
  }
  if (command === "config" && arg === "init") {
    if (positionals.length > 2 || Object.keys(v).some(k => !["config", "json"].includes(k))) throw new InputError("config init accepts only --config and --json");
    const result = await initConfig(v.config);
    console.log(v.json ? JSON.stringify(result, null, 2) : `Created ${result.configPath}`);
    return 0;
  }
  const show = command === "config" && arg === "show";
  if (!show && command !== "build" && command !== "check") throw new InputError(`unknown command; use --help`);
  if (positionals.length > (show ? 3 : 2)) throw new InputError("too many positional arguments");
  const texPath = show ? texArg : arg;
  if (!show && !texPath) throw new InputError(`${command} needs a .tex file`);
  if (v.pdf && command !== "check") throw new InputError("--pdf is only supported by check");
  const overrides: ConfigInput = { layout: {}, checks: { bullets: {} }, build: {} };
  if (v.style !== undefined) overrides.layout!.style = v.style as "serif" | "sans";
  if (v.paper !== undefined) overrides.layout!.paper = v.paper as "a4" | "letter";
  if (v.section !== undefined) overrides.checks!.section = v.section;
  if (v["max-pages"] !== undefined) overrides.checks!.maxPages = Number(v["max-pages"]);
  if (v["max-lines"] !== undefined) overrides.checks!.bullets!.maxLines = Number(v["max-lines"]);
  if (v["min-last-line-fill"] !== undefined) overrides.checks!.bullets!.minLastLineFill = v["min-last-line-fill"].trim() ? Number(v["min-last-line-fill"]) : NaN;
  if (v["out-dir"] !== undefined) overrides.build!.outDir = v["out-dir"];
  if (v["keep-logs"] !== undefined) overrides.build!.keepLogs = v["keep-logs"];
  if (v["no-keep-logs"]) overrides.build!.keepLogs = false;
  const resolved = await resolveConfig({ texPath, configPath: v.config, overrides });
  if (show) { console.log(JSON.stringify(resolved, null, 2)); return 0; }
  const { config } = resolved;
  let pdfPath = v.pdf ? resolve(v.pdf) : join(config.build.outDir!, basename(texPath!).replace(/\.tex$/i, "") + ".pdf");
  if (command === "build") {
    const engine = texEngine();
    if (!v.json) console.log(`[1/2] ${engine ?? "compile"} ${texPath}`);
    // stderr keeps --json output parseable while telling agents not to time out.
    if (engine === "tectonic" && !tectonicCacheReady()) console.error("First Tectonic build: downloading TeX packages (about 45 MB). This can take a few minutes.");
    pdfPath = (await compile(texPath!, { outDir: config.build.outDir, layout: config.layout })).pdfPath;
    if (!v.json) console.log("[2/2] quality gates\n");
  }
  const report = await runGates(texPath!, pdfPath, { ...config.checks, sections: config.sections }, config.layout);
  console.log(v.json ? JSON.stringify({ pdf: pdfPath, ...resolved, ...report }, null, 2) : formatReport(report));
  if (command === "build" && report.pass && !config.build.keepLogs) await cleanIntermediates(pdfPath);
  if (command === "build" && report.pass && !v.json) console.log(`\nresumectl: built ${pdfPath}`);
  return report.pass ? 0 : 1;
}

async function matchCommand(positionals: string[], v: Record<string, string | boolean | undefined>): Promise<number> {
  const allowed = new Set(["jd", "profile", "decider", "model", "fail-under", "refresh", "json"]);
  for (const key of Object.keys(v)) {
    if (v[key] !== undefined && !allowed.has(key)) throw new InputError(`match does not accept --${key}`);
  }
  if (positionals.length > 2) throw new InputError("too many positional arguments");
  const texPath = positionals[1];
  if (!texPath) throw new InputError("match needs a .tex file");
  const jd = v.jd;
  if (typeof jd !== "string" || !jd) throw new InputError("match needs --jd <url|txt|yaml>");
  const decider = typeof v.decider === "string" ? v.decider : "openai";
  if (decider !== "openai" && decider !== "jev" && decider !== "none") throw new InputError("--decider must be openai, jev, or none");
  let failUnder: Grade | undefined;
  if (typeof v["fail-under"] === "string") {
    const letter = v["fail-under"].toUpperCase();
    if (letter !== "A" && letter !== "B" && letter !== "C" && letter !== "D") throw new InputError("--fail-under must be A, B, C, or D");
    failUnder = letter;
  }
  const report = await runMatch({
    texPath,
    jd,
    decider: decider as DeciderName,
    ...(typeof v.profile === "string" ? { profilePath: v.profile } : {}),
    ...(typeof v.model === "string" ? { model: v.model } : {}),
    ...(v.refresh ? { refresh: true } : {}),
  });
  console.log(v.json ? JSON.stringify(report, null, 2) : formatMatchReport(report));
  if (failUnder && !gradeMeets(report.grade, failUnder)) return 1;
  return 0;
}
