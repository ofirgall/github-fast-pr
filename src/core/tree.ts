import type { GroupRef } from "./diffstat";
import { UNGROUPED } from "./grouping";

export type TreeNode =
  | { kind: "group"; name: string; autoViewed: boolean; ungrouped: boolean; children: TreeNode[] }
  | { kind: "dir"; name: string; path: string; children: TreeNode[] }
  | {
      kind: "file";
      name: string;
      path: string;
      pathDigest: string;
      autoViewed: boolean;
      changeType: string | null;
      added: number;
      deleted: number;
    };

function mergeDirs(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((n) => {
    if (n.kind !== "dir") return n;
    let cur = n;
    while (cur.children.length === 1 && cur.children[0].kind === "dir") {
      const child = cur.children[0];
      cur = { kind: "dir", name: `${cur.name}/${child.name}`, path: child.path, children: child.children };
    }
    return { ...cur, children: mergeDirs(cur.children) };
  });
}

export function buildGroupTree<
  T extends { path: string; pathDigest: string; changeType?: string | null; linesAdded?: number; linesDeleted?: number },
>(
  ordered: { file: T; group: GroupRef | null }[],
): TreeNode[] {
  const result: TreeNode[] = [];
  const groups = new Map<string, Extract<TreeNode, { kind: "group" }>>();
  const dirs = new Map<string, Extract<TreeNode, { kind: "dir" }>>();
  for (const { file, group } of ordered) {
    const gkey = group ? `g${group.index}` : "u";
    let g = groups.get(gkey);
    if (!g) {
      g = {
        kind: "group",
        name: group ? group.name : UNGROUPED,
        autoViewed: group?.autoViewed === true,
        ungrouped: group === null,
        children: [],
      };
      groups.set(gkey, g);
      result.push(g);
    }
    const parts = file.path.split("/");
    let siblings = g.children;
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      const dkey = `${gkey}\0${acc}`;
      let d = dirs.get(dkey);
      if (!d) {
        d = { kind: "dir", name: parts[i], path: acc, children: [] };
        dirs.set(dkey, d);
        siblings.push(d);
      }
      siblings = d.children;
    }
    siblings.push({
      kind: "file",
      name: parts[parts.length - 1],
      path: file.path,
      pathDigest: file.pathDigest,
      autoViewed: group?.autoViewed === true,
      changeType: file.changeType ?? null,
      added: file.linesAdded ?? 0,
      deleted: file.linesDeleted ?? 0,
    });
  }
  for (const g of result) if (g.kind === "group") g.children = mergeDirs(g.children);
  return result;
}
