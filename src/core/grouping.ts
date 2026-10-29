import { UNGROUPED_VIEW_PRIORITY, type CompiledGroup } from "./config";

export const UNGROUPED = "Ungrouped";

function matches(path: string, g: CompiledGroup): boolean {
  return g.test ? g.test(path) : g.regexes.some((r) => r.test(path));
}

/** The matching group with the highest match priority; ties go to the earliest in config order. */
export function assignGroup(path: string, groups: CompiledGroup[]): CompiledGroup | null {
  let best: CompiledGroup | null = null;
  for (const g of groups) {
    if (matches(path, g) && (!best || g.matchPriority > best.matchPriority)) best = g;
  }
  return best;
}

export interface OrderedFile<T> { file: T; group: CompiledGroup | null }

/** Groups by view priority, highest first; ties in config order with Ungrouped after them. */
export function orderFiles<T extends { path: string }>(
  files: T[],
  groups: CompiledGroup[],
  ungroupedView = UNGROUPED_VIEW_PRIORITY,
): OrderedFile<T>[] {
  const all = files.map((file) => ({ file, group: assignGroup(file.path, groups) }));
  const view = (g: CompiledGroup | null) => (g === null ? ungroupedView : g.viewPriority);
  const sortKey = (g: CompiledGroup | null) => (g === null ? groups.length : g.index);
  return all
    .map((o, i) => ({ o, i }))
    .sort(
      (a, b) =>
        view(b.o.group) - view(a.o.group) ||
        sortKey(a.o.group) - sortKey(b.o.group) ||
        a.i - b.i,
    )
    .map((x) => x.o);
}
