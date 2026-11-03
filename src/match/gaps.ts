// Gaps tell an agent what kind of edit is honest. They never suggest inventing a metric.
import type { GateResult } from "./hard-gates.ts";
import type { EvidenceSnippet } from "./evidence.ts";
import type { ParseFinding } from "./resume.ts";
import type { Requirement } from "./requirements.ts";
import { containsTerm } from "./text.ts";
import type { GapType, Level, Priority } from "./types.ts";

export interface Gap {
  type: GapType;
  priority: Priority | "parse";
  requirementId?: string;
  detail: string;
}

const FIX_ORDER: Record<GapType, number> = {
  wording: 0,
  placement: 1,
  parse: 2,
  "missing evidence": 3,
  knockout: 4,
};

export interface RowForGaps {
  id: string;
  level: Level;
  matchType: "exact" | "alias" | "model" | "fallback" | "none";
  evidence: EvidenceSnippet[];
}

export function buildGaps(
  reqs: Requirement[],
  rows: RowForGaps[],
  gates: GateResult[],
  parse: ParseFinding[],
): Gap[] {
  const gaps: Gap[] = [];
  for (const row of rows) {
    const req = reqs.find(item => item.id === row.id);
    if (!req) continue;
    const canonical = req.terms[0];
    const quotes = row.evidence.map(snippet => snippet.quote).join(" ");
    const aliasOnly = !!canonical && row.matchType === "alias" && !containsTerm(quotes, canonical);
    if (row.level === "Missing") {
      gaps.push({
        type: "missing evidence",
        priority: req.priority,
        requirementId: req.id,
        detail: `No résumé evidence for "${req.text}". Ask the user. Do not invent a bullet, tool, or metric.`,
      });
    } else if (row.level === "Mentioned") {
      gaps.push({
        type: "placement",
        priority: req.priority,
        requirementId: req.id,
        detail: aliasOnly
          ? `${req.id} is only mentioned, and not with the posting's term "${canonical}". If the work is real, use that term inside a bullet that already has a mechanism or result.`
          : `${req.id} is only mentioned (skills list or summary). If the work is real, move it into a role or project bullet that already has a mechanism or result.`,
      });
    } else if (aliasOnly) {
      gaps.push({
        type: "wording",
        priority: req.priority,
        requirementId: req.id,
        detail: `Evidence exists for ${req.id}, but the résumé does not use the posting's term "${canonical}". Use that term only if it accurately describes the work.`,
      });
    } else if (row.level === "Partial") {
      gaps.push({
        type: "missing evidence",
        priority: req.priority,
        requirementId: req.id,
        detail: `${req.id} is partial: a bullet uses the requirement without scope or a concrete outcome. Add outcome only from facts the user already confirmed.`,
      });
    }
  }
  for (const gate of gates) {
    if (gate.priority !== "required") continue;
    if (gate.level === "Partial" || gate.level === "Demonstrated") continue;
    gaps.push({
      type: "knockout",
      priority: "required",
      requirementId: gate.id,
      detail: `${gate.kind}: ${gate.detail} This is an application-form risk, not a reason to change dates, titles, or credentials.`,
    });
  }
  for (const finding of parse) {
    if (finding.ok) continue;
    gaps.push({ type: "parse", priority: "parse", detail: `${finding.code}: ${finding.detail}` });
  }
  return gaps.sort((a, b) => {
    const pri = (priority: Gap["priority"]) => priority === "required" ? 0 : priority === "preferred" ? 1 : 2;
    return pri(a.priority) - pri(b.priority) || FIX_ORDER[a.type] - FIX_ORDER[b.type];
  });
}
