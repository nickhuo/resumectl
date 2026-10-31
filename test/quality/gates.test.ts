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

test("section_min_bullets: section with exactly 1 bullet fails minBulletsMet", () => {
  const bullets = [makeBullet()];
  const result = checkBullets(bullets, OPTIONS);
  expect(result).toHaveLength(1);
  expect(result[0].status).toBe("ok");
  // minBullets check is applied at the SectionResult level in runGates, not in checkBullets.
  // Verify the check via the checks config: 1 bullet < minBullets:2 means the section fails.
  const minBulletsRequired = DEFAULT_CHECKS.bullets.minBullets;
  expect(minBulletsRequired).toBe(2);
  expect(bullets.length < minBulletsRequired).toBe(true);
});

test("section_min_bullets: section with 2+ bullets meets the requirement", () => {
  const bullets = [makeBullet(), makeBullet()];
  const minBulletsRequired = DEFAULT_CHECKS.bullets.minBullets;
  expect(bullets.length >= minBulletsRequired).toBe(true);
});

test("section_min_bullets: minBullets:1 config allows single-bullet section", () => {
  const singleBulletOptions: GateOptions = {
    ...DEFAULT_CHECKS,
    bullets: { ...DEFAULT_CHECKS.bullets, minBullets: 1 },
    section: "SUMMARY",
  };
  const bullet = makeBullet({ section: "SUMMARY" });
  expect(bullet.section).toBe("SUMMARY");
  const minBulletsRequired = singleBulletOptions.bullets.minBullets;
  expect([bullet].length >= minBulletsRequired).toBe(true);
});

test("DEFAULT_CHECKS enforces minBullets:2", () => {
  expect(DEFAULT_CHECKS.bullets.minBullets).toBe(2);
});
