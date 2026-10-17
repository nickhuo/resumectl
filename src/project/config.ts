import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { InputError } from "../errors.ts";
import { resolveInputs, sectionKey, stripComments } from "../content/tex.ts";

export interface LayoutOptions {
  style: "serif" | "sans";
  paper: "a4" | "letter";
  scale: number;
  tracking: number;
  ratio: number;
  margins: { top: string; bottom: string; left: string; right: string };
  bulletSpacing: string;
  bulletIndent: string;
  sectionSpacing: { before: string; after: string };
}
export interface BulletOptions { maxLines: number; minLastLineFill: number }
export interface SectionOptions {
  editable: boolean;
  checks: BulletOptions | false;
}
export interface SectionInput {
  editable?: boolean;
  checks?: Partial<BulletOptions> | false;
}
export interface CheckOptions {
  section?: string;
  bullets: BulletOptions;
  maxPages: number;
}
export interface ResumeConfig {
  version: 1;
  layout: LayoutOptions;
  checks: CheckOptions;
  sections: Record<string, SectionOptions>;
  build: { outDir?: string; keepLogs: boolean };
}
export interface ConfigInput {
  $schema?: string;
  version?: 1;
  layout?: Partial<Omit<LayoutOptions, "margins" | "sectionSpacing">> & {
    margins?: Partial<LayoutOptions["margins"]>;
    sectionSpacing?: Partial<LayoutOptions["sectionSpacing"]>;
  };
  checks?: Partial<Omit<CheckOptions, "bullets">> & { bullets?: Partial<CheckOptions["bullets"]> };
  sections?: Record<string, SectionInput>;
  build?: Partial<ResumeConfig["build"]>;
}
export const CONFIG_NAME = "resume.config.yaml";
export const SCHEMA_PATH = resolve(import.meta.dir, "../../resume.config.schema.json");
export const DEFAULT_CHECKS: CheckOptions = {
  bullets: { maxLines: 2, minLastLineFill: 0.8 }, maxPages: 1,
};
export const DEFAULT_LAYOUT: LayoutOptions = {
  style: "serif", paper: "a4", scale: 0.86, tracking: -1.5, ratio: 1.125,
  margins: { top: "0.4in", bottom: "0.3in", left: "0.35in", right: "0.35in" },
  bulletSpacing: "0.15em", bulletIndent: "1.5pc",
  sectionSpacing: { before: "*1", after: "*1" },
};

type Shape = Record<string, unknown>;
function object(value: unknown, path: string, keys: string[]): Shape {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError(`${path} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new InputError(`unknown config field: ${path}.${key}`);
  return value as Shape;
}
function number(value: unknown, path: string, min: number, max: number, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new InputError(`${path} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}`);
  }
}
function text(value: unknown, path: string) {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x1f]/.test(value)) throw new InputError(`${path} must be a non-empty string without control characters`);
}
function dimension(value: unknown, path: string, absolute = false, multiplier = false) {
  const units = absolute ? "pt|mm|cm|in|pc" : "pt|mm|cm|in|pc|em|ex";
  if (typeof value !== "string" || !(new RegExp(`^(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:${units})$`).test(value)
    || (multiplier && /^\*(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)))) {
    throw new InputError(`${path} must be a non-negative length with units${multiplier ? " or a * multiplier" : ""}`);
  }
}
function bulletOptions(value: unknown, path: string) {
  const b = object(value, path, ["maxLines", "minLastLineFill"]);
  if (b.maxLines !== undefined) number(b.maxLines, `${path}.maxLines`, 1, 100, true);
  if (b.minLastLineFill !== undefined) number(b.minLastLineFill, `${path}.minLastLineFill`, 0, 1);
}
/** Validate both files and CLI/API overrides before any value reaches TeX. */
export function validateConfig(value: unknown): ConfigInput {
  const root = object(value, "config", ["$schema", "version", "layout", "checks", "sections", "build"]);
  if (root.version !== undefined && root.version !== 1) throw new InputError("config.version must be 1");
  if (root.$schema !== undefined) text(root.$schema, "$schema");
  if (root.layout !== undefined) {
    const l = object(root.layout, "layout", ["style", "paper", "scale", "tracking", "ratio", "margins", "bulletSpacing", "bulletIndent", "sectionSpacing"]);
    for (const [key, choices] of [["style", ["serif", "sans"]], ["paper", ["a4", "letter"]]] as const) {
      if (l[key] !== undefined && !(choices as readonly unknown[]).includes(l[key])) throw new InputError(`layout.${key} must be ${choices.join(" or ")}`);
    }
    for (const [key, min, max] of [["scale", 0.1, 4], ["tracking", -10, 20], ["ratio", 1, 2]] as const) {
      if (l[key] !== undefined) number(l[key], `layout.${key}`, min, max);
    }
    if (l.margins !== undefined) {
      const m = object(l.margins, "layout.margins", ["top", "bottom", "left", "right"]);
      for (const [k, v] of Object.entries(m)) dimension(v, `layout.margins.${k}`, true);
    }
    for (const key of ["bulletSpacing", "bulletIndent"]) if (l[key] !== undefined) dimension(l[key], `layout.${key}`);
    if (l.sectionSpacing !== undefined) {
      const s = object(l.sectionSpacing, "layout.sectionSpacing", ["before", "after"]);
      for (const [k, v] of Object.entries(s)) dimension(v, `layout.sectionSpacing.${k}`, false, true);
    }
  }
  if (root.checks !== undefined) {
    const c = object(root.checks, "checks", ["section", "bullets", "maxPages"]);
    if (c.section !== undefined) text(c.section, "checks.section");
    if (c.maxPages !== undefined) number(c.maxPages, "checks.maxPages", 1, 100, true);
    if (c.bullets !== undefined) bulletOptions(c.bullets, "checks.bullets");
  }
  if (root.sections !== undefined) {
    const sections = object(root.sections, "sections", Object.keys(root.sections ?? {}));
    const seen = new Set<string>();
    for (const [name, value] of Object.entries(sections)) {
      text(name, "section name");
      const key = sectionKey(name);
      if (!key || ["__PROTO__", "CONSTRUCTOR", "PROTOTYPE"].includes(key)) throw new InputError(`invalid section name: ${name}`);
      if (seen.has(key)) throw new InputError(`duplicate section name: ${name}`);
      seen.add(key);
      const s = object(value, `sections.${name}`, ["editable", "checks"]);
      if (s.editable !== undefined && typeof s.editable !== "boolean") throw new InputError(`sections.${name}.editable must be a boolean`);
      if (s.checks !== undefined && s.checks !== false) bulletOptions(s.checks, `sections.${name}.checks`);
    }
  }
  if (root.build !== undefined) {
    const b = object(root.build, "build", ["outDir", "keepLogs"]);
    if (b.outDir !== undefined) text(b.outDir, "build.outDir");
    if (b.keepLogs !== undefined && typeof b.keepLogs !== "boolean") throw new InputError("build.keepLogs must be a boolean");
  }
  return value as ConfigInput;
}

const CLASS_KEYS: Record<string, string> = {
  style: "style", paper: "paper", scale: "scale", tracking: "tracking", ratio: "ratio",
  marginTop: "margins.top", marginBottom: "margins.bottom", marginLeft: "margins.left", marginRight: "margins.right",
  bulletSpacing: "bulletSpacing", bulletIndent: "bulletIndent", sectionBefore: "sectionSpacing.before", sectionAfter: "sectionSpacing.after",
};
function setPath(target: Shape, path: string, value: unknown) {
  const parts = path.split(".");
  const last = parts.pop()!;
  let node = target;
  for (const part of parts) node = (node[part] ??= {}) as Shape;
  node[last] = value;
}
export function readSourceLayout(tex: string): ConfigInput["layout"] {
  const match = stripComments(tex).match(/\\documentclass\s*(?:\[([^\]]*)\])?\s*\{\s*resume\s*\}/);
  if (!match) throw new InputError("expected \\documentclass{resume} with literal class options");
  const layout: Shape = {};
  for (const part of (match[1] ?? "").split(",").filter(p => p.trim())) {
    const [name, raw] = part.split("=").map(p => p.trim());
    const key = CLASS_KEYS[name];
    if (!key || raw === undefined) throw new InputError(`unsupported resume class option: ${part.trim()}`);
    setPath(layout, key, ["scale", "tracking", "ratio"].includes(name) ? Number(raw) : raw);
  }
  return validateConfig({ layout }).layout;
}
export function layoutToClassOptions(layout: LayoutOptions): string {
  const l = layout as unknown as Shape;
  return Object.entries(CLASS_KEYS).map(([key, path]) => {
    let value: unknown = l;
    for (const part of path.split(".")) value = (value as Shape)[part];
    return `${key}=${value}`;
  }).join(",");
}
async function discover(start: string): Promise<string | undefined> {
  let dir = resolve(start);
  for (;;) {
    const candidates = [join(dir, CONFIG_NAME), join(dir, "resume.config.yml")];
    const found = [];
    for (const candidate of candidates) if (await Bun.file(candidate).exists()) found.push(candidate);
    if (found.length > 1) throw new InputError(`both resume.config.yaml and resume.config.yml exist in ${dir}; select one with --config`);
    if (found.length) return found[0];
    // A repository's configuration must not accidentally inherit a sibling project's defaults.
    if (existsSync(join(dir, ".git")) || dirname(dir) === dir) return undefined;
    dir = dirname(dir);
  }
}
export interface ResolvedConfig {
  config: ResumeConfig;
  configPath?: string;
  sources: Record<string, string>;
}
export async function resolveConfig(options: { texPath?: string; configPath?: string | null; overrides?: ConfigInput; cwd?: string } = {}): Promise<ResolvedConfig> {
  const cwd = options.cwd ?? process.cwd();
  const texPath = options.texPath ? resolve(cwd, options.texPath) : undefined;
  const configPath = options.configPath === null ? undefined : options.configPath ? resolve(cwd, options.configPath) : await discover(texPath ? dirname(texPath) : cwd);
  let file: ConfigInput = {};
  if (configPath) {
    if (!/\.ya?ml$/i.test(configPath)) throw new InputError("config files must use .yaml or .yml");
    if (!Bun.YAML) throw new InputError("YAML configuration requires Bun >= 1.3; upgrade Bun first");
    if (!await Bun.file(configPath).exists()) throw new InputError(`config not found: ${configPath}`);
    try { file = validateConfig(Bun.YAML.parse(await Bun.file(configPath).text()) ?? {}); }
    catch (error) { throw new InputError(`${configPath}: ${(error as Error).message}`); }
  }
  let source: ConfigInput = {};
  if (texPath) {
    if (!await Bun.file(texPath).exists()) throw new InputError(`TeX source not found: ${texPath}`);
    source = { layout: readSourceLayout(await resolveInputs(await Bun.file(texPath).text(), texPath)) };
  }
  const overrides = validateConfig(options.overrides ?? {});
  const style = overrides.layout?.style ?? file.layout?.style ?? source.layout?.style ?? "serif";
  const config: ResumeConfig = {
    version: 1,
    layout: structuredClone(DEFAULT_LAYOUT),
    checks: structuredClone(DEFAULT_CHECKS),
    sections: {},
    build: { keepLogs: false },
  };
  if (style === "sans") config.layout.sectionSpacing = { before: "*2", after: "*0.8" };
  const sources: Record<string, string> = {};
  function merge(input: Shape, target: Shape, prefix: string, origin: string) {
    for (const [key, value] of Object.entries(input)) {
      if (key === "$schema") continue;
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object") {
        if (!Object.hasOwn(target, key) || !target[key] || typeof target[key] !== "object") target[key] = {};
        merge(value as Shape, target[key] as Shape, path, origin);
      } else { target[key] = value; sources[path] = origin; }
    }
  }
  // Section names are literal keys (including dots), normalized just like rendered headings.
  const normalize = (input: ConfigInput): Shape => ({ ...input, ...(input.sections ? {
    sections: Object.fromEntries(Object.entries(input.sections).map(([name, policy]) => [sectionKey(name), policy])),
  } : {}) });
  const target = config as unknown as Shape;
  const normalizedOverrides = normalize(overrides);
  merge(structuredClone(config) as unknown as Shape, target, "", "default");
  merge(source as Shape, target, "", "documentclass");
  merge(normalize(file), target, "", configPath ?? "config");
  if (file.build?.outDir) config.build.outDir = resolve(dirname(configPath!), file.build.outDir);
  merge(normalizedOverrides, target, "", "override");
  for (const [name, policy] of Object.entries(config.sections)) {
    policy.editable ??= false;
    sources[`sections.${name}.editable`] ??= "default";
    if (policy.checks === false) continue;
    policy.checks = { ...config.checks.bullets, ...policy.checks };
    for (const field of ["maxLines", "minLastLineFill"] as const) {
      const path = `sections.${name}.checks.${field}`;
      sources[path] ??= sources[`checks.bullets.${field}`];
      // CLI/global API overrides apply to selected sections, above file-specific rules.
      if (overrides.checks?.bullets?.[field] !== undefined) {
        policy.checks[field] = overrides.checks.bullets[field]!;
        sources[path] = "override";
      }
      const specific = (normalizedOverrides.sections as Record<string, SectionInput> | undefined)?.[name]?.checks;
      if (specific && specific[field] !== undefined) policy.checks[field] = specific[field]!;
    }
  }
  if (overrides.build?.outDir) config.build.outDir = resolve(cwd, overrides.build.outDir);
  config.build.outDir ??= texPath ? dirname(texPath) : cwd;
  sources["build.outDir"] ??= "source directory";
  const pt = (length: string) => {
    const [, value, unit] = length.match(/^([\d.]+)(\w+)$/)!;
    return Number(value) * ({ pt: 1, in: 72.27, cm: 72.27 / 2.54, mm: 72.27 / 25.4, pc: 12 }[unit]!);
  };
  const m = config.layout.margins;
  const [width, height] = config.layout.paper === "a4" ? [597.508, 845.047] : [614.295, 794.97];
  if (pt(m.left) + pt(m.right) >= width || pt(m.top) + pt(m.bottom) >= height) throw new InputError("layout.margins leave no printable area");
  return { config, configPath, sources };
}
