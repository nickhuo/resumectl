// HiredScore-style letter from per-requirement levels. Never ask a model for A–D.
//
// D — does not meet most required items (met count / required <= 1/2)
// C — meets most required items, but not all
// B — every required item is Partial or Demonstrated
// A — B, most preferred items are met, and at least 70% of required items are Demonstrated
//
// "Met" means Partial or Demonstrated. Mentioned is a keyword hit.
// When there are no required items, preferred items are graded as the basic set.
// A stuffing cap folds A into B. Hard gates are not inputs to this function.
import type { Grade, Level } from "./types.ts";
import { isMet, levelRank, normalizeDistribution } from "./types.ts";

export interface GradeInput {
  id: string;
  priority: "required" | "preferred";
  level: Level;
  probabilities?: readonly [number, number, number, number];
}

export interface GradeResult {
  grade: Grade | null;
  probabilities: Record<Grade, number> | null;
  /** True when the cap changed the letter or moved probability mass off A. */
  capped: boolean;
}

const GRADE_RANK: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1 };

/** True when grade is at least the threshold. A missing grade does not meet any bar. */
export function gradeMeets(grade: Grade | null, threshold: Grade): boolean {
  return grade !== null && GRADE_RANK[grade] >= GRADE_RANK[threshold];
}

export function gradeFromLevels(basic: readonly Level[], preferred: readonly Level[]): Grade {
  const n = basic.length;
  if (n === 0) throw new Error("gradeFromLevels requires at least one requirement");
  const met = basic.filter(isMet).length;
  const demo = basic.filter(level => level === "Demonstrated").length;
  if (met / n <= 0.5) return "D";
  if (met < n) return "C";
  const prefOk = preferred.length === 0 || preferred.filter(isMet).length / preferred.length > 0.5;
  const evidenceOk = demo / n >= 0.7;
  return prefOk && evidenceOk ? "A" : "B";
}

function distribution(item: GradeInput): [number, number, number, number] {
  if (item.probabilities) return normalizeDistribution(item.probabilities);
  return normalizeDistribution([0, 1, 2, 3].map(i => (i === levelRank(item.level) ? 1 : 0)));
}

function fold(items: GradeInput[]): Map<string, number> {
  let states = new Map<string, number>([["0,0", 1]]);
  for (const item of items) {
    const dist = distribution(item);
    const next = new Map<string, number>();
    for (const [key, p] of states) {
      const [met, demo] = key.split(",").map(Number);
      for (let level = 0; level < 4; level++) {
        if (dist[level] === 0) continue;
        const nextKey = `${met + (level >= 2 ? 1 : 0)},${demo + (level === 3 ? 1 : 0)}`;
        next.set(nextKey, (next.get(nextKey) ?? 0) + p * dist[level]);
      }
    }
    states = next;
  }
  return states;
}

function foldMet(items: GradeInput[]): Map<number, number> {
  let states = new Map<number, number>([[0, 1]]);
  for (const item of items) {
    const dist = distribution(item);
    const next = new Map<number, number>();
    for (const [met, p] of states) {
      for (let level = 0; level < 4; level++) {
        if (dist[level] === 0) continue;
        const nextMet = met + (level >= 2 ? 1 : 0);
        next.set(nextMet, (next.get(nextMet) ?? 0) + p * dist[level]);
      }
    }
    states = next;
  }
  return states;
}

function letterFor(basicN: number, basicMet: number, basicDemo: number, prefN: number, prefMet: number): Grade {
  const basicLevels: Level[] = [
    ...Array.from({ length: basicDemo }, () => "Demonstrated" as const),
    ...Array.from({ length: basicMet - basicDemo }, () => "Partial" as const),
    ...Array.from({ length: basicN - basicMet }, () => "Missing" as const),
  ];
  const prefLevels: Level[] = [
    ...Array.from({ length: prefMet }, () => "Partial" as const),
    ...Array.from({ length: prefN - prefMet }, () => "Missing" as const),
  ];
  return gradeFromLevels(basicLevels, prefLevels);
}

export function aggregateGrade(items: GradeInput[], options: { capAt?: Grade | null } = {}): GradeResult {
  if (items.length === 0) return { grade: null, probabilities: null, capped: false };
  const required = items.filter(item => item.priority === "required");
  const preferred = items.filter(item => item.priority === "preferred");
  const basic = required.length ? required : preferred;
  const extras = required.length ? preferred : [];
  const point = gradeFromLevels(basic.map(item => item.level), extras.map(item => item.level));

  const basicStates = fold(basic);
  const extraStates = foldMet(extras);
  const probabilities: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const [key, pBasic] of basicStates) {
    const [met, demo] = key.split(",").map(Number);
    for (const [prefMet, pPref] of extraStates) {
      const letter = letterFor(basic.length, met, demo, extras.length, prefMet);
      probabilities[letter] += pBasic * pPref;
    }
  }

  let grade = point;
  let capped = false;
  const cap = options.capAt ?? null;
  if (cap && (GRADE_RANK[grade] > GRADE_RANK[cap] || probabilities.A > 0 && GRADE_RANK.A > GRADE_RANK[cap])) {
    if (GRADE_RANK[grade] > GRADE_RANK[cap]) grade = cap;
    // A ceiling of B moves every stronger outcome down. C and D stay put.
    if (cap === "B" || cap === "C" || cap === "D") {
      const foldInto = cap;
      for (const letter of ["A", "B", "C", "D"] as const) {
        if (GRADE_RANK[letter] > GRADE_RANK[foldInto] && probabilities[letter] > 0) {
          probabilities[foldInto] += probabilities[letter];
          probabilities[letter] = 0;
          capped = true;
        }
      }
    }
    if (point !== grade) capped = true;
  }
  return { grade, probabilities, capped };
}
