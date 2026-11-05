#!/usr/bin/env bun
import { main } from "./cli/main.ts";
import { formatError } from "./cli/output.ts";

const args = Bun.argv.slice(2);
try { process.exit(await main(args)); }
catch (error) {
  const result = formatError(error, args);
  console.error(result.text);
  process.exit(result.exitCode);
}
