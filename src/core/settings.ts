// Settings edited in the extension menu (chrome.storage.local) and how they map
// onto github.com localStorage, where the data hook reads them synchronously.

export interface Settings {
  debug: boolean;
  /** Local config text applied to every repo, overriding .github/pr-groups.json; "" for none. */
  localConfig: string;
}

export const SETTINGS_KEY = "settings";
export const DEBUG_KEY = "fast-pr:debug";
export const LOCAL_CONFIG_KEY = "fast-pr:local-config";
// Per-repo override keys from earlier builds; always removed.
const LEGACY_PREFIX = "fast-pr:dev-config:";
// Current config cache prefixes, then those of builds before .gitattributes support.
const CACHE_PREFIXES = ["fast-pr:cfg2:", "fast-pr:cfg2-pr:", "fast-pr:cfg:", "fast-pr:cfg-pr:"];

export function normalizeSettings(raw: unknown): Settings {
  const out: Settings = { debug: false, localConfig: "" };
  if (typeof raw !== "object" || raw === null) return out;
  const o = raw as Record<string, unknown>;
  out.debug = o.debug === true;
  if (typeof o.localConfig === "string") out.localConfig = o.localConfig.trim();
  return out;
}

/** localStorage writes that make the page match `s`, given the page's current keys. */
export function mirrorPlan(s: Settings, existingKeys: string[]): { set: [string, string][]; remove: string[] } {
  const set: [string, string][] = [];
  const remove = existingKeys.filter((k) => k.startsWith(LEGACY_PREFIX));
  const toggle = (key: string, value: string | null) => {
    if (value !== null) set.push([key, value]);
    else if (existingKeys.includes(key)) remove.push(key);
  };
  toggle(LOCAL_CONFIG_KEY, s.localConfig || null);
  toggle(DEBUG_KEY, s.debug ? "1" : null);
  return { set, remove };
}

/** Cached config keys (by SHA and by PR) to drop when clearing the cache. */
export function cacheKeys(existingKeys: string[]): string[] {
  return existingKeys.filter((k) => CACHE_PREFIXES.some((p) => k.startsWith(p)));
}
