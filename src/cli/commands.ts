import { parseArgs, type ParseArgsOptionDescriptor } from "node:util";
import { InputError } from "../errors.ts";

const OPTIONS = {
  config: { type: "string", hint: "<path>", description: "use this YAML config instead of discovery" },
  style: { type: "string", hint: "<serif|sans>", description: "override the rendered style" },
  paper: { type: "string", hint: "<a4|letter>", description: "override the paper size" },
  section: { type: "string", hint: "<name>", description: "check only this section (default: all configured sections)" },
  "max-lines": { type: "string", hint: "<n>", description: "override maximum rendered lines for selected sections" },
  "min-last-line-fill": { type: "string", hint: "<0–1>", description: "override minimum last-line fill for selected sections" },
  "max-pages": { type: "string", hint: "<n>", description: "page limit (default: 1)" },
  "out-dir": { type: "string", hint: "<dir>", description: "output directory, relative to the current directory" },
  pdf: { type: "string", hint: "<path>", description: "existing PDF to check; cannot combine with --out-dir" },
  "keep-logs": { type: "boolean", description: "keep compiler intermediates after a passing build" },
  "no-keep-logs": { type: "boolean", description: "override keepLogs: true from config" },
  json: { type: "boolean", description: "machine-readable result or error" },
  help: { type: "boolean", short: "h", description: "show help without doing work" },
  version: { type: "boolean", short: "v", description: "print only the version" },
} as const satisfies Record<string, ParseArgsOptionDescriptor & { hint?: string; description: string }>;
type OptionName = keyof typeof OPTIONS;
type Values = { [K in OptionName]?: typeof OPTIONS[K]["type"] extends "string" ? string : boolean };
const GLOBALS = ["json", "help", "version"] as const;
const OVERRIDES = ["config", "style", "paper", "section", "max-lines", "min-last-line-fill", "max-pages", "out-dir"] as const;
const BUILD_OPTIONS = [...OVERRIDES, "keep-logs", "no-keep-logs"] as const;

export const COMMANDS = {
  "": {
    summary: "Configure, render and check a résumé.", usage: "resumectl <command> [options]",
    options: [], example: "resumectl --help", maxArgs: 0,
    commands: ["init", "doctor", "config", "build", "check"],
  },
  init: {
    summary: "Create starter résumé source and configuration without overwriting files.",
    usage: "resumectl init [directory] [options]", options: ["style", "paper"],
    example: "resumectl init my-resume --style sans", maxArgs: 1,
  },
  doctor: {
    summary: "Check local build dependencies without installing anything.",
    usage: "resumectl doctor [options]", options: [], example: "resumectl doctor --json", maxArgs: 0,
  },
  config: {
    summary: "Create configuration or inspect effective settings and their sources.",
    usage: "resumectl config <init|show> [options]", options: [],
    example: "resumectl config show --json", maxArgs: 0, commands: ["config init", "config show"],
  },
  "config init": {
    summary: "Create a starter YAML config without overwriting an existing file.",
    usage: "resumectl config init [options]", options: ["config"],
    example: "resumectl config init --config resume.config.yaml --json", maxArgs: 0,
  },
  "config show": {
    summary: "Show effective configuration and the source of each field without compiling.",
    usage: "resumectl config show [resume.tex] [options]", options: BUILD_OPTIONS,
    example: "resumectl config show --json", maxArgs: 1,
  },
  build: {
    summary: "Compile a résumé with XeLaTeX or Tectonic, then run the quality gates.",
    usage: "resumectl build <resume.tex> [options]", options: BUILD_OPTIONS,
    example: "resumectl build my-resume/resume.tex --json", maxArgs: 1,
  },
  check: {
    summary: "Run quality gates on an existing PDF and its matching render measurements.",
    usage: "resumectl check <resume.tex> [options]", options: [...OVERRIDES, "pdf"],
    example: "resumectl check my-resume/resume.tex --json", maxArgs: 1,
  },
} as const satisfies Record<string, {
  summary: string; usage: string; options: readonly OptionName[]; example: string; maxArgs: number;
  commands?: readonly string[];
}>;
export type CommandPath = keyof typeof COMMANDS;

// Inspect discovery switches before strict parsing, so help still works with
// malformed options or missing values. Values and tokens after -- are not switches.
export function inspectArgs(args: string[]) {
  const positionals: string[] = [];
  let help = false, version = false, json = false, options = true;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (options && arg === "--") { options = false; continue; }
    if (options && arg.startsWith("-")) {
      if (arg === "--help" || arg === "-h") help = true;
      if (arg === "--version" || arg === "-v") version = true;
      if (arg === "--json") json = true;
      const name = arg.slice(2).split("=")[0] as OptionName;
      if (!arg.includes("=") && OPTIONS[name]?.type === "string" && args[i + 1] && !args[i + 1].startsWith("-")) i++;
    } else positionals.push(arg);
  }
  return { positionals, help, version, json };
}

export function commandPath(positionals: string[], helpCommand = false): CommandPath {
  const [command, action] = positionals;
  if (!command) return "";
  if (!Object.hasOwn(COMMANDS, command) || command.includes(" ")) {
    throw new InputError(`unknown command "${command}". Run resumectl --help.`, "unknown_command");
  }
  const path = command === "config" && action ? `config ${action}` : command;
  if (!Object.hasOwn(COMMANDS, path)) {
    throw new InputError(`unknown command "${action}" for resumectl config. Run resumectl config --help.`, "unknown_command");
  }
  if (helpCommand) {
    const depth = path.split(" ").length;
    if (positionals.length > depth) throw new InputError(`unknown command "${positionals[depth]}" for resumectl ${path}. Run resumectl ${path} --help.`, "unknown_command");
  }
  return path as CommandPath;
}

export function formatHelp(path: CommandPath): string {
  const command = COMMANDS[path];
  const names: readonly OptionName[] = [...command.options, ...GLOBALS];
  const options = names.map(name => {
    const option = OPTIONS[name];
    const label = `${"short" in option ? `-${option.short}, ` : "    "}--${name}${"hint" in option ? ` ${option.hint}` : ""}`;
    return `  ${label.padEnd(32)} ${option.description}`;
  }).join("\n");
  const commands = "commands" in command ? "\n\nCommands\n" + command.commands.map(name =>
    `  ${name.padEnd(16)} ${COMMANDS[name as CommandPath].summary}`).join("\n") : "";
  return `${command.summary}\n\nUsage\n  ${command.usage}${commands}\n\nOptions\n${options}\n\nExample\n  ${command.example}\n\nHelp: resumectl help [command [action]]\nPrecedence: CLI > config > documentclass > defaults.\nExit codes: 0 success · 1 quality/compile/dependency failure · 2 invalid input · 130 interrupted.`;
}

export function parseCommand(args: string[], path: CommandPath) {
  const command = COMMANDS[path];
  const invocation = `resumectl${path ? ` ${path}` : ""}`;
  const options = Object.fromEntries([...command.options, ...GLOBALS].map(name => [name, OPTIONS[name]]));
  let parsed;
  try { parsed = parseArgs({ args, allowPositionals: true, options }); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!code?.startsWith("ERR_PARSE_ARGS")) throw error;
    const message = (error as Error).message;
    const detail = code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ? message.split(". To specify")[0] : message;
    throw new InputError(`${detail} for ${invocation}. Run ${invocation} --help.`,
      code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ? "unknown_option" : "invalid_option");
  }
  const values = parsed.values as Values;
  const positionals = parsed.positionals.slice(path ? path.split(" ").length : 0);
  if (positionals.length > command.maxArgs) throw new InputError(`too many positional arguments for ${invocation}. Run ${invocation} --help.`, "unexpected_argument");
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === "string" && !value.trim()) throw new InputError(`--${name} needs a non-empty value. Run resumectl ${path} --help.`, "invalid_option");
  }
  if (values["keep-logs"] && values["no-keep-logs"]) throw new InputError(`choose either --keep-logs or --no-keep-logs. Run resumectl ${path} --help.`, "conflicting_options");
  if (path === "check" && values.pdf && values["out-dir"]) throw new InputError("check cannot combine --pdf and --out-dir; choose one PDF location. Run resumectl check --help.", "conflicting_options");
  return { values, positionals };
}
