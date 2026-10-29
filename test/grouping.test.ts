import { describe, it, expect } from "vitest";
import { compileConfig } from "../src/core/config";
import { assignGroup, orderFiles } from "../src/core/grouping";

const groups = compileConfig({
  groups: [
    { name: "Docs", paths: ["\\.md$"], autoViewed: true },
    { name: "Backend", paths: ["^server/"], autoViewed: false },
    { name: "Frontend", paths: ["^web/"], autoViewed: false },
    { name: "Generated", paths: ["\\.gen\\."], autoViewed: true },
  ],
});

describe("assignGroup", () => {
  it("auto group wins over an earlier normal group", () => {
    expect(assignGroup("server/README.md", groups)?.name).toBe("Docs");
  });
  it("first normal match wins in config order", () => {
    const g = compileConfig({ groups: [
      { name: "One", paths: ["src"], autoViewed: false },
      { name: "Two", paths: ["src/a"], autoViewed: false },
    ] });
    expect(assignGroup("src/a.ts", g)?.name).toBe("One");
  });
  it("first auto group wins among autos", () => {
    expect(assignGroup("docs/x.gen.md", groups)?.name).toBe("Docs");
  });
  it("highest matchPriority wins, over auto-viewed too; ties keep config order", () => {
    const g = compileConfig({ groups: [
      { name: "Auto", paths: ["src"], autoViewed: true },
      { name: "Low", paths: ["src"], autoViewed: false },
      { name: "High", paths: ["src/a"], autoViewed: false, matchPriority: 2 },
      { name: "High2", paths: ["src/a"], autoViewed: false, matchPriority: 2 },
    ] });
    expect(assignGroup("src/a.ts", g)?.name).toBe("High");
    expect(assignGroup("src/b.ts", g)?.name).toBe("Auto");
  });
  it("a lowered auto-viewed group loses to a normal one", () => {
    const g = compileConfig({ groups: [
      { name: "Auto", paths: ["src"], autoViewed: true, matchPriority: -1 },
      { name: "Normal", paths: ["src"], autoViewed: false },
    ] });
    expect(assignGroup("src/a.ts", g)?.name).toBe("Normal");
  });
  it("returns null when nothing matches", () => {
    expect(assignGroup("other/file.txt", groups)).toBeNull();
  });
  it("is unanchored and case-sensitive", () => {
    expect(assignGroup("a/server/x", groups)).toBeNull(); // ^server/ anchored by user
    expect(assignGroup("README.MD", groups)).toBeNull();
    const g = compileConfig({ groups: [{ name: "X", paths: ["foo"], autoViewed: false }] });
    expect(assignGroup("a/foo/b", g)?.name).toBe("X");
  });
});

describe("orderFiles", () => {
  it("orders normal groups, then ungrouped, then auto", () => {
    const files = ["a.md", "other.txt", "web/1.ts", "server/1.go", "b.md", "web/2.ts", "server/2.go"].map((path) => ({ path }));
    const out = orderFiles(files, groups).map((o) => o.file.path);
    expect(out).toEqual(["server/1.go", "server/2.go", "web/1.ts", "web/2.ts", "other.txt", "a.md", "b.md"]);
  });
  it("is stable within a group and does not mutate input", () => {
    const files = ["web/z.ts", "web/a.ts", "web/m.ts"].map((path) => ({ path }));
    const copy = [...files];
    expect(orderFiles(files, groups).map((o) => o.file.path)).toEqual(["web/z.ts", "web/a.ts", "web/m.ts"]);
    expect(files).toEqual(copy);
  });
  it("orders multiple auto groups in config order", () => {
    const files = ["x.gen.ts", "a.md"].map((path) => ({ path }));
    expect(orderFiles(files, groups).map((o) => o.group?.name)).toEqual(["Docs", "Generated"]);
  });
  it("orders by viewPriority, highest first, with Ungrouped placed by its own priority", () => {
    const g = compileConfig({
      groups: [
        { name: "A", paths: ["^a/"], autoViewed: false },
        { name: "B", paths: ["^b/"], autoViewed: false, viewPriority: 5 },
        { name: "Auto", paths: ["^z/"], autoViewed: true, viewPriority: 1 },
      ],
    });
    const files = ["a/1", "x", "z/1", "b/1"].map((path) => ({ path }));
    expect(orderFiles(files, g).map((o) => o.group?.name ?? "-")).toEqual(["B", "Auto", "A", "-"]);
    expect(orderFiles(files, g, 10).map((o) => o.group?.name ?? "-")).toEqual(["-", "B", "Auto", "A"]);
    // At an equal priority Ungrouped comes after the groups.
    expect(orderFiles(files, g, 0).map((o) => o.group?.name ?? "-")).toEqual(["B", "Auto", "A", "-"]);
  });
  it("with no groups everything is ungrouped in input order", () => {
    const files = ["b", "a"].map((path) => ({ path }));
    expect(orderFiles(files, []).map((o) => o.file.path)).toEqual(["b", "a"]);
  });
});
