import { compileGenerated, type GeneratedRule } from "./gitattributes";

export interface GroupConfig { name: string; paths: string[]; autoViewed: boolean }
export interface PrGroupsConfig {
  groups: GroupConfig[];
  /** linguist-generated rules from the repo's .gitattributes; they form the Generated group. */
  generated?: GeneratedRule[];
}
export interface CompiledGroup {
  name: string;
  autoViewed: boolean;
  index: number;
  regexes: RegExp[];
  /** Replaces `regexes` when set (the Generated group). */
  test?: (path: string) => boolean;
}

export const GENERATED_GROUP = "Generated";
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
    groups.push({ name, paths: [...(g.paths as string[])], autoViewed: g.autoViewed === true });
  }
  const config: PrGroupsConfig = { groups };
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
  }));
  if (config.generated?.some((r) => r.generated)) {
    groups.push({
      name: GENERATED_GROUP,
      autoViewed: true,
      index: groups.length,
      regexes: [],
      test: compileGenerated(config.generated),
    });
  }
  return groups;
}
