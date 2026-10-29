import type { PrGroupsConfig } from "./config";
import type { PrIdentity } from "./route";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export type CachedConfig =
  | { status: "ok"; config: PrGroupsConfig; hash: string; at: number }
  | { status: "none" | "invalid"; hash: string; at: number; error?: string };

const CFG_PREFIX = "fast-pr:cfg3:";
const PR_PREFIX = "fast-pr:cfg3-pr:";
const MAX_CFG = 300;

function defaultStore(): Store | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function read(store: Store | undefined, key: string): string | null {
  try {
    return (store ?? defaultStore())?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(store: Store | undefined, key: string, value: string): void {
  try {
    (store ?? defaultStore())?.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readJson(store: Store | undefined, key: string): unknown {
  const s = read(store, key);
  if (s === null) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function asCached(v: unknown): CachedConfig | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.hash !== "string" || typeof o.at !== "number") return null;
  if (o.status === "ok" && typeof o.config === "object" && o.config !== null) return v as CachedConfig;
  if (o.status === "none" || o.status === "invalid") return v as CachedConfig;
  return null;
}

const shaKey = (o: string, r: string, sha: string) => `${CFG_PREFIX}${o}/${r}@${sha}`;
const prKey = (o: string, r: string, n: number) => `${PR_PREFIX}${o}/${r}#${n}`;

export function getConfigBySha(owner: string, repo: string, sha: string, store?: Store): CachedConfig | null {
  return asCached(readJson(store, shaKey(owner, repo, sha)));
}

export function getConfigByPr(owner: string, repo: string, number: number, store?: Store): CachedConfig | null {
  return asCached(readJson(store, prKey(owner, repo, number)));
}

export function lookupConfig(id: PrIdentity, store?: Store): CachedConfig | null {
  return (
    getConfigBySha(id.owner, id.repo, id.headSha, store) ??
    getConfigByPr(id.owner, id.repo, id.number, store)
  );
}

export function putConfig(id: PrIdentity, value: CachedConfig, store?: Store): void {
  const s = store ?? defaultStore();
  if (!s) return;
  const json = JSON.stringify(value);
  write(s, shaKey(id.owner, id.repo, id.headSha), json);
  write(s, prKey(id.owner, id.repo, id.number), json);
  evict(s, CFG_PREFIX);
  evict(s, PR_PREFIX);
}

function evict(s: Store, prefix: string): void {
  try {
    const entries: { key: string; at: number }[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(prefix)) {
        const c = asCached(readJson(s, k));
        entries.push({ key: k, at: c ? c.at : 0 });
      }
    }
    if (entries.length > MAX_CFG) {
      entries.sort((a, b) => a.at - b.at);
      for (const e of entries.slice(0, entries.length - MAX_CFG)) s.removeItem(e.key);
    }
  } catch {
    /* ignore */
  }
}

export interface AutoRecord { headSha: string; paths: string[] }

const autoKey = (o: string, r: string, n: number) => `fast-pr:auto:${o}/${r}#${n}`;

export function getAutoRecord(owner: string, repo: string, number: number, headSha: string, store?: Store): AutoRecord {
  const v = readJson(store, autoKey(owner, repo, number)) as Partial<AutoRecord> | null;
  if (v && v.headSha === headSha && Array.isArray(v.paths)) {
    return { headSha, paths: v.paths.filter((p): p is string => typeof p === "string") };
  }
  return { headSha, paths: [] };
}

export function addAutoPaths(owner: string, repo: string, number: number, headSha: string, paths: string[], store?: Store): void {
  const cur = getAutoRecord(owner, repo, number, headSha, store);
  const set = new Set([...cur.paths, ...paths]);
  write(store, autoKey(owner, repo, number), JSON.stringify({ headSha, paths: [...set] }));
}

export type TreeMode = "grouped" | "original";

export function getTreeMode(store?: Store): TreeMode {
  return read(store, "fast-pr:tree-mode") === "original" ? "original" : "grouped";
}

export function setTreeMode(m: TreeMode, store?: Store): void {
  write(store, "fast-pr:tree-mode", m);
}

/** The menu's "Auto collapse groups" option, mirrored from the extension (default on). */
export function collapseGroups(store?: Store): boolean {
  return read(store, "fast-pr:expand-groups") !== "1";
}

/** The menu's "Auto-mark viewed" option, mirrored from the extension (default on). */
export function autoView(store?: Store): boolean {
  return read(store, "fast-pr:no-auto-view") !== "1";
}

export function isDebug(store?: Store): boolean {
  return read(store, "fast-pr:debug") === "1";
}

/** Local config set from the extension menu (mirrored into localStorage); applies to every repo. */
export function getLocalConfig(store?: Store): string | null {
  return read(store, "fast-pr:local-config");
}
