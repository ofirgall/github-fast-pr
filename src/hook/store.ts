// GitHub's PR changes page keeps per-file viewed state in a Zustand store, provided by
// PullRequestStoreProvider and held in one of its hooks. GitHub's own Viewed button calls
// setDiffViewed after its request succeeds; we do the same after ours.

export interface PrStoreState {
  summariesViewedStatus: Record<string, boolean>;
  diffSummariesActions: { setDiffViewed(path: string, viewed: boolean): void };
  filesCollapsedStatusActions: { updateFileCollapsedStatus(path: string, collapsed: boolean): void };
}
export interface PrStore {
  getState(): PrStoreState;
}

interface Fiber {
  memoizedState: unknown;
  return: Fiber | null;
}
interface Hook {
  memoizedState: unknown;
  next: Hook | null;
}

const isStore = (v: unknown): v is PrStore => {
  if (typeof v !== "object" || v === null || typeof (v as PrStore).getState !== "function") return false;
  const s = (v as PrStore).getState() as Partial<PrStoreState> | null;
  return (
    !!s &&
    typeof s.summariesViewedStatus === "object" &&
    typeof s.diffSummariesActions?.setDiffViewed === "function" &&
    typeof s.filesCollapsedStatusActions?.updateFileCollapsedStatus === "function"
  );
};

/** The store above `start` in React's tree, found by its shape (component names are minified). */
export function findPrStore(start: Element): PrStore | null {
  const key = Object.keys(start).find((k) => k.startsWith("__reactFiber$"));
  if (!key) return null;
  for (let f = (start as unknown as Record<string, Fiber>)[key]; f; f = f.return as Fiber) {
    let h = f.memoizedState as Hook | null;
    // Class components and host nodes keep other things here; hooks form a `next` list.
    for (let i = 0; h && typeof h === "object" && "next" in h && i < 200; h = h.next, i++) {
      if (isStore(h.memoizedState)) return h.memoizedState;
    }
  }
  return null;
}

/** Mark `paths` viewed (and collapsed, as GitHub does) or the reverse; returns how many changed. */
export function applyViewedToStore(store: PrStore, paths: string[], viewed: boolean): number {
  let n = 0;
  for (const p of paths) {
    const s = store.getState();
    if (!(p in s.summariesViewedStatus) || s.summariesViewedStatus[p] === viewed) continue;
    s.diffSummariesActions.setDiffViewed(p, viewed);
    s.filesCollapsedStatusActions.updateFileCollapsedStatus(p, viewed);
    n++;
  }
  return n;
}
