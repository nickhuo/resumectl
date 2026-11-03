import { ExternalServiceError } from "../../errors.ts";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function postJson(url: string, body: unknown, headers: Record<string, string>, fetchImpl: FetchLike = fetch): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new ExternalServiceError(`request to ${new URL(url).host} failed: ${(error as Error).message}`);
  }
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : {}; }
  catch { /* non-JSON error bodies stay as text */ }
  if (!res.ok) {
    const detail = typeof parsed === "object" && parsed && "error" in parsed
      ? JSON.stringify((parsed as { error: unknown }).error).slice(0, 300)
      : text.slice(0, 300);
    throw new ExternalServiceError(`${new URL(url).host} returned ${res.status}: ${detail}`);
  }
  if (!parsed || typeof parsed !== "object") throw new ExternalServiceError(`${new URL(url).host} returned a non-JSON body`);
  return parsed;
}
