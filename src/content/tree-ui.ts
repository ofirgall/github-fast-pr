import type { OrderedFile } from "../core/grouping";
import { buildGroupTree, type TreeNode } from "../core/tree";
import { getTreeMode, setTreeMode, type TreeMode } from "../core/storage";
import type { FastPrFile, FastPrResult } from "../shared/types";
import { el, icon, isOwnMutation, markUi, throttled } from "./dom";

export function toOrdered(files: FastPrFile[]): OrderedFile<{ path: string; pathDigest: string }>[] {
  return files.map((f) => ({
    file: { path: f.path, pathDigest: f.pathDigest },
    group:
      f.group === null
        ? null
        : { name: f.group, autoViewed: f.autoViewed, index: f.groupIndex ?? 0, regexes: [] },
  }));
}

const P = {
  chevDown: "M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z",
  chevRight: "M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z",
  dir: "M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z",
  dirOpen: "M.513 1.513A1.75 1.75 0 0 1 1.75 1h3.5c.55 0 1.07.26 1.4.7l.9 1.2a.25.25 0 0 0 .2.1H13a1 1 0 0 1 1 1v.5H2.75a.75.75 0 0 0 0 1.5h11.978a1 1 0 0 1 .994 1.117L15 13.25A1.75 1.75 0 0 1 13.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75c0-.464.184-.91.513-1.237Z",
  file: "M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.5.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z",
};

function chevSlot(expandable: boolean, open: boolean): HTMLElement {
  const s = el("span", "fast-pr-tree-chev");
  if (expandable) s.append(icon(open ? P.chevDown : P.chevRight));
  return s;
}

function leadSlot(kind: "dir" | "file", open: boolean): HTMLElement {
  const s = el("span", "fast-pr-tree-icon");
  s.append(icon(kind === "file" ? P.file : open ? P.dirOpen : P.dir));
  return s;
}

function countFiles(n: TreeNode): number {
  return n.kind === "file" ? 1 : n.children.reduce((a, c) => a + countFiles(c), 0);
}

function buildItem(node: TreeNode, level: number): HTMLLIElement {
  const li = el("li");
  li.setAttribute("role", "treeitem");
  li.setAttribute("aria-level", String(level));
  li.tabIndex = -1;
  const row = el("div", "fast-pr-tree-row");
  row.style.paddingLeft = `${(level - 1) * 14 + 4}px`;
  if (node.kind === "file") {
    li.dataset.kind = "file";
    li.dataset.digest = node.pathDigest;
    li.title = node.path;
    row.append(chevSlot(false, false), leadSlot("file", false), el("span", "fast-pr-tree-name", node.name));
    if (node.autoViewed) {
      const m = el("span", "fast-pr-tree-auto", "✓");
      m.title = "Auto-viewed";
      row.append(m);
    }
    li.append(row);
  } else {
    li.dataset.kind = node.kind;
    li.setAttribute("aria-expanded", "true");
    row.append(chevSlot(true, true));
    if (node.kind === "dir") row.append(leadSlot("dir", true));
    row.append(el("span", "fast-pr-tree-name", node.name));
    if (node.kind === "group" && node.autoViewed) row.append(el("span", "fast-pr-pill", "auto-viewed"));
    row.append(el("span", "fast-pr-tree-count", String(countFiles(node))));
    li.append(row);
    const ul = el("ul");
    ul.setAttribute("role", "group");
    for (const c of node.children) ul.append(buildItem(c, level + 1));
    li.append(ul);
  }
  return li;
}

function setExpanded(li: HTMLElement, open: boolean): void {
  li.setAttribute("aria-expanded", String(open));
  const row = li.querySelector(":scope > .fast-pr-tree-row");
  const chev = row?.querySelector(":scope > .fast-pr-tree-chev");
  if (chev) chev.replaceChildren(icon(open ? P.chevDown : P.chevRight));
  if (li.dataset.kind === "dir") row?.querySelector(":scope > .fast-pr-tree-icon")?.replaceChildren(icon(open ? P.dirOpen : P.dir));
}

export function renderTree(
  nodes: TreeNode[],
  onSelect: (pathDigest: string, path: string) => void,
  label = "Grouped files",
): HTMLUListElement {
  const root = el("ul", "fast-pr-tree");
  root.setAttribute("role", "tree");
  root.setAttribute("aria-label", label);
  for (const n of nodes) root.append(buildItem(n, 1));

  const items = (): HTMLLIElement[] =>
    [...root.querySelectorAll<HTMLLIElement>('li[role="treeitem"]')].filter((li) => {
      for (let p = li.parentElement?.closest("li"); p; p = p.parentElement?.closest("li") ?? null) {
        if (p.getAttribute("aria-expanded") === "false") return false;
      }
      return true;
    });
  const focusItem = (li: HTMLElement | undefined) => {
    if (!li) return;
    root.querySelectorAll<HTMLElement>('li[tabindex="0"]').forEach((x) => (x.tabIndex = -1));
    li.tabIndex = 0;
    li.focus();
  };
  const first = root.querySelector<HTMLElement>('li[role="treeitem"]');
  if (first) first.tabIndex = 0;

  const activate = (li: HTMLElement) => {
    if (li.dataset.kind === "file") {
      const title = li.title;
      onSelect(li.dataset.digest ?? "", title);
    } else {
      setExpanded(li, li.getAttribute("aria-expanded") !== "true");
    }
  };

  root.addEventListener("click", (e) => {
    const li = (e.target as Element).closest<HTMLElement>('li[role="treeitem"]');
    if (!li) return;
    focusItem(li);
    activate(li);
  });
  root.addEventListener("keydown", (e) => {
    const li = (e.target as Element).closest<HTMLElement>('li[role="treeitem"]');
    if (!li) return;
    const vis = items();
    const i = vis.indexOf(li as HTMLLIElement);
    const expandable = li.hasAttribute("aria-expanded");
    const open = li.getAttribute("aria-expanded") === "true";
    let handled = true;
    switch (e.key) {
      case "ArrowDown": focusItem(vis[i + 1]); break;
      case "ArrowUp": focusItem(vis[i - 1]); break;
      case "Home": focusItem(vis[0]); break;
      case "End": focusItem(vis[vis.length - 1]); break;
      case "ArrowRight":
        if (expandable && !open) setExpanded(li, true);
        else if (expandable) focusItem(li.querySelector<HTMLElement>(':scope > ul > li[role="treeitem"]') ?? undefined);
        break;
      case "ArrowLeft":
        if (expandable && open) setExpanded(li, false);
        else focusItem(li.parentElement?.closest<HTMLElement>("li") ?? undefined);
        break;
      case "Enter":
      case " ":
        activate(li);
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  return root;
}

const NATIVE_TREE = 'ul[role="tree"][aria-label="File Tree"]';

export interface Mounted { destroy(): void }

export function mountTreePanel(result: FastPrResult): Mounted {
  const nodes = buildGroupTree(toOrdered(result.files));
  const panel = el("div", "fast-pr-tree-panel");
  markUi(panel);
  const toolbar = el("div", "fast-pr-tree-toolbar");
  const toggle = el("button", "fast-pr-tree-toggle");
  toggle.type = "button";
  toolbar.append(toggle);
  const tree = renderTree(nodes, (digest) => {
    location.hash = "diff-" + digest;
  });
  panel.append(toolbar, tree);

  let mode: TreeMode = getTreeMode();
  let container: HTMLElement | null = null;

  const apply = () => {
    toggle.textContent = mode === "grouped" ? "Grouped" : "Original";
    toggle.setAttribute("aria-pressed", String(mode === "grouped"));
    toggle.title = mode === "grouped" ? "Showing grouped tree; click for GitHub's tree" : "Showing GitHub's tree; click for grouped tree";
    tree.hidden = mode !== "grouped";
    container?.classList.toggle("fast-pr-hidden", mode === "grouped");
  };
  toggle.addEventListener("click", () => {
    mode = mode === "grouped" ? "original" : "grouped";
    setTreeMode(mode);
    apply();
  });

  const ensure = () => {
    const native = document.querySelector(NATIVE_TREE);
    const c = native?.parentElement;
    if (!c || !c.parentElement) return;
    if (container !== c) {
      container?.classList.remove("fast-pr-hidden");
      container = c;
    }
    if (panel.parentElement !== c.parentElement || panel.nextSibling !== c) {
      c.parentElement.insertBefore(panel, c);
    }
    apply();
  };
  const sched = throttled(ensure, 50);
  const mo = new MutationObserver((muts) => {
    if (muts.every(isOwnMutation)) return;
    sched.call();
  });
  mo.observe(document.body, { childList: true, subtree: true });
  ensure();

  return {
    destroy() {
      mo.disconnect();
      sched.cancel();
      container?.classList.remove("fast-pr-hidden");
      panel.remove();
    },
  };
}
