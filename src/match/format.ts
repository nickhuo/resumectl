import type { MatchReport } from "./run.ts";

const LETTER: Record<string, string> = { A: "A", B: "B", C: "C", D: "D" };

function pct(p: number): string {
  return `${Math.round(p * 1000) / 10}%`;
}

/** Human report. The JSON report is the same object, printed by the CLI. */
export function formatMatchReport(report: MatchReport): string {
  const lines: string[] = [
    "resumectl match — diagnostic coverage",
    "Not an ATS score. Not a prediction that an employer will pass or reject this résumé.",
    "",
  ];
  if (report.grade) {
    lines.push(`Grade ${LETTER[report.grade]}${report.gradeCapped ? " (capped at B by the stuffing guard)" : ""}`);
    if (report.gradeProbabilities) {
      const p = report.gradeProbabilities;
      lines.push(`  P(A) ${pct(p.A)}   P(B) ${pct(p.B)}   P(C) ${pct(p.C)}   P(D) ${pct(p.D)}`);
      lines.push("  These probabilities are uncalibrated until you label your own examples.");
    }
  } else {
    lines.push("Grade — (no scored requirements; hard gates are not averaged into a grade)");
  }
  lines.push(`Decider  ${report.decider}${report.model ? ` (${report.model})` : ""}`);
  if (report.stuffing.length) {
    lines.push("", "Stuffing guard");
    for (const finding of report.stuffing) lines.push(`  ${finding.kind}${finding.requirementId ? ` ${finding.requirementId}` : ""} — ${finding.detail}`);
  }
  lines.push("", "Hard gates (not included in the grade)");
  if (!report.hardGates.length) lines.push("  (none)");
  for (const gate of report.hardGates) {
    lines.push(`  ${gate.level.padEnd(12)} ${gate.priority.padEnd(9)} ${gate.id} — ${gate.detail}`);
  }
  lines.push("", "Requirements");
  if (!report.requirements.length) lines.push("  (none)");
  for (const row of report.requirements) {
    const quote = row.evidence[0]?.quote;
    const adjusted = row.modelLevel ? ` (model said ${row.modelLevel}; skills-list-only cap applied)` : "";
    const fallback = row.fallback ? " (decider abstained; local match used)" : "";
    lines.push(`  ${row.level.padEnd(12)} ${row.priority.padEnd(9)} ${row.id.padEnd(16)} ${row.matchType}${adjusted}${fallback}`);
    if (quote) lines.push(`    "${quote}"`);
  }
  lines.push("", "Gaps");
  if (!report.gaps.length) lines.push("  (none)");
  report.gaps.forEach((gap, i) => {
    lines.push(`  ${i + 1}. ${gap.type}${gap.requirementId ? `  ${gap.requirementId}` : ""} — ${gap.detail}`);
  });
  lines.push("", "Parse");
  for (const finding of report.parse) lines.push(`  ${finding.ok ? "ok" : "FIX"} ${finding.code}: ${finding.detail}`);
  lines.push("", report.disclaimer);
  return lines.join("\n");
}
