import { CONFIG_PATH, hashString, parseConfig } from "../core/config";
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
async function fetchRaw(deps: LoaderDeps, id: PrIdentity, ref: string): Promise<string | null> {
  const url = `/${id.owner}/${id.repo}/raw/${ref}/${CONFIG_PATH}`;
  const res = await deps.fetch(url, { credentials: "same-origin" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/**
 * Resolve the config for a head commit: cached by SHA (final), else head SHA,
 * else base branch. Writes the cache. Throws on transport errors (nothing cached).
 */
export async function resolveConfig(id: PrIdentity, deps: LoaderDeps = defaultDeps()): Promise<CachedConfig> {
  const hit = deps.get(id);
  if (hit) return hit;
  let text = await fetchRaw(deps, id, id.headSha);
  if (text === null) text = await fetchRaw(deps, id, encodePath(id.baseBranch));
  const at = deps.now();
  let value: CachedConfig;
  if (text === null) {
    value = { status: "none", hash: "none", at };
  } else {
    const r = parseConfig(text);
    if (r.ok) value = { status: "ok", config: r.config, hash: r.hash, at };
    else {
      value = { status: "invalid", hash: hashString(text), at, error: r.error };
      deps.logError(`[fast-pr] ${CONFIG_PATH}: ${r.error}`);
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
