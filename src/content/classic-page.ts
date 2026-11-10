// Fast PR on GitHub's classic "Files changed" page (/pull/N/files). There is no route JSON to
// patch here: files are read from the page, reordered in the DOM as GitHub loads them, and
// marked viewed through GitHub's own Viewed checkboxes (which also collapse them and update
// GitHub's count).
import { addAutoPaths, autoView, getAutoRecord } from "../core/storage";
import { effectiveConfig } from "../shared/config-source";
import type { FastPrFile, FastPrResult } from "../shared/types";
import { classifyFiles } from "../hook/patch";
import {
  classicSummaries,
  fetchToc,
  headerCounts,
  parseClassicPage,
  viewedCheckbox,
  viewedOnPage,
  type ClassicPage,
} from "./classic";
import { groupStarts, labelText } from "./decorations";
import { createDiffstatController, resultDiffstat } from "./diffstat-ui";
import { el, isOwnMutation, markUi, throttled } from "./dom";
import { resolveConfig } from "./loader";
import { debug } from "./log";
import type { PageInfo } from "./router";
import { isClassicRange } from "./router";
import { mountTreePanel, type Mounted, type TreeHost } from "./tree-ui";
import { mountViewedProgress } from "./viewed-ui";
import type { ViewedState } from "./viewed-state";
import type { Teardown } from "./pages";

const FILE = "#files div.file[data-tagsearch-path]";
const DIGEST_RE = /diff-([0-9a-f]{64})$/;

const fileEls = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(FILE)];

function findFile(path: string): HTMLElement | null {
  return fileEls().find((f) => f.dataset.tagsearchPath === path) ?? null;
}

/** The element to move for a file: GitHub wraps each diff in <copilot-diff-entry>. */
function entryOf(file: HTMLElement): HTMLElement {
  const p = file.parentElement;
  return p && p.tagName === "COPILOT-DIFF-ENTRY" ? p : file;
}

const isEntry = (e: Element): boolean =>
  e.tagName === "COPILOT-DIFF-ENTRY" || (e.classList.contains("file") && e.hasAttribute("data-tagsearch-path"));

/**
 * Put the loaded diffs in group order, in GitHub's first progressive container. Only files
 * out of place move, so diffs already in order (and anything typed in them) stay put.
 */
export function reorderEntries(root: ParentNode, order: Map<string, number>): void {
  const target = root.querySelector<HTMLElement>("#files .js-diff-progressive-container");
  if (!target) return;
  const entries = [...root.querySelectorAll<HTMLElement>(FILE)].map((f, i) => ({
    el: entryOf(f),
    idx: order.get(DIGEST_RE.exec(f.id)?.[1] ?? "") ?? Number.MAX_SAFE_INTEGER,
    i,
  }));
  entries.sort((a, b) => a.idx - b.idx || a.i - b.i);
  const nextEntry = (e: Element | null): Element | null => {
    for (let n = e; n; n = n.nextElementSibling) if (isEntry(n)) return n;
    return null;
  };
  let anchor = nextEntry(target.firstElementChild);
  let last: Element | null = null;
  for (const { el: e } of entries) {
    if (e === anchor) {
      last = e;
      anchor = nextEntry(e.nextElementSibling);
      continue;
    }
    if (anchor) target.insertBefore(e, anchor);
    else target.insertBefore(e, last ? last.nextSibling : target.firstChild);
    last = e;
  }
}

/** Group labels before each group's first diff, and an "Auto-viewed" hint in its header. */
export function decorateClassic(root: ParentNode, files: FastPrFile[], starts: Set<string>): void {
  const byDigest = new Map(files.map((f) => [f.pathDigest, f]));
  const keep = new Set<Element>();
  for (const f of root.querySelectorAll<HTMLElement>(FILE)) {
    const digest = DIGEST_RE.exec(f.id)?.[1] ?? "";
    const file = byDigest.get(digest);
    const entry = entryOf(f);
    if (file && starts.has(digest)) {
      const text = labelText(file);
      let label = entry.previousElementSibling as HTMLElement | null;
      if (!label?.classList.contains("fast-pr-group-label") || label.dataset.digest !== digest || label.dataset.text !== text) {
        label = el("div", "fast-pr-group-label");
        markUi(label);
        label.dataset.digest = digest;
        label.dataset.text = text;
        label.append(el("span", "fast-pr-group-name", text));
        if (file.autoViewed) label.append(el("span", "fast-pr-pill", "auto-viewed"));
        entry.before(label);
      }
      keep.add(label);
    }
    const info = f.querySelector<HTMLElement>(".file-header .file-info");
    if (!info) continue;
    const want = file?.autoViewed ? `Auto-viewed: ${labelText(file)}` : "";
    let hint = info.querySelector<HTMLElement>(".fast-pr-auto-hint");
    if (hint && hint.textContent !== want) {
      hint.remove();
      hint = null;
    }
    if (want && !hint) {
      hint = el("span", "fast-pr-auto-hint", want);
      markUi(hint);
      info.append(hint);
    }
  }
  root.querySelectorAll("#files .fast-pr-group-label").forEach((l) => keep.has(l) || l.remove());
}

/** Viewed state read from GitHub's checkboxes, which it re-renders after every toggle. */
function createClassicViewedState(paths: string[]): ViewedState & { refresh(): void } {
  const known = new Set(paths);
  const viewed = new Set<string>();
  const subs = new Set<() => void>();
  const notify = () => subs.forEach((fn) => fn());
  const refresh = () => {
    let changed = false;
    for (const [p, v] of viewedOnPage(document)) {
      if (!known.has(p) || viewed.has(p) === v) continue;
      if (v) viewed.add(p);
      else viewed.delete(p);
      changed = true;
    }
    if (changed) notify();
  };
  refresh();
  return {
    has: (p) => viewed.has(p),
    set(p, v) {
      if (!known.has(p) || viewed.has(p) === v) return;
      if (v) viewed.add(p);
      else viewed.delete(p);
      notify();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    refresh,
    destroy() {
      subs.clear();
    },
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Toggle a file's Viewed checkbox like the user would, then wait for GitHub to answer
 * (it swaps in a new checkbox). True when the file ends up in the wanted state.
 */
export async function clickViewed(path: string, viewed: boolean, timeoutMs = 8000): Promise<boolean> {
  const file = findFile(path);
  const cb = file && viewedCheckbox(file);
  if (!cb) return false;
  if (cb.checked === viewed) return true;
  cb.click();
  for (let t = 0; t < timeoutMs; t += 100) {
    await wait(100);
    const now = viewedCheckbox(findFile(path) ?? document.createElement("div"));
    if (now && now !== cb) return now.checked === viewed;
  }
  const now = viewedCheckbox(findFile(path) ?? document.createElement("div"));
  return !!now && now.checked === viewed;
}

async function pool<T>(items: T[], n: number, job: (t: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await job(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

const classicTreeHost: TreeHost = {
  find() {
    const native = document.querySelector("file-tree");
    return native instanceof HTMLElement ? { native, hide: native } : null;
  },
  toggleRow: () => null,
};

/** Build the result for the page's files, as the hook does for the React view. */
function buildResult(parsed: ClassicPage, toc: Awaited<ReturnType<typeof fetchToc>>, fullDiff: boolean): FastPrResult | null {
  const id = parsed.identity;
  const looked = effectiveConfig(id);
  if (!looked) return null;
  const summaries = classicSummaries(parsed, toc, headerCounts(document), viewedOnPage(document));
  // Marking happens later, as each diff (and its checkbox) loads.
  const { files } = classifyFiles(summaries, looked.cfg, { marking: false, already: new Set() });
  return {
    v: 1,
    routeKey: "classic",
    identity: id,
    fullDiff,
    configStatus: looked.cfg.status,
    appliedHash: looked.cfg.status === "ok" ? looked.cfg.hash : null,
    devConfig: looked.dev,
    files,
  };
}

/** Mark unviewed files of auto-viewed groups as they load, once per head commit. */
function mountAutoViewer(result: FastPrResult, viewed: ViewedState & { refresh(): void }): Mounted {
  const id = result.identity;
  const auto = new Set(result.files.filter((f) => f.autoViewed).map((f) => f.path));
  // Files the extension viewed before at this head: the user un-viewed them since, so leave them.
  const skip = new Set(getAutoRecord(id.owner, id.repo, id.number, id.headSha).paths);
  const done = new Set<string>();
  let alive = true;
  const queue: string[] = [];
  let running = false;
  const drain = async () => {
    if (running) return;
    running = true;
    while (alive && queue.length) {
      const batch = queue.splice(0, queue.length);
      await pool(batch, 4, async (p) => {
        if (alive && (await clickViewed(p, true))) viewed.refresh();
      });
    }
    running = false;
  };
  const scan = () => {
    for (const f of fileEls()) {
      const p = f.dataset.tagsearchPath ?? "";
      if (!auto.has(p) || done.has(p)) continue;
      const cb = viewedCheckbox(f);
      if (!cb) continue;
      done.add(p);
      if (cb.checked || skip.has(p)) continue;
      addAutoPaths(id.owner, id.repo, id.number, id.headSha, [p]);
      queue.push(p);
    }
    if (queue.length) void drain();
  };
  const sched = throttled(scan, 100);
  const mo = new MutationObserver((m) => !m.every(isOwnMutation) && sched.call());
  mo.observe(document.body, { childList: true, subtree: true });
  scan();
  return {
    destroy() {
      alive = false;
      mo.disconnect();
      sched.cancel();
    },
  };
}

function mountClassicDecorations(result: FastPrResult, viewed: ViewedState & { refresh(): void }): Mounted {
  const order = new Map(result.files.map((f, i) => [f.pathDigest, i]));
  const starts = groupStarts(result.files);
  const run = () => {
    reorderEntries(document, order);
    decorateClassic(document, result.files, starts);
    viewed.refresh();
  };
  const sched = throttled(run, 50);
  const mo = new MutationObserver((m) => !m.every(isOwnMutation) && sched.call());
  mo.observe(document.body, { childList: true, subtree: true });
  run();
  return {
    destroy() {
      mo.disconnect();
      sched.cancel();
      document.querySelectorAll("#files .fast-pr-group-label, #files .fast-pr-auto-hint").forEach((n) => n.remove());
    },
  };
}

export function startClassicFilesPage(page: PageInfo): Teardown {
  let disposed = false;
  let ui: Mounted[] = [];
  const diffstat = createDiffstatController(() => {});
  const fullDiff = !isClassicRange(location.pathname);

  const mount = (result: FastPrResult) => {
    ui.forEach((u) => u.destroy());
    ui = [];
    diffstat.set(result.configStatus === "ok" && fullDiff ? resultDiffstat(result.files) : null);
    if (result.configStatus !== "ok") return;
    const viewed = createClassicViewedState(result.files.map((f) => f.path));
    ui.push(viewed, mountClassicDecorations(result, viewed));
    ui.push(
      mountTreePanel(result, viewed, {
        host: classicTreeHost,
        applyToGitHub: () => true,
        send: async (_id, paths, v, _deps, onEach) => {
          const ok: string[] = [];
          const failed: string[] = [];
          await pool(paths, 4, async (p) => {
            const done = await clickViewed(p, v);
            (done ? ok : failed).push(p);
            onEach?.(p, done);
          });
          return { ok, failed };
        },
      }),
    );
    if (fullDiff && result.files.some((f) => f.autoViewed)) ui.push(mountViewedProgress(result, viewed));
    if (fullDiff && autoView()) ui.push(mountAutoViewer(result, viewed));
  };

  const start = async () => {
    // After a Turbo navigation the files page may not be in the DOM yet.
    let parsed: ClassicPage | null = null;
    for (let i = 0; i < 40 && !disposed && !(parsed = parseClassicPage(document, page)); i++) await wait(250);
    if (!parsed || disposed) return;
    const id = parsed.identity;
    const toc = parsed.tocUrl ? await fetchToc(parsed.tocUrl).catch(() => new Map()) : new Map();
    if (disposed) return;
    const shown = effectiveConfig(id)?.cfg ?? null;
    let result = buildResult(parsed, toc, fullDiff);
    if (result) mount(result);
    const repo = await resolveConfig(id);
    if (disposed) return;
    const fresh = effectiveConfig(id)?.cfg ?? repo;
    if (!shown || shown.hash !== fresh.hash || shown.status !== fresh.status) {
      result = buildResult(parsed, toc, fullDiff);
      if (result) mount(result);
    }
    debug("classic page", result?.configStatus, result?.files.length, "files");
  };
  start().catch((e) => {
    console.warn("[fast-pr] classic page error", e);
  });

  return () => {
    disposed = true;
    ui.forEach((u) => u.destroy());
    ui = [];
    diffstat.destroy();
  };
}
