// Which files are viewed: the hook's snapshot at load, then GitHub's live Viewed toggles.
import { VIEWED_EVENT, type FastPrResult, type ViewedChange } from "../shared/types";

export interface ViewedState {
  has(path: string): boolean;
  /** Apply a change made outside GitHub's UI (our own batch requests). */
  set(path: string, viewed: boolean): void;
  /** Called after every change; returns an unsubscribe function. */
  subscribe(fn: () => void): () => void;
  destroy(): void;
}

export function createViewedState(result: FastPrResult): ViewedState {
  const viewed = new Set(result.files.filter((f) => f.originalViewed || f.markedByHook).map((f) => f.path));
  const known = new Set(result.files.map((f) => f.path));
  const subs = new Set<() => void>();
  const id = result.identity;

  const set = (path: string, v: boolean) => {
    if (!known.has(path) || viewed.has(path) === v) return;
    if (v) viewed.add(path);
    else viewed.delete(path);
    subs.forEach((fn) => fn());
  };

  const onEvent = (e: Event) => {
    let c: ViewedChange;
    try {
      c = JSON.parse(String((e as CustomEvent).detail)) as ViewedChange;
    } catch {
      return;
    }
    if (c.owner !== id.owner || c.repo !== id.repo || c.number !== id.number) return;
    set(c.path, c.viewed);
  };
  document.addEventListener(VIEWED_EVENT, onEvent);

  return {
    has: (path) => viewed.has(path),
    set,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    destroy() {
      document.removeEventListener(VIEWED_EVENT, onEvent);
      subs.clear();
    },
  };
}
