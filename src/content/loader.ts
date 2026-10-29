import { CONFIG_PATHS, configHash, hashString, parseConfig, withGenerated } from "../core/config";
import { GITATTRIBUTES_PATH, parseGenerated } from "../core/gitattributes";
import type { PrIdentity } from "../core/route";
import { getConfigBySha, putConfig, type CachedConfig } from "../core/storage";
import type { FastPrResult } from "../shared/types";

type FetchFn = (url: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "text">>;

export interface LoaderDeps {
  fetch: FetchFn;
  now: () => number;
  logError: (msg: string) => void;
  get: (id: PrIdentity) => CachedConfig | null;
  put: (id: PrIdentity, v: CachedConfig) => void;
}

export function defaultDeps(): LoaderDeps {
  return {
    fetch: (u, i) => fetch(u, i),
    now: () => Date.now(),
    logError: (m) => console.error(m),
    get: (id) => getConfigBySha(id.owner, id.repo, id.headSha),
    put: (id, v) => putConfig(id, v),
  };
}

const encodePath = (s: string) => s.split("/").map(encodeURIComponent).join("/");

/** Text of the file, or null on 404. Throws on any other failure. */
async function fetchRaw(deps: LoaderDeps, id: PrIdentity, ref: string, path: string): Promise<string | null> {
  const url = `/${id.owner}/${id.repo}/raw/${ref}/${path}`;
  const res = await deps.fetch(url, { credentials: "same-origin" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** The first of `paths` at the head commit, else on the base branch; null when none exists. */
async function fetchAtHeadOrBase(
  deps: LoaderDeps,
  id: PrIdentity,
  paths: readonly string[],
): Promise<{ path: string; text: string } | null> {
  for (const ref of [id.headSha, encodePath(id.baseBranch)]) {
    for (const path of paths) {
      const text = await fetchRaw(deps, id, ref, path);
      if (text !== null) return { path, text };
    }
  }
  return null;
}

/**
 * Resolve the config for a head commit: cached by SHA (final), else head SHA,
 * else base branch. The root .gitattributes' linguist-generated rules are added as
 * the Generated group, even when there is no pr-groups config. Writes the cache.
 * Throws on transport errors (nothing cached).
 */
export async function resolveConfig(id: PrIdentity, deps: LoaderDeps = defaultDeps()): Promise<CachedConfig> {
  const hit = deps.get(id);
  if (hit) return hit;
  const file = await fetchAtHeadOrBase(deps, id, CONFIG_PATHS);
  const attrs = await fetchAtHeadOrBase(deps, id, [GITATTRIBUTES_PATH]);
  const rules = attrs === null ? undefined : parseGenerated(attrs.text);
  const at = deps.now();
  let value: CachedConfig;
  if (file === null) {
    const config = withGenerated({ groups: [] }, rules);
    value = config.generated ? { status: "ok", config, hash: configHash(config), at } : { status: "none", hash: "none", at };
  } else {
    const r = parseConfig(file.text);
    if (r.ok) {
      const config = withGenerated(r.config, rules);
      value = { status: "ok", config, hash: configHash(config), at };
    } else {
      value = { status: "invalid", hash: hashString(file.text), at, error: r.error };
      deps.logError(`[fast-pr] ${file.path}: ${r.error}`);
    }
  }
  deps.put(id, value);
  return value;
}

/** Whether the changes page must reload so the hook applies `next`. */
export function shouldReload(applied: Pick<FastPrResult, "configStatus" | "appliedHash">, next: CachedConfig): boolean {
  if (next.status === "ok") {
    return applied.configStatus !== "ok" || applied.appliedHash !== next.hash;
  }
  return applied.configStatus === "ok";
}

export function reloadGuardKey(pathname: string, headSha: string, next: CachedConfig): string {
  return `fast-pr:reloaded:${pathname}@${headSha}@${next.status === "ok" ? next.hash : next.status}`;
}
