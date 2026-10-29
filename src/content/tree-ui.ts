import type { OrderedFile } from "../core/grouping";
import { buildGroupTree, type TreeNode } from "../core/tree";
import { getTreeMode, setTreeMode, type TreeMode } from "../core/storage";
import type { FastPrFile, FastPrResult } from "../shared/types";
import { el, fmt, icon, isOwnMutation, markUi, throttled } from "./dom";
import type { ViewedState } from "./viewed-state";

export function toOrdered(
  files: FastPrFile[],
): OrderedFile<{ path: string; pathDigest: string; changeType: string | null; linesAdded: number; linesDeleted: number }>[] {
  return files.map((f) => ({
    file: {
      path: f.path,
      pathDigest: f.pathDigest,
      changeType: f.changeType ?? null,
      linesAdded: f.linesAdded,
      linesDeleted: f.linesDeleted,
    },
    group:
      f.group === null
        ? null
        : { name: f.group, autoViewed: f.autoViewed, index: f.groupIndex ?? 0, regexes: [] },
  }));
}

// Octicons, as in GitHub's own file tree (chevrons are the 12px set).
const P = {
  chevDown: "M6 8.825c-.2 0-.4-.1-.5-.2l-3.3-3.3c-.3-.3-.3-.8 0-1.1.3-.3.8-.3 1.1 0l2.7 2.7 2.7-2.7c.3-.3.8-.3 1.1 0 .3.3.3.8 0 1.1l-3.2 3.2c-.2.2-.4.3-.6.3Z",
  chevRight: "M4.7 10c-.2 0-.4-.1-.5-.2-.3-.3-.3-.8 0-1.1L6.9 6 4.2 3.3c-.3-.3-.3-.8 0-1.1.3-.3.8-.3 1.1 0l3.3 3.2c.3.3.3.8 0 1.1L5.3 9.7c-.2.2-.4.3-.6.3Z",
  dir: "M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z",
  dirOpen: "M.513 1.513A1.75 1.75 0 0 1 1.75 1h3.5c.55 0 1.07.26 1.4.7l.9 1.2a.25.25 0 0 0 .2.1H13a1 1 0 0 1 1 1v.5H2.75a.75.75 0 0 0 0 1.5h11.978a1 1 0 0 1 .994 1.117L15 13.25A1.75 1.75 0 0 1 13.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75c0-.464.184-.91.513-1.237Z",
  zap: "M9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.123c1.57 0 2.346 1.909 1.22 3.004l-7.34 7.142a1.249 1.249 0 0 1-.871.354h-.302a1.25 1.25 0 0 1-1.157-1.723L5.633 10.5H3.462c-1.57 0-2.346-1.909-1.22-3.004L9.503.429Zm1.047 1.074L3.286 8.571A.25.25 0 0 0 3.462 9H6.75a.75.75 0 0 1 .694 1.034l-1.713 4.188 6.982-6.793A.25.25 0 0 0 12.538 7H9.25a.75.75 0 0 1-.683-1.06l2.008-4.418.003-.006a.036.036 0 0 0-.004-.009l-.006-.006-.008-.003h-.006l-.026.006Z",
  file: "M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z",
  fileAdded: "M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V4.664a.25.25 0 0 0-.073-.177l-2.914-2.914a.25.25 0 0 0-.177-.073Zm4.48 3.758a.75.75 0 0 1 .755.745l.01 1.497h1.497a.75.75 0 0 1 0 1.5H9v1.507a.75.75 0 0 1-1.5 0V9.005l-1.502.01a.75.75 0 0 1-.01-1.5l1.507-.01-.01-1.492a.75.75 0 0 1 .745-.755Z",
  fileDiff: "M1 1.75C1 .784 1.784 0 2.75 0h7.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V4.664a.25.25 0 0 0-.073-.177l-2.914-2.914a.25.25 0 0 0-.177-.073ZM8 3.25a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0V7h-1.5a.75.75 0 0 1 0-1.5h1.5V4A.75.75 0 0 1 8 3.25Zm-3 8a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z",
  fileMoved: "M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-3.5a.75.75 0 0 1 0-1.5h3.5a.25.25 0 0 0 .25-.25V4.664a.25.25 0 0 0-.073-.177l-2.914-2.914a.25.25 0 0 0-.177-.073H3.75a.25.25 0 0 0-.25.25v6.5a.75.75 0 0 1-1.5 0v-6.5Zm3.427 13.823 3.146-3.146a.25.25 0 0 0 0-.354L5.427 8.927A.25.25 0 0 0 5 9.104V11.5H.75a.75.75 0 0 0 0 1.5H5v2.396c0 .223.27.335.427.177Z",
  fileRemoved: "M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V4.664a.25.25 0 0 0-.073-.177l-2.914-2.914a.25.25 0 0 0-.177-.073Zm4.5 6h2.242a.75.75 0 0 1 0 1.5h-2.24l-2.254.015a.75.75 0 0 1-.01-1.5Z",
  stack: "M7.122.392a1.75 1.75 0 0 1 1.756 0l5.003 2.902c.83.481.83 1.68 0 2.162L8.878 8.358a1.75 1.75 0 0 1-1.756 0L2.119 5.456a1.251 1.251 0 0 1 0-2.162ZM8.125 1.69a.248.248 0 0 0-.25 0l-4.63 2.685 4.63 2.685a.248.248 0 0 0 .25 0l4.63-2.685ZM1.601 7.789a.75.75 0 0 1 1.025-.273l5.249 3.044a.248.248 0 0 0 .25 0l5.249-3.044a.75.75 0 0 1 .752 1.298l-5.248 3.044a1.75 1.75 0 0 1-1.756 0L1.874 8.814A.75.75 0 0 1 1.6 7.789Zm0 3.5a.75.75 0 0 1 1.025-.273l5.249 3.044a.248.248 0 0 0 .25 0l5.249-3.044a.75.75 0 0 1 .752 1.298l-5.248 3.044a1.75 1.75 0 0 1-1.756 0l-5.248-3.044a.75.75 0 0 1-.273-1.025Z",
  check: "M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z",
  comment: "M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z",
};

/** Icon and colour for a file's changeType, matching GitHub's tree. */
const CHANGE_ICON: Record<string, { path: string; cls: string; label: string }> = {
  ADDED: { path: P.fileAdded, cls: "fast-pr-ct-added", label: "added" },
  COPIED: { path: P.fileAdded, cls: "fast-pr-ct-added", label: "copied" },
  MODIFIED: { path: P.fileDiff, cls: "fast-pr-ct-modified", label: "modified" },
  CHANGED: { path: P.fileDiff, cls: "fast-pr-ct-modified", label: "changed" },
  RENAMED: { path: P.fileMoved, cls: "fast-pr-ct-moved", label: "renamed" },
  REMOVED: { path: P.fileRemoved, cls: "fast-pr-ct-removed", label: "removed" },
  DELETED: { path: P.fileRemoved, cls: "fast-pr-ct-removed", label: "deleted" },
};

function chevSlot(expandable: boolean, open: boolean): HTMLElement {
  const s = el("span", "fast-pr-tree-chev");
  if (expandable) s.append(icon(open ? P.chevDown : P.chevRight, undefined, 12));
  return s;
}

function leadSlot(node: TreeNode, open: boolean): HTMLElement {
  const s = el("span", "fast-pr-tree-icon");
  if (node.kind === "file") {
    const ct = node.changeType ? CHANGE_ICON[node.changeType] : undefined;
    s.append(icon(ct?.path ?? P.file));
    if (ct) {
      s.classList.add(ct.cls);
      s.title = ct.label;
    }
  } else if (node.kind === "group") {
    s.append(icon(P.stack));
    if (node.autoViewed) s.classList.add("fast-pr-group-auto");
  } else {
    s.append(icon(open ? P.dirOpen : P.dir));
  }
  return s;
}

function countFiles(n: TreeNode): number {
  return n.kind === "file" ? 1 : n.children.reduce((a, c) => a + countFiles(c), 0);
}

function sumLines(n: TreeNode): { added: number; deleted: number } {
  if (n.kind === "file") return { added: n.added, deleted: n.deleted };
  return n.children.reduce(
    (t, c) => {
      const s = sumLines(c);
      return { added: t.added + s.added, deleted: t.deleted + s.deleted };
    },
    { added: 0, deleted: 0 },
  );
}

/** "+12 -3" like GitHub's diffstat: a zero side is left out. */
function linesBadge(n: TreeNode): HTMLElement {
  const { added, deleted } = sumLines(n);
  const s = el("span", "fast-pr-tree-lines");
  if (added) s.append(el("span", "fast-pr-add", `+${fmt(added)}`));
  if (deleted) s.append(el("span", "fast-pr-del", `-${fmt(deleted)}`));
  s.title = `${fmt(added)} added, ${fmt(deleted)} deleted`;
  return s;
}

function buildItem(node: TreeNode, level: number): HTMLLIElement {
  const li = el("li");
  li.setAttribute("role", "treeitem");
  li.setAttribute("aria-level", String(level));
  li.tabIndex = -1;
  const row = el("div", "fast-pr-tree-row");
  // One 8px cell per ancestor level; their borders are the indent lines shown on hover.
  if (level > 1) {
    const spacer = el("span", "fast-pr-tree-spacer");
    for (let i = 1; i < level; i++) spacer.append(el("span", "fast-pr-tree-line"));
    row.append(spacer);
  }
  if (node.kind === "file") {
    li.dataset.kind = "file";
    li.dataset.digest = node.pathDigest;
    li.dataset.path = node.path;
    li.title = node.path;
    // The check is only visible while the row has data-viewed (see setViewed).
    const mark = el("span", "fast-pr-tree-viewed");
    mark.title = node.autoViewed ? "Auto-viewed" : "Viewed";
    mark.append(icon(P.check));
    row.append(chevSlot(false, false), leadSlot(node, false), el("span", "fast-pr-tree-name", node.name), linesBadge(node), mark);
    li.append(row);
  } else {
    li.dataset.kind = node.kind;
    // Auto-viewed groups start collapsed: there is nothing in them to review.
    const open = !(node.kind === "group" && node.autoViewed);
    li.setAttribute("aria-expanded", String(open));
    row.append(chevSlot(true, open));
    row.append(leadSlot(node, open));
    row.append(el("span", "fast-pr-tree-name", node.name));
    if (node.kind === "group" && node.autoViewed) row.append(el("span", "fast-pr-pill", "auto-viewed"));
    // With a single file inside, its own row already shows the lines and count.
    const files = countFiles(node);
    if (files > 1) {
      row.append(linesBadge(node));
      const count = el("span", "fast-pr-tree-count");
      count.title = `${fmt(files)} files`;
      count.append(icon(P.file), el("span", undefined, fmt(files)));
      row.append(count);
    }
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
  if (chev) chev.replaceChildren(icon(open ? P.chevDown : P.chevRight, undefined, 12));
  if (li.dataset.kind === "dir") row?.querySelector(":scope > .fast-pr-tree-icon")?.replaceChildren(icon(open ? P.dirOpen : P.dir));
}

/** Show `count` comments at the end of a file row, like GitHub's tree; 0 removes it. */
function setComments(li: HTMLElement, count: number): void {
  const row = li.querySelector<HTMLElement>(":scope > .fast-pr-tree-row");
  if (!row) return;
  let badge = row.querySelector<HTMLElement>(":scope > .fast-pr-tree-comments");
  if (count <= 0) {
    badge?.remove();
    return;
  }
  if (badge?.dataset.count === String(count)) return;
  if (!badge) {
    badge = el("span", "fast-pr-tree-comments");
    row.insertBefore(badge, row.querySelector(":scope > .fast-pr-tree-viewed"));
  }
  badge.dataset.count = String(count);
  badge.title = `${count} comment${count === 1 ? "" : "s"}`;
  badge.replaceChildren(icon(P.comment), el("span", undefined, String(count)));
}

/** Collapse `li`, moving the roving tab stop (and focus) off rows it hides. */
function collapse(li: HTMLElement): void {
  setExpanded(li, false);
  const kids = li.querySelector(":scope > ul");
  const stop = kids?.querySelector<HTMLElement>('li[tabindex="0"]');
  const focused = !!kids && kids.contains(document.activeElement);
  if (!stop && !focused) return;
  if (stop) stop.tabIndex = -1;
  li.tabIndex = 0;
  if (focused) li.focus();
}

/**
 * Viewed counts on folder and group rows ("3/9"), green with a check once all are viewed.
 * A folder or group collapses when it becomes fully viewed; reopening it by hand sticks.
 */
export function setViewed(tree: HTMLElement, has: (path: string) => boolean): void {
  tree.querySelectorAll<HTMLElement>('li[data-kind="file"]').forEach((li) => li.toggleAttribute("data-viewed", has(li.dataset.path ?? "")));
  tree.querySelectorAll<HTMLElement>('li[data-kind="dir"], li[data-kind="group"]').forEach((li) => {
    const total = li.querySelectorAll('li[data-kind="file"]').length;
    const viewed = li.querySelectorAll('li[data-kind="file"][data-viewed]').length;
    const done = total > 0 && viewed === total;
    if (done && !li.hasAttribute("data-done")) collapse(li);
    li.toggleAttribute("data-done", done);

    const count = li.querySelector<HTMLElement>(":scope > .fast-pr-tree-row > .fast-pr-tree-count");
    if (!count) return;
    const sig = `${viewed}/${total}`;
    if (count.dataset.sig === sig) return;
    count.dataset.sig = sig;
    count.classList.toggle("fast-pr-tree-count-done", done);
    count.title = `${fmt(viewed)} of ${fmt(total)} files viewed`;
    count.replaceChildren(icon(done ? P.check : P.file), el("span", undefined, `${fmt(viewed)}/${fmt(total)}`));
  });
}

/**
 * Copy per-file state that only GitHub's own (hidden) tree knows: comment counts and
 * which file is current. Native items use the file path as their id.
 */
export function syncFromNative(tree: HTMLElement, native: Element): void {
  const ours = new Map<string, HTMLElement>();
  tree.querySelectorAll<HTMLElement>('li[data-kind="file"]').forEach((li) => ours.set(li.dataset.path ?? "", li));
  let current: string | null = null;
  for (const n of native.querySelectorAll<HTMLElement>('li[role="treeitem"]:not([aria-expanded])')) {
    const li = ours.get(n.id);
    if (!li) continue;
    if (n.getAttribute("aria-current") === "true") current = n.id;
    const c = n.querySelector(".octicon-comment");
    const count = c ? Number(c.nextElementSibling?.textContent ?? "") || 1 : 0;
    setComments(li, count);
  }
  for (const [path, li] of ours) {
    if (path === current) li.setAttribute("aria-current", "true");
    else li.removeAttribute("aria-current");
  }
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
/** The "Filter files…" row; the toggle sits after its filter button. */
const FILTER_ROW = "#diff-file-tree-filter";

export interface Mounted { destroy(): void }

export function mountTreePanel(result: FastPrResult, viewed: ViewedState): Mounted {
  const nodes = buildGroupTree(toOrdered(result.files));
  const panel = el("div", "fast-pr-tree-panel");
  markUi(panel);
  const toolbar = el("div", "fast-pr-tree-toolbar");
  const toggle = el("button", "fast-pr-tree-toggle");
  toggle.type = "button";
  toggle.classList.add("fast-pr-tip");
  markUi(toggle);
  toggle.append(icon(P.zap));
  const tree = renderTree(nodes, (digest) => {
    location.hash = "diff-" + digest;
  });
  panel.append(toolbar, tree);
  setViewed(tree, viewed.has);
  const unsubscribe = viewed.subscribe(() => setViewed(tree, viewed.has));

  let mode: TreeMode = getTreeMode();
  let container: HTMLElement | null = null;

  const apply = () => {
    toggle.setAttribute("aria-pressed", String(mode === "grouped"));
    toggle.dataset.tip =
      mode === "grouped" ? "Fast PR grouped tree: on (click for GitHub's tree)" : "Fast PR grouped tree: off (click to turn on)";
    toggle.setAttribute("aria-label", "Fast PR grouped tree");
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
    // Next to GitHub's filter button when that row exists, else in our own toolbar.
    const row = document.querySelector(FILTER_ROW);
    const home = row ?? toolbar;
    if (toggle.parentElement !== home || (row && toggle !== row.lastElementChild)) home.append(toggle);
    if (native) syncFromNative(tree, native);
    apply();
  };
  const sched = throttled(ensure, 50);
  const mo = new MutationObserver((muts) => {
    if (muts.every(isOwnMutation)) return;
    sched.call();
  });
  // aria-current: GitHub's tree marks the file in view.
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current"] });
  ensure();

  return {
    destroy() {
      mo.disconnect();
      sched.cancel();
      unsubscribe();
      container?.classList.remove("fast-pr-hidden");
      toggle.remove();
      panel.remove();
    },
  };
}
