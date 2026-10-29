// Settings edited in the extension menu (chrome.storage.local) and how they map
// onto github.com localStorage, where the data hook reads them synchronously.

export interface Settings {
  debug: boolean;
  /** Local config text applied to every repo, overriding .github/pr-groups.json; "" for none. */
  localConfig: string;
  /** Tree groups start collapsed (default on). */
  collapseGroups: boolean;
  /** Mark auto-viewed groups' files viewed on GitHub (default on); off only groups them. */
  autoView: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { debug: false, localConfig: "", collapseGroups: true, autoView: true };

export const SETTINGS_KEY = "settings";
export const DEBUG_KEY = "fast-pr:debug";
// Set only when collapseGroups is off, so a page with nothing mirrored yet gets the default.
export const EXPAND_GROUPS_KEY = "fast-pr:expand-groups";
export const NO_AUTO_VIEW_KEY = "fast-pr:no-auto-view";
export const LOCAL_CONFIG_KEY = "fast-pr:local-config";
// Per-repo override keys from earlier builds; always removed.
const LEGACY_PREFIX = "fast-pr:dev-config:";
// Config caches of earlier builds, whose results may miss later lookup rules; always removed.
const LEGACY_CACHE_PREFIXES = ["fast-pr:cfg:", "fast-pr:cfg-pr:", "fast-pr:cfg2:", "fast-pr:cfg2-pr:"];
const CACHE_PREFIXES = ["fast-pr:cfg3:", "fast-pr:cfg3-pr:", ...LEGACY_CACHE_PREFIXES];

export function normalizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (typeof raw !== "object" || raw === null) return out;
  const o = raw as Record<string, unknown>;
  out.debug = o.debug === true;
  if (typeof o.localConfig === "string") out.localConfig = o.localConfig.trim();
  out.collapseGroups = o.collapseGroups !== false;
  out.autoView = o.autoView !== false;
  return out;
}

/** localStorage writes that make the page match `s`, given the page's current keys. */
export function mirrorPlan(s: Settings, existingKeys: string[]): { set: [string, string][]; remove: string[] } {
  const set: [string, string][] = [];
  const remove = existingKeys.filter(
    (k) => k.startsWith(LEGACY_PREFIX) || LEGACY_CACHE_PREFIXES.some((p) => k.startsWith(p)),
  );
  const toggle = (key: string, value: string | null) => {
    if (value !== null) set.push([key, value]);
    else if (existingKeys.includes(key)) remove.push(key);
  };
  toggle(LOCAL_CONFIG_KEY, s.localConfig || null);
  toggle(DEBUG_KEY, s.debug ? "1" : null);
  toggle(EXPAND_GROUPS_KEY, s.collapseGroups ? null : "1");
  toggle(NO_AUTO_VIEW_KEY, s.autoView ? null : "1");
  return { set, remove };
}

/** Cached config keys (by SHA and by PR) to drop when clearing the cache. */
export function cacheKeys(existingKeys: string[]): string[] {
  return existingKeys.filter((k) => CACHE_PREFIXES.some((p) => k.startsWith(p)));
}
