// ATS view of a résumé: the same visible-text extraction the length gate uses,
// plus role dates and section placement. The PDF is consulted only for private-use
// mappings (Gate 3). Match does not OCR the page.
import { stripComments, stripToVisible, sectionKey } from "../content/tex.ts";
import { findEmail, findPhone } from "./text.ts";

export type SectionKind = "experience" | "projects" | "skills" | "summary" | "education" | "other";

export interface ResumeBullet {
  section: string;
  sectionKind: SectionKind;
  text: string;
  roleIndex?: number;
}

export interface ResumeRole {
  org: string;
  title: string;
  location: string;
  dates: string;
  start: Date | null;
  end: Date | null;
  missingDates: boolean;
  bullets: string[];
}

export interface EducationEntry {
  label: string;
  dates: string;
  detail: string;
}

export interface ParseFinding {
  code: string;
  ok: boolean;
  detail: string;
}

export interface ResumeView {
  name: string;
  contact: string;
  email?: string;
  phone?: string;
  locationHints: string[];
  sections: { name: string; kind: SectionKind }[];
  roles: ResumeRole[];
  education: EducationEntry[];
  bullets: ResumeBullet[];
  visibleText: string;
  parse: ParseFinding[];
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const HEADING = /\\section\*?\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;

export function readBrace(src: string, open: number): { inner: string; end: number } | null {
  if (src[open] !== "{") return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "\\") { i++; continue; }
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return { inner: src.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

interface CommandHit { args: string[]; index: number; end: number }

function commands(src: string, name: string): CommandHit[] {
  const out: CommandHit[] = [];
  const re = new RegExp(`\\\\${name}\\b\\s*`, "g");
  for (const match of src.matchAll(re)) {
    let i = match.index! + match[0].length;
    const args: string[] = [];
    while (src[i] === "{") {
      const brace = readBrace(src, i);
      if (!brace) break;
      args.push(brace.inner);
      i = brace.end;
      while (src[i] === " " || src[i] === "\n" || src[i] === "\t") i++;
    }
    out.push({ args, index: match.index!, end: i });
  }
  return out;
}

function sectionKind(name: string): SectionKind {
  const key = sectionKey(name);
  if (/WORK|EXPERIENCE|EMPLOYMENT|HISTORY/.test(key)) return "experience";
  if (/PROJECT/.test(key)) return "projects";
  if (/SKILL|TECHNOLOG|TOOL/.test(key)) return "skills";
  if (/SUMMARY|PROFILE|OBJECTIVE|ABOUT/.test(key)) return "summary";
  if (/EDUCATION/.test(key)) return "education";
  return "other";
}

function itemTexts(span: string): string[] {
  return [...span.matchAll(/\\item\b([\s\S]*?)(?=\\item\b|\\end\{(?:itemize|plainlist)\}|\\datedsubsection\b|$)/g)]
    .map(match => stripToVisible(match[1]))
    .filter(Boolean);
}

export function parseMonthYear(raw: string): Date | null {
  const text = stripToVisible(raw).toLowerCase().replace(/\./g, "").trim();
  const month = text.match(/^([a-z]+)\s+(\d{4})$/);
  if (month && MONTHS[month[1]] !== undefined) return new Date(Date.UTC(Number(month[2]), MONTHS[month[1]], 1));
  const year = text.match(/^(\d{4})$/);
  if (year) return new Date(Date.UTC(Number(year[1]), 0, 1));
  return null;
}

/** Inclusive month span. "Jan 2022 – Jan 2024" is 25 months, "Jun 2023 – Jun 2023" is 1. */
export function parseDateRange(raw: string, now: Date): { start: Date; end: Date } | null {
  const text = stripToVisible(raw).replace(/\s+/g, " ").trim();
  const parts = text.split(/\s*(?:–|—|-|to)\s*/i).filter(Boolean);
  if (parts.length < 2) return null;
  const start = parseMonthYear(parts[0]);
  const endRaw = parts[parts.length - 1];
  const end = /^(present|current|now|ongoing)$/i.test(endRaw)
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    : parseMonthYear(endRaw);
  if (!start || !end || monthIndex(end) < monthIndex(start)) return null;
  return { start, end };
}

export function monthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

export function totalWorkYears(roles: ResumeRole[]): { years: number; unparsed: number } {
  const spans = roles.flatMap(role => role.start && role.end ? [{ start: monthIndex(role.start), end: monthIndex(role.end) }] : []);
  spans.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (!last || span.start > last.end + 1) merged.push({ ...span });
    else last.end = Math.max(last.end, span.end);
  }
  const months = merged.reduce((sum, span) => sum + (span.end - span.start + 1), 0);
  return { years: months / 12, unparsed: roles.filter(role => role.missingDates).length };
}

function contactParts(raw: string): string[] {
  return raw.split(/\\sep\b/).map(part => stripToVisible(part)).filter(Boolean);
}

function looksLikeUrl(s: string): boolean {
  return /\.[a-z]{2,}\b/i.test(s) && !/\s/.test(s);
}

export function parseResume(tex: string, now = new Date()): ResumeView {
  const src = stripComments(tex);
  const name = stripToVisible(commands(src, "name")[0]?.args[0] ?? "");
  const info = commands(src, "basicInfo")[0];
  const parts = info ? contactParts(info.args[0] ?? "") : [];
  const contact = parts.join(" · ");
  const email = findEmail(contact);
  const phone = findPhone(contact);
  const locationHints = parts.filter(part => part !== email && part !== phone && !looksLikeUrl(part));

  const headings = [...src.matchAll(HEADING)];
  const sections = headings.map((heading, i) => ({
    name: stripToVisible(heading[1]),
    index: heading.index!,
    body: src.slice(heading.index! + heading[0].length, headings[i + 1]?.index),
  }));

  const roles: ResumeRole[] = [];
  const education: EducationEntry[] = [];
  const bullets: ResumeBullet[] = [];
  const listed: { name: string; kind: SectionKind }[] = [];

  for (const section of sections) {
    const kind = sectionKind(section.name);
    listed.push({ name: section.name, kind });
    if (kind === "experience") {
      const blocks = commands(section.body, "datedsubsection");
      if (!blocks.length) {
        for (const text of [...itemTexts(section.body), ...commands(section.body, "resumeentry").map(hit => stripToVisible(hit.args[0] ?? ""))]) {
          if (text) bullets.push({ section: section.name, sectionKind: kind, text });
        }
        continue;
      }
      blocks.forEach((block, roleIndex) => {
        const span = section.body.slice(block.end, blocks[roleIndex + 1]?.index ?? section.body.length);
        const line = commands(span, "datedline")[0];
        const dates = stripToVisible(block.args[1] ?? "");
        const range = dates ? parseDateRange(dates, now) : null;
        const roleBullets = [
          ...itemTexts(span),
          ...commands(span, "resumeentry").map(hit => stripToVisible(hit.args[0] ?? "")),
        ].filter(Boolean);
        const role: ResumeRole = {
          org: stripToVisible(block.args[0] ?? ""),
          title: stripToVisible(line?.args[0] ?? ""),
          location: stripToVisible(line?.args[1] ?? ""),
          dates,
          start: range?.start ?? null,
          end: range?.end ?? null,
          missingDates: !range,
          bullets: roleBullets,
        };
        roles.push(role);
        if (role.location) locationHints.push(role.location);
        for (const text of roleBullets) bullets.push({ section: section.name, sectionKind: kind, text, roleIndex });
      });
      continue;
    }
    if (kind === "education") {
      const blocks = commands(section.body, "datedsubsection");
      for (const block of blocks) {
        const spanEnd = blocks[blocks.indexOf(block) + 1]?.index ?? section.body.length;
        const span = section.body.slice(block.end, spanEnd);
        const detail = [...itemTexts(span), ...commands(span, "resumeentry").map(hit => stripToVisible(hit.args[0] ?? ""))].filter(Boolean).join(" ");
        const label = stripToVisible(block.args[0] ?? "");
        education.push({ label, dates: stripToVisible(block.args[1] ?? ""), detail });
        if (label) bullets.push({ section: section.name, sectionKind: kind, text: label });
        if (detail) bullets.push({ section: section.name, sectionKind: kind, text: detail });
      }
      continue;
    }
    if (kind === "projects") {
      const links = commands(section.body, "projectlink");
      const entries = commands(section.body, "resumeentry");
      const count = Math.max(links.length, entries.length);
      for (let i = 0; i < count; i++) {
        const title = stripToVisible(links[i]?.args[1] ?? "");
        const body = stripToVisible(entries[i]?.args[0] ?? "");
        const text = [title, body].filter(Boolean).join(": ");
        if (text) bullets.push({ section: section.name, sectionKind: kind, text });
      }
      for (const text of itemTexts(section.body)) bullets.push({ section: section.name, sectionKind: kind, text });
      continue;
    }
    const texts = [
      ...itemTexts(section.body),
      ...commands(section.body, "resumeentry").map(hit => stripToVisible(hit.args[0] ?? "")),
    ].filter(Boolean);
    if (!texts.length) {
      const plain = stripToVisible(section.body);
      if (plain) texts.push(plain);
    }
    for (const text of texts) bullets.push({ section: section.name, sectionKind: kind, text });
  }

  // Built from parsed fields. stripToVisible on the whole source glues adjacent
  // command arguments together ("Co" + "Jan"), which would pollute n-gram checks.
  const visibleText = [
    name, contact,
    ...roles.flatMap(role => [role.org, role.title, role.location, role.dates]),
    ...bullets.map(bullet => bullet.text),
  ].filter(Boolean).join("\n");
  const firstSection = headings[0]?.index ?? src.length;
  const nameAt = commands(src, "name")[0]?.index ?? Number.POSITIVE_INFINITY;
  const infoAt = info?.index ?? Number.POSITIVE_INFINITY;
  const contactAtTop = Math.min(nameAt, infoAt) < firstSection;
  const undated = roles.filter(role => role.missingDates).length;
  const parse: ParseFinding[] = [
    { code: "sections", ok: listed.length > 0, detail: listed.length ? listed.map(s => s.name).join(", ") : "No \\section headings found." },
    { code: "work_history", ok: roles.length > 0, detail: roles.length ? `${roles.length} dated role(s).` : "No work-history roles found." },
    { code: "education", ok: education.length > 0, detail: education.length ? education.map(e => e.label).join("; ") : "No education entries found." },
    {
      code: "role_dates",
      ok: roles.length > 0 && undated === 0,
      detail: undated ? `${undated} role(s) have missing or unparsed dates and were not counted toward years.` : "Every role has a parseable date range.",
    },
    { code: "email", ok: !!email, detail: email ? "Email is in the contact line." : "No email in \\basicInfo." },
    { code: "phone", ok: !!phone, detail: phone ? "Phone is in the contact line." : "No phone number in \\basicInfo." },
    { code: "contact_at_top", ok: contactAtTop, detail: contactAtTop ? "Name or contact appears before the first section." : "Contact details are not before the first section." },
    {
      code: "single_column",
      ok: !/\\begin\{multicols\}|\\twocolumn\b/.test(src),
      detail: /\\begin\{multicols\}|\\twocolumn\b/.test(src) ? "Source uses a multi-column environment." : "No multi-column environment in the source.",
    },
  ];

  return { name, contact, email, phone, locationHints, sections: listed, roles, education, bullets, visibleText, parse };
}
