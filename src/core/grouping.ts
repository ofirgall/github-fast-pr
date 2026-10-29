import type { CompiledGroup } from "./config";

export const UNGROUPED = "Ungrouped";

function matches(path: string, g: CompiledGroup): boolean {
  return g.test ? g.test(path) : g.regexes.some((r) => r.test(path));
}

export function assignGroup(path: string, groups: CompiledGroup[]): CompiledGroup | null {
  let first: CompiledGroup | null = null;
  for (const g of groups) {
    if (!matches(path, g)) continue;
    if (g.autoViewed) return g;
    if (!first) first = g;
  }
  return first;
}

export interface OrderedFile<T> { file: T; group: CompiledGroup | null }

export function orderFiles<T extends { path: string }>(
  files: T[],
  groups: CompiledGroup[],
): OrderedFile<T>[] {
  const all = files.map((file) => ({ file, group: assignGroup(file.path, groups) }));
  const rank = (g: CompiledGroup | null) => (g === null ? 1 : g.autoViewed ? 2 : 0);
  const sortKey = (g: CompiledGroup | null) => (g === null ? 0 : g.index);
  return all
    .map((o, i) => ({ o, i }))
    .sort(
      (a, b) =>
        rank(a.o.group) - rank(b.o.group) ||
        sortKey(a.o.group) - sortKey(b.o.group) ||
        a.i - b.i,
    )
    .map((x) => x.o);
}
