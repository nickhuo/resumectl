import { expect, test } from "bun:test";
import { aggregateGrade, gradeFromLevels, gradeMeets, type GradeInput } from "../../src/match/grade.ts";
import type { Level } from "../../src/match/types.ts";

function row(id: string, priority: "required" | "preferred", level: Level, probabilities?: [number, number, number, number]): GradeInput {
  return { id, priority, level, ...(probabilities ? { probabilities } : {}) };
}

test("HiredScore-style letters from per-requirement levels", () => {
  expect(gradeFromLevels(["Demonstrated", "Demonstrated"], ["Demonstrated"])).toBe("A");
  expect(gradeFromLevels(["Demonstrated", "Partial"], [])).toBe("B");
  expect(gradeFromLevels(["Demonstrated", "Demonstrated", "Partial"], [])).toBe("B");
  expect(gradeFromLevels(["Demonstrated", "Partial", "Missing"], [])).toBe("C");
  expect(gradeFromLevels(["Demonstrated", "Missing"], [])).toBe("D");
  expect(gradeFromLevels(["Mentioned", "Mentioned", "Mentioned"], [])).toBe("D");
  expect(gradeFromLevels(["Demonstrated"], [])).toBe("A");
  // No required rows: preferred is the basic set, and there is no further preferred bar.
  expect(gradeFromLevels(["Demonstrated", "Missing"], [])).toBe("D");
});

test("most preferred means more than half, and 70% demonstrated is the A bar", () => {
  expect(gradeFromLevels(["Demonstrated", "Demonstrated"], ["Partial", "Missing"])).toBe("B");
  expect(gradeFromLevels(["Demonstrated", "Demonstrated"], ["Partial", "Partial"])).toBe("A");
  expect(gradeFromLevels(["Demonstrated", "Demonstrated", "Partial"], ["Demonstrated"])).toBe("B");
});

test("aggregateGrade omits a letter when nothing is scored", () => {
  expect(aggregateGrade([])).toEqual({ grade: null, probabilities: null, capped: false });
});

test("point grade uses levels; probabilities are an independent distribution", () => {
  const items = [
    row("a", "required", "Missing", [0.5, 0, 0, 0.5]),
    row("b", "required", "Missing", [0.5, 0, 0, 0.5]),
  ];
  const result = aggregateGrade(items);
  expect(result.grade).toBe("D");
  expect(result.probabilities!.A).toBeCloseTo(0.25);
  expect(result.probabilities!.B).toBeCloseTo(0);
  expect(result.probabilities!.C).toBeCloseTo(0);
  expect(result.probabilities!.D).toBeCloseTo(0.75);
  const sum = Object.values(result.probabilities!).reduce((a, b) => a + b, 0);
  expect(sum).toBeCloseTo(1);
});

test("a stuffing cap cannot raise the grade above B and folds P(A) into P(B)", () => {
  const items = [row("a", "required", "Demonstrated"), row("b", "required", "Demonstrated")];
  expect(aggregateGrade(items).grade).toBe("A");
  const capped = aggregateGrade(items, { capAt: "B" });
  expect(capped.grade).toBe("B");
  expect(capped.capped).toBe(true);
  expect(capped.probabilities!.A).toBe(0);
  expect(capped.probabilities!.B).toBeCloseTo(1);
});

test("adding a demonstrated required requirement does not lower the grade", () => {
  const base = [row("a", "required", "Partial"), row("b", "required", "Missing")];
  const more = [...base, row("c", "required", "Demonstrated")];
  expect(gradeMeets(aggregateGrade(more).grade, aggregateGrade(base).grade!)).toBe(true);
  expect(aggregateGrade(base).grade).toBe("D");
  expect(aggregateGrade(more).grade).toBe("C");
});
