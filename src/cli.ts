#!/usr/bin/env bun
import { main } from "./cli/main.ts";
import { BuildError } from "./rendering/compile.ts";
import { InputError } from "./errors.ts";

try { process.exit(await main(Bun.argv.slice(2))); }
catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  const message = code === "ENOENT" ? `file or executable not found: ${(error as Error).message}. For xelatex, install TinyTeX-1 and the README's packages.` : (error as Error).message;
  console.error(`resumectl: ${message}`);
  if (error instanceof BuildError) process.exit(1);
  if (error instanceof InputError || code === "ENOENT" || code?.startsWith("ERR_PARSE_ARGS")) process.exit(2);
  throw error;
}
