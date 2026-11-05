import { basename, join, resolve } from "node:path";
import { version } from "../../package.json";
import { cleanIntermediates, compile, tectonicCacheReady, texEngine } from "../rendering/compile.ts";
import { resolveConfig, type ConfigInput, type ResolvedConfig } from "../project/config.ts";
import { formatReport, runGates } from "../quality/gates.ts";
import { InputError } from "../errors.ts";
import { initConfig, initProject } from "../project/init.ts";
import { doctor, formatDoctor } from "../project/doctor.ts";
import { commandPath, formatHelp, inspectArgs, parseCommand } from "./commands.ts";
import { rebuildCommand, shellCommand } from "./output.ts";

function formatConfig(resolved: ResolvedConfig): string {
  const rows: string[] = [`Configuration: ${resolved.configPath ?? "defaults and documentclass (no YAML file)"}`];
  function visit(value: object, prefix = "") {
    for (const [key, field] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (field !== null && typeof field === "object") visit(field, path);
      else rows.push(`  ${path}: ${field}  [${resolved.sources[path] ?? "default"}]`);
    }
  }
  visit(resolved.config);
  return rows.join("\n");
}

export async function main(args: string[]): Promise<number> {
  const discovery = inspectArgs(args);
  const helpCommand = discovery.positionals[0] === "help";
  if (discovery.help || helpCommand) {
    console.log(formatHelp(commandPath(helpCommand ? discovery.positionals.slice(1) : discovery.positionals, helpCommand)));
    return 0;
  }
  if (discovery.version) { console.log(version); return 0; }
  const command = commandPath(discovery.positionals);
  if (command === "" || command === "config") {
    parseCommand(args, command);
    console.log(formatHelp(command));
    return 0;
  }
  const { values: v, positionals: [arg] } = parseCommand(args, command);
  if (command === "init") {
    const result = await initProject(arg, {
      ...(v.style !== undefined ? { style: v.style as "serif" | "sans" } : {}),
      ...(v.paper !== undefined ? { paper: v.paper as "a4" | "letter" } : {}),
    });
    console.log(v.json ? JSON.stringify(result, null, 2) : `Created ${result.texPath} and ${result.configPath}`);
    if (!v.json) console.error(`Replace the placeholders, then run ${shellCommand(["resumectl", "build", result.texPath])}.`);
    return 0;
  }
  if (command === "doctor") {
    const report = await doctor();
    console.log(v.json ? JSON.stringify(report, null, 2) : formatDoctor(report, false));
    if (!v.json && !report.pass) for (const check of report.checks) {
      if (!check.ok && check.fix) console.error(`${check.name}: ${check.fix}`);
    }
    return report.pass ? 0 : 1;
  }
  if (command === "config init") {
    const result = await initConfig(v.config);
    console.log(v.json ? JSON.stringify(result, null, 2) : `Created ${result.configPath}`);
    return 0;
  }
  const show = command === "config show";
  const texPath = arg;
  if (!show && !texPath) throw new InputError(`${command} needs a .tex file. Run resumectl ${command} --help.`, "missing_input");
  const overrides: ConfigInput = { layout: {}, checks: { bullets: {} }, build: {} };
  if (v.style !== undefined) overrides.layout!.style = v.style as "serif" | "sans";
  if (v.paper !== undefined) overrides.layout!.paper = v.paper as "a4" | "letter";
  if (v.section !== undefined) overrides.checks!.section = v.section;
  if (v["max-pages"] !== undefined) overrides.checks!.maxPages = Number(v["max-pages"]);
  if (v["max-lines"] !== undefined) overrides.checks!.bullets!.maxLines = Number(v["max-lines"]);
  if (v["min-last-line-fill"] !== undefined) overrides.checks!.bullets!.minLastLineFill = Number(v["min-last-line-fill"]);
  if (v["out-dir"] !== undefined) overrides.build!.outDir = v["out-dir"];
  if (v["keep-logs"] !== undefined) overrides.build!.keepLogs = v["keep-logs"];
  if (v["no-keep-logs"]) overrides.build!.keepLogs = false;
  const resolved = await resolveConfig({ texPath, configPath: v.config, overrides });
  if (show) { console.log(v.json ? JSON.stringify(resolved, null, 2) : formatConfig(resolved)); return 0; }
  const { config } = resolved;
  let pdfPath = v.pdf ? resolve(v.pdf) : join(config.build.outDir!, basename(texPath!).replace(/\.tex$/i, "") + ".pdf");
  if (command === "build") {
    const engine = texEngine();
    if (!v.json) console.error(`[1/2] ${engine ?? "compile"} ${texPath}`);
    if (!v.json && engine === "tectonic" && !tectonicCacheReady()) console.error("First Tectonic build: downloading TeX packages (about 45 MB). This can take a few minutes.");
    pdfPath = (await compile(texPath!, { outDir: config.build.outDir, layout: config.layout })).pdfPath;
    if (!v.json) console.error("[2/2] quality gates");
  }
  const report = await runGates(texPath!, pdfPath, { ...config.checks, sections: config.sections }, config.layout);
  // Finish filesystem work before emitting a result: a cleanup failure must not
  // leave a success document on stdout followed by a JSON error on stderr.
  if (command === "build" && report.pass && !config.build.keepLogs) await cleanIntermediates(pdfPath);
  console.log(v.json ? JSON.stringify({ pdf: pdfPath, ...resolved, ...report }, null, 2) : formatReport(report, false));
  if (!v.json) {
    if (command === "build" && report.pass) console.error(`resumectl: built ${pdfPath}`);
    if (!report.pass) console.error(`Revise the flagged content or layout, then run ${rebuildCommand(args)}.`);
  }
  return report.pass ? 0 : 1;
}
