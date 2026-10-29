import type { CompiledGroup } from "./config";
import { UNGROUPED, orderFiles } from "./grouping";

export interface DiffFile { path: string; linesAdded: number; linesDeleted: number }
export interface DiffstatRow {
  name: string;
  autoViewed: boolean;
  ungrouped: boolean;
  added: number;
  deleted: number;
  files: number;
}
export interface Diffstat {
  adjusted: { added: number; deleted: number };
  original: { added: number; deleted: number };
  rows: DiffstatRow[];
}

export function computeDiffstat(files: DiffFile[], groups: CompiledGroup[]): Diffstat {
  const original = { added: 0, deleted: 0 };
  const adjusted = { added: 0, deleted: 0 };
  const rows: DiffstatRow[] = [];
  let current: DiffstatRow | null = null;
  let currentKey: string | null = null;
  for (const { file, group } of orderFiles(files, groups)) {
    original.added += file.linesAdded;
    original.deleted += file.linesDeleted;
    const auto = group?.autoViewed === true;
    if (!auto) {
      adjusted.added += file.linesAdded;
      adjusted.deleted += file.linesDeleted;
    }
    const key = group ? `g${group.index}` : "u";
    if (key !== currentKey) {
      current = {
        name: group ? group.name : UNGROUPED,
        autoViewed: auto,
        ungrouped: group === null,
        added: 0,
        deleted: 0,
        files: 0,
      };
      rows.push(current);
      currentKey = key;
    }
    current!.added += file.linesAdded;
    current!.deleted += file.linesDeleted;
    current!.files += 1;
  }
  return { adjusted, original, rows };
}
