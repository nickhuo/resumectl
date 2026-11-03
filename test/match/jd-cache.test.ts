import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InputError } from "../../src/errors.ts";
import {
  cacheSlugFromUrl,
  detectBoard,
  jdCacheDir,
  postingFromHtml,
  rejectUnsupportedJobUrl,
  resolveJd,
  type FetchLike,
} from "../../src/match/jd.ts";

const root = await mkdtemp(join(tmpdir(), "resume-jd-"));
afterAll(() => rm(root, { recursive: true, force: true }));

test("board URLs map to a stable cache directory", () => {
  expect(cacheSlugFromUrl("https://boards.greenhouse.io/airbnb/jobs/5766587")).toBe("airbnb-5766587");
  expect(cacheSlugFromUrl("https://job-boards.greenhouse.io/airbnb/jobs/5766587?gh_jid=1")).toBe("airbnb-5766587");
  expect(cacheSlugFromUrl("https://jobs.lever.co/netflix/11111111-2222-3333-4444-555555555555")).toBe("netflix-11111111-2222-3333-4444-555555555555");
  expect(cacheSlugFromUrl("https://jobs.ashbyhq.com/openai/some-role")).toBe("openai-some-role");
  expect(jdCacheDir("/work", "Airbnb Jobs!!")).toBe("/work/jd/airbnb-jobs");
  expect(detectBoard("https://boards.greenhouse.io/airbnb/jobs/42")?.apiUrl)
    .toBe("https://boards-api.greenhouse.io/v1/boards/airbnb/jobs/42?content=true");
});

test("LinkedIn and Workday are refused before any fetch", () => {
  expect(() => rejectUnsupportedJobUrl("https://www.linkedin.com/jobs/view/1")).toThrow(/login or JavaScript wall/);
  expect(() => rejectUnsupportedJobUrl("https://acme.wd5.myworkdayjobs.com/job/1")).toThrow(/login or JavaScript wall/);
  expect(() => rejectUnsupportedJobUrl("file:///tmp/jd.txt")).toThrow(/http/);
});

test("schema.org JobPosting JSON-LD beats the rest of the page", () => {
  const html = `<html><script type="application/ld+json">{"@type":"JobPosting","title":"Engineer","description":"<p>Build &amp; ship distributed systems.</p>","hiringOrganization":{"@type":"Organization","name":"Northstar"}}</script><p>Sign in</p></html>`;
  const posting = postingFromHtml(html, "https://example.com/jobs/1");
  expect(posting.extractor).toBe("jsonld");
  expect(posting.company).toBe("Northstar");
  expect(posting.text).toContain("Build & ship distributed systems.");
});

test("a Greenhouse URL is cached once and does not invent requirements", async () => {
  let calls = 0;
  const fetchImpl: FetchLike = async (input) => {
    calls += 1;
    expect(String(input)).toContain("boards-api.greenhouse.io");
    return new Response(JSON.stringify({
      title: "Engineer",
      content: "<p>Build distributed systems with Go. Must have production experience.</p>",
      location: { name: "Remote" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const url = "https://boards.greenhouse.io/acme/jobs/42";
  await expect(resolveJd(url, { cwd: root, fetch: fetchImpl })).rejects.toThrow(/jd\.requirements\.yaml/);
  expect(calls).toBe(1);
  const cache = jdCacheDir(root, "acme-42");
  const text = await Bun.file(join(cache, "jd.txt")).text();
  expect(text).toContain("Build distributed systems with Go");
  const source = await Bun.file(join(cache, "source.json")).json() as { url: string; sha256: string; extractor: string; fetchedAt: string };
  expect(source.url).toBe(url);
  expect(source.extractor).toBe("greenhouse");
  expect(source.sha256).toHaveLength(64);
  expect(source.fetchedAt).toContain("T");
  expect(await Bun.file(join(cache, "jd.requirements.example.yaml")).exists()).toBe(true);
  expect(await Bun.file(join(cache, "jd.requirements.yaml")).exists()).toBe(false);
  await expect(resolveJd(url, { cwd: root, fetch: fetchImpl })).rejects.toThrow(InputError);
  expect(calls).toBe(1);
  await Bun.write(join(cache, "jd.requirements.yaml"), "version: 1\nrequirements:\n  - id: go\n    text: Go\n    kind: skill\n    priority: required\n    terms: [Go]\n");
  const loaded = await resolveJd(url, { cwd: root, fetch: fetchImpl });
  expect(calls).toBe(1);
  expect(loaded.requirements.requirements[0].id).toBe("go");
  expect(loaded.jdText).toContain("distributed systems");
  const rewritten = text.replace("Go", "Rust");
  await Bun.write(join(cache, "jd.txt"), rewritten);
  await resolveJd(url, { cwd: root, fetch: fetchImpl, refresh: true });
  expect(calls).toBe(2);
  expect(await Bun.file(join(cache, "jd.txt")).text()).toContain("Go");
  expect(await Bun.file(join(cache, "jd.requirements.yaml")).text()).toContain("id: go");
});
