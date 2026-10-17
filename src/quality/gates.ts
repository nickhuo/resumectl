// Quality gates based on the actual rendered paragraphs, PDF pages and text maps.
import { DEFAULT_CHECKS, layoutToClassOptions, validateConfig, type BulletOptions, type CheckOptions, type LayoutOptions, type SectionInput } from "../project/config.ts";
import { InputError } from "../errors.ts";
import { hash, readManifest, type RenderedBullet } from "../rendering/measurements.ts";
import { countPdfPages, findPrivateUseMappings } from "./pdf.ts";
import { type ClassOptions, extractSectionEntries, resolveInputs, sectionKey, stripToVisible } from "../content/tex.ts";

export type GateOptions = CheckOptions & { sections?: Record<string, SectionInput> };
export type GateOverrides = Partial<Omit<GateOptions, "bullets">> & { bullets?: Partial<GateOptions["bullets"]> };
export const DEFAULT_GATE_OPTIONS = DEFAULT_CHECKS;

export interface BulletResult extends RenderedBullet {
  index: number;
  text: string;
  status: "ok" | "too-many-lines" | "sparse-last-line" | "overflow";
}
export interface GateReport {
  classOptions: ClassOptions;
  layout: LayoutOptions;
  options: GateOptions;
  bullets: BulletResult[];
  sections: SectionResult[];
  pages: number;
  privateUse: number[];
  overflows: string[];
  bulletsPass: boolean;
  pagesPass: boolean;
  textPass: boolean;
  pass: boolean;
}
export interface SectionResult {
  section: string;
  editable: boolean;
  checks: BulletOptions | false;
  bullets: BulletResult[];
  pass: boolean;
}
export function checkBullets(rendered: RenderedBullet[], options: GateOptions, texts: string[] = []): BulletResult[] {
  const section = options.section ?? "WORK EXPERIENCE";
  const bullets = rendered.filter(b => sectionKey(b.section) === sectionKey(section));
  return bullets.map((b, i) => {
    if (b.unsupported) throw new InputError(`entry ${i + 1} in ${section} contains a nested list; use flat itemize bullets`);
    const status = b.lastLineWidthPt > b.lineWidthPt + 0.1 ? "overflow"
      : b.lines > options.bullets.maxLines ? "too-many-lines"
      : b.lastLineFill + 1e-6 < options.bullets.minLastLineFill ? "sparse-last-line" : "ok";
    return { ...b, index: i + 1, text: texts.length === bullets.length ? stripToVisible(texts[i]) : "", status };
  });
}
export function parseLogPageCount(log: string): number | null {
  const m = log.replace(/\r?\n/g, "").match(/Output written on .*?\((\d+) pages?\)/);
  return m ? Number(m[1]) : null;
}
export async function runGates(texPath: string, pdfPath: string, overrides: GateOverrides = {}, expectedLayout?: LayoutOptions): Promise<GateReport> {
  const { sections: sectionPolicies, ...checkOverrides } = overrides;
  validateConfig({ checks: checkOverrides, ...(sectionPolicies !== undefined ? { sections: sectionPolicies } : {}) });
  const options = { ...DEFAULT_CHECKS, ...overrides, bullets: { ...DEFAULT_CHECKS.bullets, ...overrides.bullets } };
  if (!await Bun.file(texPath).exists()) throw new InputError(`TeX source not found: ${texPath}`);
  if (!await Bun.file(pdfPath).exists()) throw new InputError(`PDF not found: ${pdfPath}`);
  const tex = await resolveInputs(await Bun.file(texPath).text(), texPath);
  const bytes = await Bun.file(pdfPath).bytes();
  const manifest = await readManifest(pdfPath);
  validateConfig({ layout: manifest.layout });
  if (hash(bytes) !== manifest.pdfHash || hash(tex) !== manifest.sourceHash) {
    throw new InputError("PDF/source no longer match the saved render measurements; rebuild the PDF");
  }
  if (expectedLayout && layoutToClassOptions(expectedLayout) !== layoutToClassOptions(manifest.layout)) {
    throw new InputError("layout config differs from the PDF's build config; rebuild or use the same layout options");
  }
  const policies = new Map(Object.entries(sectionPolicies ?? {}).map(([name, policy]) => [sectionKey(name), policy]));
  // A legacy selector (or --section) narrows the report; otherwise check every configured section.
  const selected = options.section ? [sectionKey(options.section)] : policies.size ? [...policies.keys()] : ["WORK EXPERIENCE"];
  const sections: SectionResult[] = selected.map(section => {
    const policy = policies.get(section);
    const editable = policy?.editable ?? false;
    if (policy?.checks === false) return { section, editable, checks: false, bullets: [], pass: true };
    const checks = { ...options.bullets, ...policy?.checks };
    const bullets = checkBullets(manifest.bullets, { ...options, section, bullets: checks }, extractSectionEntries(tex, section));
    if (!bullets.length) throw new InputError(`found no rendered bullets or entries in section "${section}"; check the section name or wrap prose/table descriptions in \\resumeentry{...}`);
    return { section, editable, checks, bullets, pass: bullets.every(b => b.status === "ok") };
  });
  const bullets = sections.flatMap(s => s.bullets);
  let pages = countPdfPages(bytes);
  if (pages === null) {
    const log = Bun.file(pdfPath.replace(/\.pdf$/i, ".log"));
    if (await log.exists()) pages = parseLogPageCount(await log.text());
  }
  if (pages === null) throw new InputError(`could not read the page count of ${pdfPath}`);
  const privateUse = findPrivateUseMappings(bytes);
  const bulletsPass = bullets.every(b => b.status === "ok") && manifest.overflows.length === 0;
  const pagesPass = pages <= options.maxPages;
  const textPass = privateUse.length === 0;
  const layout = manifest.layout;
  const classOptions: ClassOptions = { style: layout.style, scale: layout.style === "sans" ? layout.scale : 1, tracking: layout.style === "sans" ? layout.tracking : 0 };
  return { classOptions, layout, options, sections, bullets, pages, privateUse, overflows: manifest.overflows, bulletsPass, pagesPass, textPass, pass: bulletsPass && pagesPass && textPass };
}
export function formatReport(r: GateReport): string {
  return [
    `Gate 1 — rendered content length (${r.layout.style}, ${r.layout.paper})`,
    ...r.sections.flatMap(s => s.checks === false ? [`  ${s.section}: SKIP (checks disabled; AI editable: ${s.editable})`] : [
      `  ${s.section}: ≤ ${s.checks.maxLines} line${s.checks.maxLines === 1 ? "" : "s"}, last line ≥ ${Math.round(s.checks.minLastLineFill * 100)}% full; AI editable: ${s.editable}`,
      `    ${s.bullets.length} ${s.bullets.length === 1 ? "entry" : "entries"} — ${s.pass ? "PASS" : "FAIL"}`,
      ...s.bullets.filter(b => b.status !== "ok").map(b => `    ${b.status.toUpperCase()} ${s.section} #${b.index}: ${b.lines} lines, last line ${(b.lastLineFill * 100).toFixed(1)}% full${b.text ? ` — ${b.text.slice(0, 80)}${b.text.length > 80 ? "…" : ""}` : ""}`),
    ]),
    ...r.overflows.map(s => `  OVERFLOW: ${s}`),
    `  ${r.bulletsPass ? "PASS" : "FAIL"}`, "",
    `Gate 2 — at most ${r.options.maxPages} page${r.options.maxPages === 1 ? "" : "s"}`,
    `  pages    ${r.pages}`, `  ${r.pagesPass ? "PASS" : "FAIL"}`, "",
    "Gate 3 — text copies cleanly (no private-use characters)",
    ...r.privateUse.map(cp => `  private-use mapping: U+${cp.toString(16).toUpperCase()}`),
    `  ${r.textPass ? "PASS" : "FAIL"}`, "",
    r.pass ? "OK — all gates passed." : "FAIL — revise the flagged content or layout, then rebuild.",
  ].join("\n");
}
