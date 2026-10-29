// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { buildGroupTree } from "../../src/core/tree";
import { renderTree, toOrdered, mountTreePanel } from "../../src/content/tree-ui";
import type { FastPrFile, FastPrResult } from "../../src/shared/types";

const f = (path: string, group: string | null, idx: number | null, auto = false): FastPrFile => ({
  path, pathDigest: "dg_" + path.replace(/\W/g, "_"), linesAdded: 1, linesDeleted: 0, changeType: null,
  group, groupIndex: idx, autoViewed: auto, originalViewed: false, markedByHook: false, skippedUnviewed: false,
});
const FILES = [f("src/a/x.ts", "Src", 0), f("src/a/y.ts", "Src", 0), f("README.md", null, null), f("gen/g.ts", "Gen", 1, true)];
const result = (): FastPrResult => ({
  v: 1, routeKey: "pullRequestsChangesRoute",
  identity: { owner: "o", repo: "r", number: 1, headSha: "s", baseBranch: "main" },
  fullDiff: true, configStatus: "ok", appliedHash: "h", devConfig: false, files: FILES,
});
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

const CHEV_RIGHT = "M4.7 10c";
const CHEV_DOWN = "M6 8.825";
const chevPath = (li: Element) =>
  li.querySelector(":scope > .fast-pr-tree-row > .fast-pr-tree-chev path")?.getAttribute("d") ?? "";

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  location.hash = "";
});

describe("renderTree", () => {
  it("renders groups, merged dirs, files with aria", () => {
    const picked: string[] = [];
    const ul = renderTree(buildGroupTree(toOrdered(FILES)), (d) => picked.push(d));
    document.body.append(ul);
    expect(ul.getAttribute("role")).toBe("tree");
    expect(ul.getAttribute("aria-label")).toBe("Grouped files");
    const groups = [...ul.querySelectorAll<HTMLElement>('[data-kind="group"]')];
    expect(groups.map((g) => g.querySelector(".fast-pr-tree-name")!.textContent)).toEqual(["Src", "Ungrouped", "Gen"]);
    // The auto-viewed group (Gen) starts collapsed.
    expect(groups.map((g) => g.getAttribute("aria-expanded"))).toEqual(["true", "true", "false"]);
    expect(ul.querySelector('[data-kind="dir"] .fast-pr-tree-name')!.textContent).toBe("src/a");
    expect(ul.querySelectorAll(".fast-pr-tree-auto")).toHaveLength(1);
    expect(ul.querySelectorAll('li[tabindex="0"]')).toHaveLength(1);
  });

  it("uses svg octicons: chevrons for expandable, folder swap for dirs, file icon, spacer for files", () => {
    const ul = renderTree(buildGroupTree(toOrdered(FILES)), () => {});
    document.body.append(ul);
    expect(ul.textContent).not.toMatch(/[▾▸•]/);
    for (const svg of ul.querySelectorAll("svg")) {
      // 12px chevrons, 16px icons, as in GitHub's tree.
      const chev = svg.parentElement!.classList.contains("fast-pr-tree-chev");
      expect(svg.getAttribute("width")).toBe(chev ? "12" : "16");
      expect(svg.getAttribute("fill")).toBe("currentColor");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
    const group = ul.querySelector<HTMLElement>('[data-kind="group"]')!;
    expect(chevPath(group).startsWith(CHEV_DOWN)).toBe(true);
    const groupIcon = group.querySelector(":scope > .fast-pr-tree-row > .fast-pr-tree-icon")!;
    expect(groupIcon.querySelector("path")!.getAttribute("d")!.startsWith("M7.122")).toBe(true);
    expect(groupIcon.classList.contains("fast-pr-group-auto")).toBe(false);
    const autoGroup = [...ul.querySelectorAll<HTMLElement>('[data-kind="group"]')].find((g) => g.textContent!.includes("Gen"))!;
    expect(autoGroup.querySelector(":scope > .fast-pr-tree-row > .fast-pr-tree-icon")!.classList.contains("fast-pr-group-auto")).toBe(true);
    expect(autoGroup.getAttribute("aria-expanded")).toBe("false");
    expect(chevPath(autoGroup).startsWith(CHEV_RIGHT)).toBe(true);
    expect(group.getAttribute("aria-expanded")).toBe("true");
    expect(group.querySelector(":scope > .fast-pr-tree-row > .fast-pr-tree-count")!.textContent).toBe("2");
    expect(group.querySelector(":scope > .fast-pr-tree-row > .fast-pr-tree-count svg")).not.toBeNull();
    const single = ul.querySelectorAll<HTMLElement>('[data-kind="group"]')[1];
    expect(single.textContent).toContain("Ungrouped");
    expect(single.querySelector(":scope > .fast-pr-tree-row > .fast-pr-tree-count")).toBeNull();
    expect(single.querySelector(":scope > .fast-pr-tree-row > .fast-pr-tree-lines")).toBeNull();
    const dir = ul.querySelector<HTMLElement>('[data-kind="dir"]')!;
    const dirPath = () => dir.querySelector(":scope > .fast-pr-tree-row > .fast-pr-tree-icon path")!.getAttribute("d")!;
    expect(dirPath().startsWith("M.513")).toBe(true);
    (dir.querySelector(".fast-pr-tree-row") as HTMLElement).click();
    expect(dir.getAttribute("aria-expanded")).toBe("false");
    expect(chevPath(dir).startsWith(CHEV_RIGHT)).toBe(true);
    expect(dirPath().startsWith("M1.75 1A1.75")).toBe(true);
    const file = ul.querySelector<HTMLElement>('[data-kind="file"]')!;
    const spacer = file.querySelector(":scope > .fast-pr-tree-row > .fast-pr-tree-chev")!;
    expect(spacer.children).toHaveLength(0);
    expect(file.querySelector(".fast-pr-tree-icon path")!.getAttribute("d")!.startsWith("M2 1.75C2")).toBe(true);
  });

  it("shows +added -deleted on files, summed for folders and groups", () => {
    const files = [
      { ...FILES[0], linesAdded: 10, linesDeleted: 2 },
      { ...FILES[1], linesAdded: 1200, linesDeleted: 0 },
    ];
    const ul = renderTree(buildGroupTree(toOrdered(files)), () => {});
    const lines = (sel: string) =>
      [...ul.querySelector(`${sel} > .fast-pr-tree-row > .fast-pr-tree-lines`)!.children].map((c) => c.textContent);
    expect(lines('[data-path="src/a/x.ts"]')).toEqual(["+10", "-2"]);
    expect(lines('[data-path="src/a/y.ts"]')).toEqual(["+1,200"]);
    expect(lines('[data-kind="dir"]')).toEqual(["+1,210", "-2"]);
    expect(lines('[data-kind="group"]')).toEqual(["+1,210", "-2"]);
  });

  it("adds one indent-line cell per ancestor level", () => {
    const ul = renderTree(buildGroupTree(toOrdered(FILES)), () => {});
    const lines = (sel: string) =>
      ul.querySelector(sel)!.querySelectorAll(":scope > .fast-pr-tree-row .fast-pr-tree-line").length;
    expect(lines('[data-kind="group"]')).toBe(0);
    expect(lines('[data-kind="dir"]')).toBe(1); // src/a under its group
    expect(lines('[data-path="src/a/x.ts"]')).toBe(2);
  });

  it("file icons follow changeType, like GitHub's tree", () => {
    const files = [
      { ...FILES[2], path: "a.md", changeType: "ADDED" },
      { ...FILES[2], path: "b.md", changeType: "MODIFIED" },
      { ...FILES[2], path: "c.md", changeType: "RENAMED" },
      { ...FILES[2], path: "d.md", changeType: "REMOVED" },
      { ...FILES[2], path: "e.md", changeType: "SOMETHING_NEW" },
    ];
    const ul = renderTree(buildGroupTree(toOrdered(files)), () => {});
    const icons = [...ul.querySelectorAll<HTMLElement>('[data-kind="file"] .fast-pr-tree-icon')];
    expect(icons.map((i) => i.className.replace("fast-pr-tree-icon", "").trim())).toEqual([
      "fast-pr-ct-added",
      "fast-pr-ct-modified",
      "fast-pr-ct-moved",
      "fast-pr-ct-removed",
      "",
    ]);
    expect(icons[4].querySelector("path")!.getAttribute("d")!.startsWith("M2 1.75C2")).toBe(true);
  });

  it("click toggles groups and selects files", () => {
    const picked: string[] = [];
    const ul = renderTree(buildGroupTree(toOrdered(FILES)), (d) => picked.push(d));
    document.body.append(ul);
    const g = ul.querySelector<HTMLElement>('[data-kind="group"]')!;
    (g.querySelector(".fast-pr-tree-row") as HTMLElement).click();
    expect(g.getAttribute("aria-expanded")).toBe("false");
    expect(chevPath(g).startsWith(CHEV_RIGHT)).toBe(true);
    (g.querySelector(".fast-pr-tree-row") as HTMLElement).click();
    expect(g.getAttribute("aria-expanded")).toBe("true");
    expect(chevPath(g).startsWith(CHEV_DOWN)).toBe(true);
    (ul.querySelector('[data-kind="file"] .fast-pr-tree-row') as HTMLElement).click();
    expect(picked).toEqual(["dg_src_a_x_ts"]);
  });

  it("keyboard: arrows, expand/collapse, enter", () => {
    const picked: string[] = [];
    const ul = renderTree(buildGroupTree(toOrdered(FILES)), (d) => picked.push(d));
    document.body.append(ul);
    const first = ul.querySelector<HTMLElement>("li")!; // Src group
    first.focus();
    key(first, "ArrowDown"); // dir src/a
    const dir = document.activeElement as HTMLElement;
    expect(dir.dataset.kind).toBe("dir");
    key(dir, "ArrowDown");
    const file = document.activeElement as HTMLElement;
    expect(file.dataset.kind).toBe("file");
    key(file, "Enter");
    expect(picked).toEqual(["dg_src_a_x_ts"]);
    key(file, "ArrowLeft"); // to parent dir
    expect(document.activeElement).toBe(dir);
    key(dir, "ArrowLeft"); // collapse
    expect(dir.getAttribute("aria-expanded")).toBe("false");
    key(dir, "ArrowDown"); // skips hidden children -> next group
    expect((document.activeElement as HTMLElement).dataset.kind).toBe("group");
    expect(document.activeElement!.textContent).toContain("Ungrouped");
    key(dir, "ArrowRight");
    expect(dir.getAttribute("aria-expanded")).toBe("true");
    key(dir, "ArrowRight"); // into first child
    expect((document.activeElement as HTMLElement).dataset.kind).toBe("file");
    key(document.activeElement!, "ArrowUp");
    expect(document.activeElement).toBe(dir);
  });
});

function nativeTree() {
  document.body.innerHTML = `<div id="pane"><div id="scroll"><ul role="tree" aria-label="File Tree"><li role="treeitem">x</li></ul></div></div>`;
}

describe("mountTreePanel", () => {
  it("inserts panel before native container, hides native in grouped mode, toggles + persists", () => {
    nativeTree();
    const m = mountTreePanel(result());
    const scroll = document.getElementById("scroll")!;
    const panel = document.querySelector<HTMLElement>(".fast-pr-tree-panel")!;
    expect(panel.nextElementSibling).toBe(scroll);
    expect(scroll.classList.contains("fast-pr-hidden")).toBe(true);
    const btn = panel.querySelector<HTMLButtonElement>(".fast-pr-tree-toggle")!;
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    btn.click();
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(scroll.classList.contains("fast-pr-hidden")).toBe(false);
    expect(panel.querySelector<HTMLElement>("ul.fast-pr-tree")!.hidden).toBe(true);
    expect(localStorage.getItem("fast-pr:tree-mode")).toBe("original");
    m.destroy();
    expect(document.querySelector(".fast-pr-tree-panel")).toBeNull();
    expect(scroll.classList.contains("fast-pr-hidden")).toBe(false);
  });

  it("puts the toggle after GitHub's filter button when the filter row exists", () => {
    nativeTree();
    document.body.insertAdjacentHTML("afterbegin", `<div id="diff-file-tree-filter"><input><div><button>f</button></div></div>`);
    const m = mountTreePanel(result());
    const row = document.getElementById("diff-file-tree-filter")!;
    expect(row.lastElementChild!.classList.contains("fast-pr-tree-toggle")).toBe(true);
    expect(document.querySelector(".fast-pr-tree-toolbar")!.children).toHaveLength(0);
    m.destroy();
    expect(row.querySelector(".fast-pr-tree-toggle")).toBeNull();
  });

  it("copies comment counts and the current file from GitHub's tree", () => {
    nativeTree();
    document.querySelector('ul[aria-label="File Tree"]')!.innerHTML = `
      <li role="treeitem" id="src/a/x.ts" aria-current="true"><svg class="octicon-comment"></svg><div>4</div></li>
      <li role="treeitem" id="README.md"></li>`;
    const m = mountTreePanel(result());
    const ours = (p: string) => document.querySelector<HTMLElement>(`.fast-pr-tree li[data-path="${p}"]`)!;
    expect(ours("src/a/x.ts").getAttribute("aria-current")).toBe("true");
    expect(ours("src/a/x.ts").querySelector(".fast-pr-tree-comments")!.textContent).toBe("4");
    expect(ours("README.md").hasAttribute("aria-current")).toBe(false);
    expect(ours("README.md").querySelector(".fast-pr-tree-comments")).toBeNull();
    m.destroy();
  });

  it("starts in original mode when stored", () => {
    localStorage.setItem("fast-pr:tree-mode", "original");
    nativeTree();
    const m = mountTreePanel(result());
    expect(document.getElementById("scroll")!.classList.contains("fast-pr-hidden")).toBe(false);
    expect(document.querySelector<HTMLElement>("ul.fast-pr-tree")!.hidden).toBe(true);
    m.destroy();
  });

  it("file click sets location.hash", () => {
    nativeTree();
    const m = mountTreePanel(result());
    (document.querySelector('[data-kind="file"] .fast-pr-tree-row') as HTMLElement).click();
    expect(location.hash).toBe("#diff-dg_src_a_x_ts");
    m.destroy();
  });

  it("re-attaches when the pane is replaced, and never duplicates", async () => {
    nativeTree();
    const m = mountTreePanel(result());
    nativeTree(); // React replaced everything
    await new Promise((r) => setTimeout(r, 120));
    expect(document.querySelectorAll(".fast-pr-tree-panel")).toHaveLength(1);
    expect(document.querySelector(".fast-pr-tree-panel")!.nextElementSibling!.id).toBe("scroll");
    m.destroy();
  });
});
