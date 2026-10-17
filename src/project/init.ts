import { lstat, mkdir, open, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { InputError } from "../errors.ts";
import { CONFIG_NAME, DEFAULT_CHECKS, SCHEMA_PATH, validateConfig, type ConfigInput, type LayoutOptions } from "./config.ts";

type StarterOptions = Pick<LayoutOptions, "style" | "paper">;

function starterConfig(options: Partial<StarterOptions>): ConfigInput {
  return validateConfig({
    version: 1,
    layout: { style: "serif", paper: "a4", ...options },
    checks: structuredClone(DEFAULT_CHECKS),
    sections: { "WORK EXPERIENCE": { editable: true, checks: { ...DEFAULT_CHECKS.bullets } } },
    build: { outDir: "./output", keepLogs: false },
  });
}

function configText(path: string, config: ConfigInput): string {
  return `# yaml-language-server: $schema=${relative(dirname(path), SCHEMA_PATH)}\n`
    + "# CLI > YAML > documentclass > defaults. Lengths include units.\n"
    + Bun.YAML.stringify(config, null, 2).replace(/[ \t]+$/gm, "") + "\n";
}

async function writeNew(path: string, text: string): Promise<void> {
  let file;
  try { file = await open(path, "wx"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new InputError(`file already exists: ${path}`);
    throw error;
  }
  try { await file.writeFile(text); }
  catch (error) { await rm(path, { force: true }); throw error; }
  finally { await file.close(); }
}

export async function initConfig(path = CONFIG_NAME): Promise<{ configPath: string; config: ConfigInput }> {
  path = resolve(path);
  if (!/\.ya?ml$/i.test(path)) throw new InputError("config files must use .yaml or .yml");
  const config = starterConfig({});
  await writeNew(path, configText(path, config));
  return { configPath: path, config };
}

/** Create editable source and policy together; never replace an existing résumé or config. */
export async function initProject(directory = ".", options: Partial<StarterOptions> = {}) {
  const config = starterConfig(options);
  const target = resolve(directory);
  const texPath = join(target, "resume.tex");
  const configPath = join(target, CONFIG_NAME);
  for (const path of [texPath, configPath, join(target, "resume.config.yml")]) {
    const existing = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (existing) throw new InputError(`file already exists: ${path}`);
  }
  const source = String.raw`% Replace every placeholder with verified career facts before sharing.
\documentclass[style=${config.layout!.style},paper=${config.layout!.paper}]{resume}
\begin{document}
\name{YOUR NAME}
\basicInfo{\href{mailto:you@example.com}{you@example.com}\sep City, Country}

\section{WORK EXPERIENCE}
\datedsubsection{\textbf{Company}}{Dates}
\datedline{\role{Role}}{Location}
\begin{itemize}
\item Replace this sample with a verified accomplishment: describe your action, technical approach, and measurable impact.
\end{itemize}

% Add other sections and their editing/checking policies in resume.config.yaml.
\end{document}
`;
  await mkdir(target, { recursive: true });
  await writeNew(texPath, source);
  try { await writeNew(configPath, configText(configPath, config)); }
  catch (error) { await rm(texPath, { force: true }); throw error; }
  return { directory: target, texPath, configPath };
}
