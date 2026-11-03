// jd.requirements.yaml is authored once (by a person or an agent) and then reused.
// The CLI does not invent requirements.
import { InputError } from "../errors.ts";
import { REQUIREMENT_KINDS, type Priority, type RequirementKind } from "./types.ts";

export interface Requirement {
  id: string;
  text: string;
  kind: RequirementKind;
  priority: Priority;
  terms: string[];
  minYears?: number;
  /** Minimum degree for education gates: highschool, associate, bachelor, master, phd. */
  level?: string;
}

export interface RequirementFile {
  version: 1;
  title?: string;
  company?: string;
  source?: string;
  requirements: Requirement[];
}

export interface Profile {
  workAuthorization?: string;
  location?: string;
  openToRemote?: boolean;
  willingToRelocate?: boolean;
  degrees?: { level: string; field?: string }[];
  licenses?: string[];
  /** Statements the user stands behind. Used only for the unbacked-term guard. */
  facts?: string[];
}

const GATE_KINDS = new Set<RequirementKind>(["work_authorization", "location", "license", "years", "education"]);

/** Work auth, location, license, degree, and minimum years stay out of the letter grade. */
export function isHardGate(req: Requirement): boolean {
  return GATE_KINDS.has(req.kind);
}

export function scoredRequirements(reqs: Requirement[]): Requirement[] {
  return reqs.filter(req => !isHardGate(req));
}

/**
 * A skill row may also carry min_years. The years check is a separate gate so the
 * skill itself can still affect the grade. Kind years/education/location/license/
 * work_authorization are gates only.
 */
export function gateRequirements(reqs: Requirement[]): Requirement[] {
  const gates: Requirement[] = [];
  const years: Requirement[] = [];
  for (const req of reqs) {
    if (isHardGate(req)) gates.push(req);
    else if (req.minYears !== undefined) {
      years.push({
        ...req,
        id: `${req.id}#years`,
        kind: "years",
        text: `${req.text} (minimum ${req.minYears} years)`,
      });
    }
  }
  return [...gates, ...years];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new InputError(`${path} must be a non-empty string`);
  return value.trim();
}

export function validateRequirements(value: unknown): RequirementFile {
  if (!isObject(value)) throw new InputError("requirements file must be an object");
  for (const key of Object.keys(value)) {
    if (!["version", "title", "company", "source", "requirements"].includes(key)) {
      throw new InputError(`unknown requirements field: ${key}`);
    }
  }
  if (value.version !== undefined && value.version !== 1) throw new InputError("version must be 1");
  if (!Array.isArray(value.requirements)) throw new InputError("requirements must be a list");
  const seen = new Set<string>();
  const requirements = value.requirements.map((raw, index) => {
    const path = `requirements[${index}]`;
    if (!isObject(raw)) throw new InputError(`${path} must be an object`);
    for (const key of Object.keys(raw)) {
      if (!["id", "text", "kind", "priority", "terms", "min_years", "level"].includes(key)) {
        throw new InputError(`${path}: unknown field ${key}`);
      }
    }
    const id = optionalString(raw.id, `${path}.id`);
    const text = optionalString(raw.text, `${path}.text`);
    if (!id || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new InputError(`${path}.id must be a short token (letters, numbers, _, -)`);
    if (seen.has(id)) throw new InputError(`duplicate requirement id: ${id}`);
    seen.add(id);
    if (!text) throw new InputError(`${path}.text is required`);
    if (typeof raw.kind !== "string" || !(REQUIREMENT_KINDS as readonly string[]).includes(raw.kind)) {
      throw new InputError(`${path}.kind must be one of ${REQUIREMENT_KINDS.join(", ")}`);
    }
    if (raw.priority !== "required" && raw.priority !== "preferred") {
      throw new InputError(`${path}.priority must be required or preferred`);
    }
    let terms: string[] = [];
    if (raw.terms !== undefined) {
      const list = Array.isArray(raw.terms) ? raw.terms : [raw.terms];
      if (!list.length || list.some(term => typeof term !== "string" || !term.trim())) {
        throw new InputError(`${path}.terms must be a non-empty list of strings`);
      }
      terms = list.map(term => (term as string).trim());
    }
    let minYears: number | undefined;
    if (raw.min_years !== undefined) {
      if (typeof raw.min_years !== "number" || !Number.isFinite(raw.min_years) || raw.min_years < 0) {
        throw new InputError(`${path}.min_years must be a number >= 0`);
      }
      minYears = raw.min_years;
    }
    const level = optionalString(raw.level, `${path}.level`);
    return {
      id, text, kind: raw.kind as RequirementKind, priority: raw.priority as Priority, terms,
      ...(minYears !== undefined ? { minYears } : {}),
      ...(level ? { level } : {}),
    };
  });
  return {
    version: 1,
    ...(optionalString(value.title, "title") ? { title: optionalString(value.title, "title") } : {}),
    ...(optionalString(value.company, "company") ? { company: optionalString(value.company, "company") } : {}),
    ...(optionalString(value.source, "source") ? { source: optionalString(value.source, "source") } : {}),
    requirements,
  };
}

export async function loadRequirements(path: string): Promise<RequirementFile> {
  if (!await Bun.file(path).exists()) throw new InputError(`requirements not found: ${path}`);
  let raw: unknown;
  try { raw = Bun.YAML.parse(await Bun.file(path).text()); }
  catch (error) { throw new InputError(`${path}: ${(error as Error).message}`); }
  try { return validateRequirements(raw); }
  catch (error) { throw new InputError(`${path}: ${(error as Error).message}`); }
}

export function validateProfile(value: unknown): Profile {
  if (!isObject(value)) throw new InputError("profile must be an object");
  const known = ["work_authorization", "location", "open_to_remote", "willing_to_relocate", "degrees", "licenses", "facts", "name", "email", "phone"];
  for (const key of Object.keys(value)) if (!known.includes(key)) throw new InputError(`unknown profile field: ${key}`);
  const profile: Profile = {};
  const work = optionalString(value.work_authorization, "work_authorization");
  const location = optionalString(value.location, "location");
  if (work) profile.workAuthorization = work;
  if (location) profile.location = location;
  for (const [key, field] of [["open_to_remote", "openToRemote"], ["willing_to_relocate", "willingToRelocate"]] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "boolean") throw new InputError(`${key} must be true or false`);
      profile[field] = value[key] as boolean;
    }
  }
  if (value.degrees !== undefined) {
    if (!Array.isArray(value.degrees)) throw new InputError("degrees must be a list");
    profile.degrees = value.degrees.map((raw, i) => {
      if (!isObject(raw)) throw new InputError(`degrees[${i}] must be an object`);
      const level = optionalString(raw.level, `degrees[${i}].level`);
      if (!level) throw new InputError(`degrees[${i}].level is required`);
      const field = optionalString(raw.field, `degrees[${i}].field`);
      return field ? { level, field } : { level };
    });
  }
  for (const key of ["licenses", "facts"] as const) {
    if (value[key] !== undefined) {
      if (!Array.isArray(value[key]) || (value[key] as unknown[]).some(item => typeof item !== "string" || !item.trim())) {
        throw new InputError(`${key} must be a list of strings`);
      }
      profile[key] = (value[key] as string[]).map(item => item.trim());
    }
  }
  return profile;
}

export async function loadProfile(path: string): Promise<Profile> {
  if (!await Bun.file(path).exists()) throw new InputError(`profile not found: ${path}`);
  let raw: unknown;
  try { raw = Bun.YAML.parse(await Bun.file(path).text()); }
  catch (error) { throw new InputError(`${path}: ${(error as Error).message}`); }
  try { return validateProfile(raw); }
  catch (error) { throw new InputError(`${path}: ${(error as Error).message}`); }
}
