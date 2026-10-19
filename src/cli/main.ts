import { parseArgs } from "node:util";
import { basename, join, resolve } from "node:path";
import { cleanIntermediates, compile, tectonicCacheReady, texEngine } from "../rendering/compile.ts";
import { resolveConfig, type ConfigInput } from "../project/config.ts";
import { formatReport, runGates } from "../quality/gates.ts";
import { InputError } from "../errors.ts";
import { initConfig, initProject } from "../project/init.ts";
import { doctor, formatDoctor } from "../project/doctor.ts";

const USAGE = `resumectl — configure, render and check a résumé

Usage
  resumectl init [directory] [--style <serif|sans>] [--paper <a4|letter>] [--json]
  resumectl doctor [--json]
  resumectl config init [--config <path>]
  resumectl config show [resume.tex] [--config <path>] [--json]
  resumectl build <resume.tex> [options]
  resumectl check <resume.tex> [options]

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
  --json                     machine-readable report, including effective config
  -h, --help

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
    },
  });
  const [command, arg, texArg] = positionals;
  if (v.help || !command) { console.log(USAGE); return v.help ? 0 : 2; }
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
