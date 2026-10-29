import { configHash, hashString, parseConfig, withGenerated } from "../core/config";
import type { PrIdentity } from "../core/route";
import { getLocalConfig, lookupConfig, type CachedConfig } from "../core/storage";

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

/** The local config plus the repo's .gitattributes Generated rules, which it does not replace. */
export function withRepoGenerated(local: CachedConfig, repo: CachedConfig | null): CachedConfig {
  if (local.status !== "ok" || repo?.status !== "ok") return local;
  const config = withGenerated(local.config, repo.config.generated);
  return config === local.config ? local : { ...local, config, hash: configHash(config) };
}

/** Config to group this PR with: the local override (`dev`) if set, else the cached repo config. */
export function effectiveConfig(id: PrIdentity, store?: Store): { cfg: CachedConfig; dev: boolean } | null {
  const repo = lookupConfig(id, store);
  const local = localConfig(store);
  if (local) return { cfg: withRepoGenerated(local, repo), dev: true };
  return repo ? { cfg: repo, dev: false } : null;
}
