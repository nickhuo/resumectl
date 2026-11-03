// Fetch a posting when the URL is on a public board, and cache it under jd/<slug>/.
// LinkedIn, Workday, and other login walls are refused: paste the text instead.
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { ExternalServiceError, InputError } from "../errors.ts";
import { htmlToText } from "./text.ts";
import { loadRequirements, type RequirementFile } from "./requirements.ts";

export interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>;
}

export interface CachedPosting {
  cacheDir: string;
  textPath: string;
  requirementsPath: string;
  sourceUrl: string;
  title?: string;
  company?: string;
  extractor: string;
}

export interface ResolvedJd {
  requirements: RequirementFile;
  requirementsPath: string;
  jdText: string | null;
  cacheDir: string | null;
  sourceUrl: string | null;
  title?: string;
  company?: string;
}

const EXAMPLE_YAML = `# Draft only. Copy to jd.requirements.yaml after you review it.
# match does not invent requirements and does not read this file.
version: 1
title: ""
company: ""
requirements:
  - id: example-skill
    text: Replace with one requirement from the posting
    kind: skill
    priority: required
    terms: ["Example"]
`;

export function sanitizeSlug(s: string): string {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return slug || "posting";
}

export function cacheSlugFromUrl(raw: string): string {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  let slug: string;
  if (host.endsWith("greenhouse.io")) {
    const jobs = parts.indexOf("jobs");
    const board = jobs > 0 ? parts[jobs - 1] : parts[0] ?? "board";
    const id = jobs >= 0 ? parts[jobs + 1] : parts.at(-1);
    slug = `${board}-${id ?? "job"}`;
  } else if (host.endsWith("lever.co") || host.endsWith("ashbyhq.com")) {
    slug = parts.slice(0, 2).join("-") || host;
  } else {
    slug = `${host}-${parts.join("-")}`;
  }
  return sanitizeSlug(slug);
}

export function jdCacheDir(cwd: string, slug: string): string {
  return join(cwd, "jd", sanitizeSlug(slug));
}

export function rejectUnsupportedJobUrl(raw: string): void {
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new InputError(`not a valid job URL: ${raw}`); }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InputError("only http(s) job URLs are supported");
  }
  const host = url.hostname.toLowerCase();
  const blocked = host.endsWith("linkedin.com") || host.includes("myworkdayjobs.com")
    || host === "workday.com" || host.endsWith(".workday.com") || host.endsWith("taleo.net");
  if (blocked) {
    throw new InputError(
      `This posting is behind a login or JavaScript wall (${host}). Paste the description into a jd.txt file and pass that path together with a jd.requirements.yaml you review. match does not guess requirements.`,
    );
  }
}

interface BoardTarget {
  kind: "greenhouse" | "lever" | "ashby";
  apiUrl: string;
  slug: string;
  company: string;
}

export function detectBoard(raw: string): BoardTarget | null {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  if (host.endsWith("greenhouse.io")) {
    const jobs = parts.indexOf("jobs");
    if (jobs <= 0 || !parts[jobs + 1]) return null;
    const board = parts[jobs - 1];
    const id = parts[jobs + 1];
    return {
      kind: "greenhouse",
      company: board,
      slug: sanitizeSlug(`${board}-${id}`),
      apiUrl: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(id)}?content=true`,
    };
  }
  if (host.endsWith("lever.co") && parts.length >= 2) {
    const [site, id] = parts;
    return {
      kind: "lever",
      company: site,
      slug: sanitizeSlug(`${site}-${id}`),
      apiUrl: `https://api.lever.co/v0/postings/${encodeURIComponent(site)}/${encodeURIComponent(id)}`,
    };
  }
  if (host.endsWith("ashbyhq.com") && parts.length >= 2) {
    const [org, id] = parts;
    return {
      kind: "ashby",
      company: org,
      slug: sanitizeSlug(`${org}-${id}`),
      apiUrl: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}`,
    };
  }
  return null;
}

export interface PostingText {
  title?: string;
  company?: string;
  text: string;
  extractor: string;
}

export function postingFromGreenhouse(body: unknown, company: string): PostingText {
  const job = asRecord(body);
  const content = typeof job?.content === "string" ? job.content : "";
  if (!content.trim()) throw new ExternalServiceError("Greenhouse returned a job without content. Paste the posting into jd.txt.");
  const title = typeof job?.title === "string" ? job.title : undefined;
  const location = asRecord(job?.location);
  const where = typeof location?.name === "string" ? location.name : "";
  const text = [title, company, where, htmlToText(content)].filter(Boolean).join("\n\n");
  return { title, company, text, extractor: "greenhouse" };
}

export function postingFromLever(body: unknown, company: string): PostingText {
  const job = asRecord(body);
  if (!job) throw new ExternalServiceError("Lever returned an empty posting. Paste the posting into jd.txt.");
  const title = typeof job.text === "string" ? job.text : undefined;
  const description = typeof job.descriptionPlain === "string"
    ? job.descriptionPlain
    : typeof job.description === "string" ? htmlToText(job.description) : "";
  const lists = Array.isArray(job.lists) ? job.lists : [];
  const extra = lists.map(list => {
    const row = asRecord(list);
    const heading = typeof row?.text === "string" ? row.text : "";
    const content = typeof row?.content === "string" ? htmlToText(row.content) : "";
    return [heading, content].filter(Boolean).join("\n");
  }).filter(Boolean);
  const text = [title, company, description, ...extra].filter(Boolean).join("\n\n");
  if (text.trim().length < 40) throw new ExternalServiceError("Lever returned almost no text. Paste the posting into jd.txt.");
  return { title, company, text, extractor: "lever" };
}

export function postingFromAshby(body: unknown, company: string, jobId: string): PostingText | null {
  const root = asRecord(body);
  const jobs = Array.isArray(root?.jobs) ? root.jobs : [];
  const job = jobs.map(asRecord).find(row => row && (row.id === jobId || (typeof row.jobUrl === "string" && row.jobUrl.includes(jobId))));
  if (!job) return null;
  const title = typeof job.title === "string" ? job.title : undefined;
  const description = typeof job.descriptionPlain === "string"
    ? job.descriptionPlain
    : typeof job.descriptionHtml === "string" ? htmlToText(job.descriptionHtml) : "";
  if (!description.trim()) return null;
  return { title, company, text: [title, company, description].filter(Boolean).join("\n\n"), extractor: "ashby" };
}

export function postingFromHtml(html: string, pageUrl: string): PostingText {
  const ld = findJobPosting(html);
  if (ld?.description) {
    const text = [ld.title, ld.company, htmlToText(ld.description)].filter(Boolean).join("\n\n");
    return { title: ld.title, company: ld.company, text, extractor: "jsonld" };
  }
  const text = htmlToText(html);
  if (text.length < 80) {
    throw new InputError(
      `Could not read a job posting from ${pageUrl}. The page looks like a login or JavaScript wall. Paste the description into a jd.txt file and pass that path with a jd.requirements.yaml you review.`,
    );
  }
  return { text, extractor: "html" };
}

function findJobPosting(html: string): { title?: string; company?: string; description?: string } | null {
  for (const block of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const found = walkJob(JSON.parse(block[1]));
      if (found) return found;
    } catch {
      // The next JSON-LD block may still be a JobPosting.
    }
  }
  return null;
}

function walkJob(node: unknown): { title?: string; company?: string; description?: string } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = walkJob(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.includes("JobPosting") && typeof obj.description === "string") {
    const org = asRecord(obj.hiringOrganization);
    return {
      title: typeof obj.title === "string" ? obj.title : undefined,
      company: typeof org?.name === "string" ? org.name : undefined,
      description: obj.description,
    };
  }
  if (obj["@graph"]) return walkJob(obj["@graph"]);
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function getText(url: string, fetchImpl: FetchLike): Promise<{ status: number; text: string }> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { accept: "application/json, text/html" }, signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new ExternalServiceError(`fetch ${new URL(url).host} failed: ${(error as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) throw new ExternalServiceError(`${new URL(url).host} returned ${res.status}: ${text.slice(0, 300)}`);
  return { status: res.status, text };
}

export async function fetchPosting(raw: string, fetchImpl: FetchLike = fetch): Promise<PostingText & { slug: string }> {
  rejectUnsupportedJobUrl(raw);
  const board = detectBoard(raw);
  if (board?.kind === "greenhouse") {
    const { text } = await getText(board.apiUrl, fetchImpl);
    return { ...postingFromGreenhouse(parseJson(text), board.company), slug: board.slug };
  }
  if (board?.kind === "lever") {
    const { text } = await getText(board.apiUrl, fetchImpl);
    return { ...postingFromLever(parseJson(text), board.company), slug: board.slug };
  }
  if (board?.kind === "ashby") {
    try {
      const { text } = await getText(board.apiUrl, fetchImpl);
      const id = new URL(raw).pathname.split("/").filter(Boolean)[1] ?? "";
      const posting = postingFromAshby(parseJson(text), board.company, id);
      if (posting) return { ...posting, slug: board.slug };
    } catch (error) {
      if (!(error instanceof ExternalServiceError)) throw error;
    }
  }
  const { text } = await getText(raw, fetchImpl);
  return { ...postingFromHtml(text, raw), slug: cacheSlugFromUrl(raw) };
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); }
  catch { throw new ExternalServiceError("job board returned non-JSON"); }
}

export async function cachePosting(raw: string, cwd: string, fetchImpl: FetchLike, refresh: boolean): Promise<CachedPosting> {
  rejectUnsupportedJobUrl(raw);
  const slug = detectBoard(raw)?.slug ?? cacheSlugFromUrl(raw);
  const cacheDir = jdCacheDir(cwd, slug);
  const textPath = join(cacheDir, "jd.txt");
  const requirementsPath = join(cacheDir, "jd.requirements.yaml");
  const sourcePath = join(cacheDir, "source.json");
  if (!refresh && await Bun.file(textPath).exists() && await Bun.file(sourcePath).exists()) {
    const source = await Bun.file(sourcePath).json() as { title?: string; company?: string; extractor?: string; url?: string };
    return {
      cacheDir, textPath, requirementsPath, sourceUrl: source.url ?? raw,
      title: source.title, company: source.company, extractor: source.extractor ?? "cache",
    };
  }
  const posting = await fetchPosting(raw, fetchImpl);
  await mkdir(cacheDir, { recursive: true });
  await Bun.write(textPath, posting.text.endsWith("\n") ? posting.text : `${posting.text}\n`);
  const source = {
    url: raw,
    fetchedAt: new Date().toISOString(),
    sha256: createHash("sha256").update(posting.text).digest("hex"),
    extractor: posting.extractor,
    title: posting.title ?? null,
    company: posting.company ?? null,
  };
  await Bun.write(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
  const example = join(cacheDir, "jd.requirements.example.yaml");
  if (!await Bun.file(example).exists()) await Bun.write(example, EXAMPLE_YAML);
  return {
    cacheDir, textPath, requirementsPath, sourceUrl: raw,
    title: posting.title, company: posting.company, extractor: posting.extractor,
  };
}

function isUrl(spec: string): boolean {
  return /^https?:\/\//i.test(spec);
}

async function readOptional(path: string): Promise<string | null> {
  return await Bun.file(path).exists() ? Bun.file(path).text() : null;
}

export async function resolveJd(spec: string, options: { cwd?: string; refresh?: boolean; fetch?: FetchLike } = {}): Promise<ResolvedJd> {
  const cwd = options.cwd ?? process.cwd();
  if (isUrl(spec)) {
    const cached = await cachePosting(spec, cwd, options.fetch ?? fetch, options.refresh ?? false);
    if (!await Bun.file(cached.requirementsPath).exists()) {
      throw new InputError(
        `Cached the posting at ${cached.textPath}. Write ${cached.requirementsPath} (one requirement per row; see jd.requirements.example.yaml) and run match again. match does not invent requirements.`,
      );
    }
    const requirements = await loadRequirements(cached.requirementsPath);
    return {
      requirements,
      requirementsPath: cached.requirementsPath,
      jdText: await readOptional(cached.textPath),
      cacheDir: cached.cacheDir,
      sourceUrl: cached.sourceUrl,
      title: requirements.title ?? cached.title,
      company: requirements.company ?? cached.company,
    };
  }
  const path = resolve(cwd, spec);
  const file = Bun.file(path);
  if (!await file.exists()) throw new InputError(`job description not found: ${path}`);
  // A directory is a cache folder: jd/<slug>/.
  if (await isDirectory(path)) {
    const requirementsPath = join(path, "jd.requirements.yaml");
    if (!await Bun.file(requirementsPath).exists()) {
      throw new InputError(`${path} has no jd.requirements.yaml. Draft one from jd.txt, then re-run match.`);
    }
    const requirements = await loadRequirements(requirementsPath);
    return {
      requirements,
      requirementsPath,
      jdText: await readOptional(join(path, "jd.txt")),
      cacheDir: path,
      sourceUrl: null,
      title: requirements.title,
      company: requirements.company,
    };
  }
  if (/\.ya?ml$/i.test(path)) {
    const requirements = await loadRequirements(path);
    const sibling = join(dirname(path), "jd.txt");
    return {
      requirements,
      requirementsPath: path,
      jdText: await readOptional(sibling),
      cacheDir: basename(path) === "jd.requirements.yaml" ? dirname(path) : null,
      sourceUrl: requirements.source ?? null,
      title: requirements.title,
      company: requirements.company,
    };
  }
  if (/\.txt$/i.test(path)) {
    const requirementsPath = join(dirname(path), "jd.requirements.yaml");
    if (!await Bun.file(requirementsPath).exists()) {
      throw new InputError(
        `${path} has no jd.requirements.yaml beside it. Requirements are written once and reviewed; match will not extract them for you.`,
      );
    }
    const requirements = await loadRequirements(requirementsPath);
    return {
      requirements,
      requirementsPath,
      jdText: await file.text(),
      cacheDir: dirname(path),
      sourceUrl: requirements.source ?? null,
      title: requirements.title,
      company: requirements.company,
    };
  }
  throw new InputError("--jd must be an http(s) URL, a .txt posting, a requirements .yaml file, or a directory that contains jd.requirements.yaml");
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
