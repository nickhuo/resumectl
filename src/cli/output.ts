import { dirname } from "node:path";
import { InputError, InterruptedError } from "../errors.ts";
import { BuildError } from "../rendering/compile.ts";
import { commandPath, inspectArgs, parseCommand } from "./commands.ts";

export function shellCommand(args: string[]): string {
  return args.map(arg => /^[a-zA-Z0-9_./=-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`).join(" ");
}

export function rebuildCommand(args: string[]): string {
  const path = commandPath(inspectArgs(args).positionals);
  const { values, positionals } = parseCommand(args, path);
  const needsSeparator = positionals.some(arg => arg.startsWith("-"));
  const command = ["resumectl", "build", ...(needsSeparator ? [] : positionals)];
  for (const [key, value] of Object.entries(values)) {
    if (["json", "help", "version", "pdf"].includes(key)) continue;
    if (value === true) command.push(`--${key}`);
    else if (typeof value === "string") command.push(`--${key}`, value);
  }
  if (values.pdf) command.push("--out-dir", dirname(values.pdf));
  if (needsSeparator) command.push("--", ...positionals);
  return shellCommand(command);
}

export function formatError(error: unknown, args: string[]) {
  const code = (error as NodeJS.ErrnoException)?.code;
  let reason = "operation_failed", exitCode = 1, status = "error";
  let message = error instanceof Error ? error.message : String(error);
  if (error instanceof InterruptedError) { reason = "interrupted"; exitCode = 130; }
  else if (error instanceof BuildError) reason = error.reason;
  else if (error instanceof InputError) {
    reason = error.reason; exitCode = 2;
    if (reason === "missing_input") status = "action_required";
  } else if (code === "ENOENT") {
    reason = "missing_input"; status = "action_required"; exitCode = 2;
    message = `file or directory not found: ${message}`;
  }
  if (error instanceof BuildError && ["dependency_missing", "spawn_failed"].includes(reason)) message += ". Run resumectl doctor.";
  else if (error instanceof BuildError) {
    message += `\nFix the reported compiler error, then run ${rebuildCommand(args)}.`;
  } else if (exitCode === 2 && !/Run resumectl/.test(message)) {
    let recovery = "resumectl --help";
    try {
      const path = commandPath(inspectArgs(args).positionals);
      recovery = /rebuild|PDF not found|render measurements not found/.test(message)
        ? rebuildCommand(args) : `resumectl${path ? ` ${path}` : ""} --help`;
    } catch { /* The root help remains useful when parsing itself failed. */ }
    message = message.replace("; run resumectl build first", "") + `. Run ${recovery}.`;
  }
  const document = { status, reason, message, retryable: false };
  return { exitCode, text: inspectArgs(args).json ? JSON.stringify(document) : `resumectl: ${message}` };
}
