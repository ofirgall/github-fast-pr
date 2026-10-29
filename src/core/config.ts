import { compileGenerated, type GeneratedRule } from "./gitattributes";

/** Higher goes first; unset falls back to the defaults below. */
export interface Priorities { matchPriority?: number; viewPriority?: number }
export interface GroupConfig extends Priorities { name: string; paths: string[]; autoViewed: boolean }
export interface PrGroupsConfig {
  groups: GroupConfig[];
  /** linguist-generated rules from the repo's .gitattributes; they form the Generated group. */
  generated?: GeneratedRule[];
  /** Top-level "generated" in the config file: the Generated group's priorities. */
  generatedPriority?: Priorities;
  ungrouped?: Pick<Priorities, "viewPriority">;
}
export interface CompiledGroup {
  name: string;
  autoViewed: boolean;
  index: number;
  regexes: RegExp[];
  /** Replaces `regexes` when set (the Generated group). */
  test?: (path: string) => boolean;
  matchPriority: number;
  viewPriority: number;
}

export const GENERATED_GROUP = "Generated";

// Defaults keep the original rules: auto-viewed groups win matching, and files show
// normal groups, then Ungrouped, then auto-viewed groups.
export const defaultMatchPriority = (autoViewed: boolean): number => (autoViewed ? 1 : 0);
export const defaultViewPriority = (autoViewed: boolean): number => (autoViewed ? -2 : 0);
export const UNGROUPED_VIEW_PRIORITY = -1;
export type ParseResult =
  | { ok: true; config: PrGroupsConfig; hash: string }
  | { ok: false; error: string };

export const CONFIG_PATH = ".github/pr-groups.json";

export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The set priority fields of `o`, or an error naming `where`. */
function readPriorities(
  o: Record<string, unknown>,
  keys: (keyof Priorities)[],
  where: string,
): Priorities | string {
  const out: Priorities = {};
  for (const k of keys) {
    const v = o[k];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) return `${where}: "${k}" must be a number`;
    out[k] = v;
  }
  return out;
}

/** An optional top-level object holding priorities, e.g. "ungrouped". */
function readTopPriorities(
  raw: Record<string, unknown>,
  key: string,
  keys: (keyof Priorities)[],
): Priorities | undefined | string {
  const v = raw[key];
  if (v === undefined) return undefined;
  if (typeof v !== "object" || v === null || Array.isArray(v)) return `"${key}" must be an object`;
  const p = readPriorities(v as Record<string, unknown>, keys, `"${key}"`);
  return typeof p === "string" || Object.keys(p).length ? p : undefined;
}

export function parseConfig(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Config must be a JSON object with a \"groups\" array" };
  }
  const rawGroups = (raw as Record<string, unknown>).groups;
  if (!Array.isArray(rawGroups)) {
    return { ok: false, error: "Config is missing the \"groups\" array" };
  }
  const groups: GroupConfig[] = [];
  for (let i = 0; i < rawGroups.length; i++) {
    const g = rawGroups[i] as Record<string, unknown> | null;
    if (typeof g !== "object" || g === null || Array.isArray(g)) {
      return { ok: false, error: `Group #${i + 1} must be an object` };
    }
    if (typeof g.name !== "string" || g.name.trim() === "") {
      return { ok: false, error: `Group #${i + 1} needs a non-empty string "name"` };
    }
    const name = g.name;
    if (!Array.isArray(g.paths) || g.paths.length === 0) {
      return { ok: false, error: `Group "${name}" needs a non-empty "paths" array` };
    }
    for (const p of g.paths) {
      if (typeof p !== "string") {
        return { ok: false, error: `Group "${name}": every entry in "paths" must be a string` };
      }
    }
    if (g.autoViewed !== undefined && typeof g.autoViewed !== "boolean") {
      return { ok: false, error: `Group "${name}": "autoViewed" must be a boolean` };
    }
    for (const p of g.paths as string[]) {
      try {
        new RegExp(p);
      } catch (e) {
        return {
          ok: false,
          error: `Group "${name}": invalid regex "${p}": ${(e as Error).message}`,
        };
      }
    }
    const prio = readPriorities(g, ["matchPriority", "viewPriority"], `Group "${name}"`);
    if (typeof prio === "string") return { ok: false, error: prio };
    groups.push({ name, paths: [...(g.paths as string[])], autoViewed: g.autoViewed === true, ...prio });
  }
  const top = raw as Record<string, unknown>;
  const generatedPriority = readTopPriorities(top, "generated", ["matchPriority", "viewPriority"]);
  if (typeof generatedPriority === "string") return { ok: false, error: generatedPriority };
  const ungrouped = readTopPriorities(top, "ungrouped", ["viewPriority"]);
  if (typeof ungrouped === "string") return { ok: false, error: ungrouped };
  const config: PrGroupsConfig = { groups };
  if (generatedPriority) config.generatedPriority = generatedPriority;
  if (ungrouped) config.ungrouped = ungrouped;
  return { ok: true, config, hash: configHash(config) };
}

export const configHash = (config: PrGroupsConfig): string => hashString(JSON.stringify(config));

/** `config` plus the repo's generated rules (none: unchanged). */
export function withGenerated(config: PrGroupsConfig, rules: GeneratedRule[] | undefined): PrGroupsConfig {
  return rules?.some((r) => r.generated) ? { ...config, generated: rules } : config;
}

export function compileConfig(config: PrGroupsConfig): CompiledGroup[] {
  const groups: CompiledGroup[] = config.groups.map((g, index) => ({
    name: g.name,
    autoViewed: g.autoViewed,
    index,
    regexes: g.paths.map((p) => new RegExp(p)),
    matchPriority: g.matchPriority ?? defaultMatchPriority(g.autoViewed),
    viewPriority: g.viewPriority ?? defaultViewPriority(g.autoViewed),
  }));
  if (config.generated?.some((r) => r.generated)) {
    groups.push({
      name: GENERATED_GROUP,
      autoViewed: true,
      index: groups.length,
      regexes: [],
      test: compileGenerated(config.generated),
      matchPriority: config.generatedPriority?.matchPriority ?? defaultMatchPriority(true),
      viewPriority: config.generatedPriority?.viewPriority ?? defaultViewPriority(true),
    });
  }
  return groups;
}

export const ungroupedViewPriority = (config: PrGroupsConfig): number =>
  config.ungrouped?.viewPriority ?? UNGROUPED_VIEW_PRIORITY;
