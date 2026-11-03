import { expect, test } from "bun:test";
import { decideJev } from "../../src/match/deciders/jev.ts";
import { JEV_MODEL, JEV_URL } from "../../src/match/deciders/rubric.ts";
import { InputError } from "../../src/errors.ts";

test("Jev scores one requirement per request and pins jev-1.14.0", async () => {
  const bodies: { model?: string; state?: { requirement?: string; evidence?: { quote: string }[] }; questions?: { coverage?: { type?: string; criteria?: string[] } } }[] = [];
  const result = await decideJev([
    { id: "python", text: "Python services", terms: ["Python"], evidence: [{ section: "WORK", quote: "PYTHON-SENTINEL built a service" }] },
    { id: "rust", text: "Rust services", terms: ["Rust"], evidence: [{ section: "WORK", quote: "RUST-SENTINEL only" }] },
  ], {
    apiKey: "ts-test",
    fetch: async (input, init) => {
      expect(String(input)).toBe(JEV_URL);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer ts-test");
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      expect(JSON.stringify(body)).not.toContain("ts-test");
      const quote = body.state.evidence[0].quote as string;
      const level = quote.startsWith("PYTHON") ? 3 : 0;
      const probabilities: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0 };
      probabilities[String(level)] = 1;
      return new Response(JSON.stringify({
        model: JEV_MODEL,
        answers: { coverage: { type: "score", score: level, confidence: 1, probabilities } },
        usage: { input_tokens: 10, output_tokens: 0 },
      }), { status: 200 });
    },
  });
  expect(bodies).toHaveLength(2);
  expect(bodies.every(body => body.model === JEV_MODEL)).toBe(true);
  expect(bodies.every(body => body.questions?.coverage?.type === "score")).toBe(true);
  expect(bodies.every(body => body.questions?.coverage?.criteria?.length === 4)).toBe(true);
  const pythonBody = JSON.stringify(bodies.find(body => body.state?.requirement?.includes("Python")));
  expect(pythonBody).toContain("PYTHON-SENTINEL");
  expect(pythonBody).not.toContain("RUST-SENTINEL");
  expect(result.rows.map(row => [row.id, row.level])).toEqual([["python", "Demonstrated"], ["rust", "Missing"]]);
  expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 0 });
});

test("Jev requires TYPESAFE_API_KEY", async () => {
  await expect(decideJev([], { env: {} })).rejects.toThrow(InputError);
});
