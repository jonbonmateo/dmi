/**
 * Fixture loader for mock mode.
 *
 * Mock data is always tagged so it can never be mistaken for a real
 * observation: every piece of evidence it produces carries a `[MOCK]` label
 * and the run is stamped mode="mock" or "hybrid" on the report.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

export interface Fixture {
  domain: string;
  [key: string]: unknown;
}

const cache = new Map<string, Fixture | null>();

function keyFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase().replace(/[^a-z0-9.]/g, "");
  }
}

export async function loadFixture(urlOrName: string): Promise<Fixture | null> {
  const key = keyFor(urlOrName);
  if (cache.has(key)) return cache.get(key)!;
  const file = path.resolve(process.cwd(), "fixtures", `${key}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Fixture;
    cache.set(key, parsed);
    return parsed;
  } catch {
    cache.set(key, null);
    return null;
  }
}

export async function fixtureSection<T>(
  urlOrName: string,
  section: string,
): Promise<T | null> {
  const f = await loadFixture(urlOrName);
  if (!f) return null;
  return (f[section] as T) ?? null;
}

export const MOCK = "[MOCK]";
