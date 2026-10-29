import { compileConfig } from "../core/config";
import { computeDiffstat } from "../core/diffstat";
import { findChangesRoute, prIdentity, type PrIdentity } from "../core/route";
import { getConfigBySha, lookupConfig, type CachedConfig } from "../core/storage";
import { devConfigFor } from "../shared/config-source";
import { RESULT_EVENT } from "../shared/types";
import { mountDecorations } from "./decorations";
import { createDiffstatController } from "./diffstat-ui";
import { debounced } from "./dom";
import { reloadGuardKey, resolveConfig, shouldReload } from "./loader";
import { debug } from "./log";
import { parseResult, readResultRaw, resultMatchesPage } from "./result";
import type { PageInfo } from "./router";
import { sendFileReviews } from "./sender";
import { mountTreePanel, type Mounted } from "./tree-ui";

export type Teardown = () => void;

const checkedShas = new Set<string>();
const loggedDev = new Set<string>();

function logDevInvalid(id: PrIdentity, cfg: CachedConfig | null): void {
  if (cfg?.status !== "invalid" || !cfg.error) return;
  const k = `${id.owner}/${id.repo}`;
  if (loggedDev.has(k)) return;
  loggedDev.add(k);
  console.error(`[fast-pr] .github/pr-groups.json (dev-config): ${cfg.error}`);
}

export function startChangesPage(page: PageInfo): Teardown {
  let ui: Mounted[] = [];
  let lastRaw: string | null = null;
  let disposed = false;

  const clear = () => {
    ui.forEach((u) => u.destroy());
    ui = [];
  };

  const checkConfig = async (result: NonNullable<ReturnType<typeof parseResult>>) => {
    const id = result.identity;
    if (result.devConfig) {
      logDevInvalid(id, devConfigFor(id.owner, id.repo));
      return;
    }
    if (getConfigBySha(id.owner, id.repo, id.headSha)) return;
    const k = `${id.owner}/${id.repo}@${id.headSha}`;
    if (checkedShas.has(k)) return;
    checkedShas.add(k);
    try {
      const next = await resolveConfig(id);
      debug("config resolved", next.status, next.hash);
      if (disposed || !shouldReload(result, next)) return;
      const guard = reloadGuardKey(location.pathname, id.headSha, next);
      try {
        if (sessionStorage.getItem(guard)) return;
        sessionStorage.setItem(guard, "1");
      } catch {
        return; // cannot guard against loops
      }
      debug("reloading to apply config");
      location.reload();
    } catch (e) {
      console.warn("[fast-pr] config fetch failed", e);
      checkedShas.delete(k);
    }
  };

  const apply = () => {
    const raw = readResultRaw();
    if (raw === lastRaw) return;
    lastRaw = raw;
    clear();
    const result = parseResult(raw);
    if (!result || !resultMatchesPage(result, page)) return;
    void checkConfig(result);
    if (result.configStatus !== "ok") return;
    try {
      ui.push(mountDecorations(result), mountTreePanel(result));
    } catch (e) {
      console.warn("[fast-pr] UI error", e);
    }
    if (result.fullDiff) {
      const paths = result.files.filter((f) => f.markedByHook).map((f) => f.path);
      if (paths.length) void sendFileReviews(result.identity, paths);
    }
  };

  const onEvent = () => apply();
  document.addEventListener(RESULT_EVENT, onEvent);
  const mo = new MutationObserver(apply);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-fast-pr"] });
  apply();

  return () => {
    disposed = true;
    document.removeEventListener(RESULT_EVENT, onEvent);
    mo.disconnect();
    clear();
  };
}

async function fetchChangesRoute(page: PageInfo) {
  const res = await fetch(`/${page.owner}/${page.repo}/pull/${page.number}/changes`, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "GitHub-Verified-Fetch": "true",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return findChangesRoute(await res.json());
}

export function startConversationPage(page: PageInfo): Teardown {
  let disposed = false;
  const refetch = debounced(() => void refresh(), 500);
  const ctl = createDiffstatController(() => refetch.call());

  const show = (cfg: CachedConfig | null, summaries: Parameters<typeof computeDiffstat>[0]) => {
    ctl.set(cfg && cfg.status === "ok" ? computeDiffstat(summaries, compileConfig(cfg.config)) : null);
  };

  async function refresh() {
    try {
      const found = await fetchChangesRoute(page);
      if (disposed || !found) return;
      const id = prIdentity(found.route);
      if (!id) return;
      const summaries = found.route.diffSummaries;
      const dev = devConfigFor(id.owner, id.repo);
      if (dev) {
        logDevInvalid(id, dev);
        show(dev, summaries);
        return;
      }
      const cached = lookupConfig(id);
      show(cached, summaries);
      if (!getConfigBySha(id.owner, id.repo, id.headSha)) {
        const fresh = await resolveConfig(id);
        if (disposed) return;
        if (!cached || cached.hash !== fresh.hash || cached.status !== fresh.status) show(fresh, summaries);
      }
    } catch (e) {
      console.warn("[fast-pr] diffstat error", e);
    }
  }
  void refresh();

  return () => {
    disposed = true;
    refetch.cancel();
    ctl.destroy();
  };
}
