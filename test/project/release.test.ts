import { expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const read = (path: string) => Bun.file(resolve(root, path));

test("the skill pins the package version being published", async () => {
  const { version } = await read("package.json").json();
  const pins = [...(await read("skills/resumectl/SKILL.md").text()).matchAll(/resumectl@([\w.-]+)/g)].map(m => m[1]);
  expect(pins.length).toBeGreaterThan(0);
  expect(new Set(pins)).toEqual(new Set([version]));
});
