import { hashString, parseConfig } from "../core/config";
import { getDevConfig, type CachedConfig } from "../core/storage";

type Store = Parameters<typeof getDevConfig>[2];

/** Dev-config override (only when debug is on). Returns null when none is set. */
export function devConfigFor(owner: string, repo: string, store?: Store): CachedConfig | null {
  const text = getDevConfig(owner, repo, store);
  if (text === null) return null;
  const r = parseConfig(text);
  return r.ok
    ? { status: "ok", config: r.config, hash: r.hash, at: 0 }
    : { status: "invalid", hash: hashString(text), at: 0, error: r.error };
}
