import { describe, it, expect } from "vitest";
import { compileConfig } from "../src/core/config";
import { computeDiffstat } from "../src/core/diffstat";

const cfg = (auto: boolean) =>
  compileConfig({ groups: [
    { name: "Gen", paths: ["^gen/"], autoViewed: auto },
    { name: "Code", paths: ["^src/"], autoViewed: false },
    { name: "Empty", paths: ["^nothing/"], autoViewed: false },
  ] });

describe("computeDiffstat", () => {
  it("excludes auto groups from adjusted totals", () => {
    const files = [
      { path: "src/a.ts", linesAdded: 200, linesDeleted: 80 },
      { path: "gen/a.ts", linesAdded: 800, linesDeleted: 20 },
    ];
    const d = computeDiffstat(files, cfg(true));
    expect(d.original).toEqual({ added: 1000, deleted: 100, files: 2 });
    expect(d.adjusted).toEqual({ added: 200, deleted: 80, files: 1 });
  });
  it("adjusted equals original with no auto groups", () => {
    const files = [
      { path: "src/a.ts", linesAdded: 5, linesDeleted: 1 },
      { path: "gen/a.ts", linesAdded: 7, linesDeleted: 2 },
    ];
    const d = computeDiffstat(files, cfg(false));
    expect(d.adjusted).toEqual(d.original);
    expect(d.adjusted).toEqual({ added: 12, deleted: 3, files: 2 });
  });
  it("rows are in display order, omit empty groups, mark auto and ungrouped", () => {
    const files = [
      { path: "gen/a.ts", linesAdded: 8, linesDeleted: 2 },
      { path: "misc.txt", linesAdded: 3, linesDeleted: 0 },
      { path: "src/a.ts", linesAdded: 2, linesDeleted: 1 },
      { path: "src/b.ts", linesAdded: 1, linesDeleted: 1 },
    ];
    const d = computeDiffstat(files, cfg(true));
    expect(d.rows).toEqual([
      { name: "Code", autoViewed: false, ungrouped: false, added: 3, deleted: 2, files: 2 },
      { name: "Ungrouped", autoViewed: false, ungrouped: true, added: 3, deleted: 0, files: 1 },
      { name: "Gen", autoViewed: true, ungrouped: false, added: 8, deleted: 2, files: 1 },
    ]);
  });
  it("handles no files", () => {
    const d = computeDiffstat([], cfg(true));
    expect(d.rows).toEqual([]);
    expect(d.adjusted).toEqual({ added: 0, deleted: 0, files: 0 });
  });
});
