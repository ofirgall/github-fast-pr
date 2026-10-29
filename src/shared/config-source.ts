import { hashString, parseConfig } from "../core/config";
import { getLocalConfig, type CachedConfig } from "../core/storage";

type Store = Parameters<typeof getLocalConfig>[0];

/** Local config override from the extension menu, for every repo. Returns null when none is set. */
export function localConfig(store?: Store): CachedConfig | null {
  const text = getLocalConfig(store);
  if (text === null) return null;
  const r = parseConfig(text);
  return r.ok
    ? { status: "ok", config: r.config, hash: r.hash, at: 0 }
    : { status: "invalid", hash: hashString(text), at: 0, error: r.error };
}
