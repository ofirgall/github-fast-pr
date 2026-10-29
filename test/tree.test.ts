import { describe, it, expect } from "vitest";
import { compileConfig } from "../src/core/config";
import { orderFiles } from "../src/core/grouping";
import { buildGroupTree, type TreeNode } from "../src/core/tree";

const groups = compileConfig({ groups: [
  { name: "Tests", paths: ["_test\\."], autoViewed: false },
  { name: "Code", paths: ["^pkg/"], autoViewed: false },
  { name: "Gen", paths: ["\\.gen\\."], autoViewed: true },
] });

const mk = (paths: string[]) =>
  orderFiles(paths.map((path) => ({ path, pathDigest: "dg:" + path })), groups);

describe("buildGroupTree", () => {
  it("shows a directory split across two groups under both with only its own files", () => {
    const tree = buildGroupTree(mk(["pkg/util/a.go", "pkg/util/a_test.go", "pkg/util/b.go", "pkg/util/x.gen.go"]));
    expect(tree.map((n) => n.kind === "group" && n.name)).toEqual(["Tests", "Code", "Gen"]);
    const files = (n: TreeNode) => (n.kind === "group" ? JSON.stringify(n.children) : "");
    const t0 = tree[0] as Extract<TreeNode, { kind: "group" }>;
    const t1 = tree[1] as Extract<TreeNode, { kind: "group" }>;
    expect(t0.children).toHaveLength(1);
    expect(t0.children[0]).toMatchObject({ kind: "dir", name: "pkg/util" });
    expect((t0.children[0] as any).children.map((c: any) => c.path)).toEqual(["pkg/util/a_test.go"]);
    expect((t1.children[0] as any).children.map((c: any) => c.path)).toEqual(["pkg/util/a.go", "pkg/util/b.go"]);
    expect(files(tree[2])).toContain("x.gen.go");
    expect((tree[2] as any).autoViewed).toBe(true);
  });
  it("merges single-child directory chains but not dirs with files", () => {
    const tree = buildGroupTree(mk(["pkg/a/b/c/f.go", "pkg/a/g.go", "pkg/z/h.go"]));
    const g = tree[0] as Extract<TreeNode, { kind: "group" }>;
    const root = g.children[0] as any;
    expect(root.name).toBe("pkg");
    expect(root.children.map((c: any) => c.name)).toEqual(["a", "z/h.go".split("/")[0]]);
    const a = root.children[0];
    expect(a.children.map((c: any) => c.name)).toEqual(["b/c", "g.go"]);
    expect(a.children[0].path).toBe("pkg/a/b/c");
  });
  it("includes ungrouped, file digest and keeps first-appearance order", () => {
    const tree = buildGroupTree(mk(["zzz.txt", "aaa.txt"]));
    expect(tree).toHaveLength(1);
    const g = tree[0] as any;
    expect(g).toMatchObject({ kind: "group", name: "Ungrouped", ungrouped: true });
    expect(g.children).toEqual([
      { kind: "file", name: "zzz.txt", path: "zzz.txt", pathDigest: "dg:zzz.txt", autoViewed: false, changeType: null },
      { kind: "file", name: "aaa.txt", path: "aaa.txt", pathDigest: "dg:aaa.txt", autoViewed: false, changeType: null },
    ]);
  });
  it("returns empty for no files", () => {
    expect(buildGroupTree([])).toEqual([]);
  });
});
