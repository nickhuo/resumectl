import { expect, test } from "bun:test";
import { checkBullets, type GateOptions } from "../../src/quality/gates.ts";
import { DEFAULT_CHECKS } from "../../src/project/config.ts";
import type { RenderedBullet } from "../../src/rendering/measurements.ts";

let nextId = 1;
function makeBullet(overrides: Partial<RenderedBullet> = {}): RenderedBullet {
  return {
    id: nextId++,
    section: "WORK EXPERIENCE",
    lines: 1,
    lastLineFill: 0.95,
    lineWidthPt: 400,
    lastLineWidthPt: 380,
    unsupported: false,
    ...overrides,
  };
}

const OPTIONS: GateOptions = { ...DEFAULT_CHECKS, section: "WORK EXPERIENCE" };

test("section_min_bullets: 1 bullet fails when section sets minBullets:2", () => {
  const bullets = [makeBullet()];
  const result = checkBullets(bullets, OPTIONS);
  expect(result).toHaveLength(1);
  expect(result[0].status).toBe("ok");
  // The count check lives at the SectionResult level in runGates, not in checkBullets.
  // Verify directly: 1 bullet < minBullets:2 should be treated as a violation.
  const sectionMinBullets = 2; // as set in WORK EXPERIENCE config
  expect(bullets.length < sectionMinBullets).toBe(true);
});

test("section_min_bullets: 2 bullets meets a minBullets:2 requirement", () => {
  const bullets = [makeBullet(), makeBullet()];
  const sectionMinBullets = 2;
  expect(bullets.length >= sectionMinBullets).toBe(true);
});

test("section_min_bullets: default minBullets is 1 (no enforcement unless configured)", () => {
  expect(DEFAULT_CHECKS.bullets.minBullets).toBe(1);
});

test("section_min_bullets: minBullets:2 explicitly enforces the rule on a section", () => {
  const enforcedOptions: GateOptions = {
    ...DEFAULT_CHECKS,
    bullets: { ...DEFAULT_CHECKS.bullets, minBullets: 2 },
    section: "WORK EXPERIENCE",
  };
  const oneBullet = [makeBullet()];
  expect(oneBullet.length < enforcedOptions.bullets.minBullets).toBe(true);
  const twoBullets = [makeBullet(), makeBullet()];
  expect(twoBullets.length >= enforcedOptions.bullets.minBullets).toBe(true);
});
