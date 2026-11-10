// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  classicSummaries,
  headerCounts,
  isClassicFilesDoc,
  parseClassicPage,
  parseToc,
  viewedOnPage,
} from "../../src/content/classic";
import { decorateClassic, reorderEntries } from "../../src/content/classic-page";
import { groupStarts } from "../../src/content/decorations";
import type { FastPrFile } from "../../src/shared/types";

const PAGE = { kind: "files" as const, owner: "o", repo: "r", number: 7 };
const HEAD = "9b046a911274bc7919a805c21b13efdd8fcccacb";
const d = (c: string) => c.repeat(64);

const treeItem = (digest: string, path: string, type: string) =>
  `<li id="file-tree-item-diff-${digest}" data-tree-entry-type="file"><span data-filterable-item-text hidden>${path}</span>` +
  `<a href="#diff-${digest}"><span>${path.split("/").pop()}</span><svg title="${type}"></svg></a></li>`;

const fileDiv = (digest: string, path: string, opts: { added?: number; deleted?: number; viewed?: boolean } = {}) =>
  `<copilot-diff-entry data-file-path="${path}"><div id="diff-${digest}" class="file js-file" data-tagsearch-path="${path}">` +
  `<div class="file-header"><div class="file-info"><span class="sr-only">${(opts.added ?? 0) + (opts.deleted ?? 0)} changes: ${opts.added ?? 0} additions &amp; ${opts.deleted ?? 0} deletions</span>` +
  `<a class="Link--primary">${path}</a></div>` +
  `<form><input type="checkbox" class="js-reviewed-checkbox" ${opts.viewed ? "checked" : ""}></form></div></div></copilot-diff-entry>`;

function classicDoc(files: string): string {
  return (
    `<input type="hidden" name="head_sha" value="${HEAD}"><span class="commit-ref base-ref">main</span>` +
    `<details-menu src="/o/r/pull/7/show_toc?base_sha=a&sha1=a&sha2=${HEAD}"></details-menu>` +
    `<file-tree><ul>${treeItem(d("a"), "src/a.ts", "modified")}${treeItem(d("b"), "gen/b.ts", "added")}${treeItem(d("c"), "docs/c.md", "removed")}</ul></file-tree>` +
    `<div id="files" class="js-diff-container"><div class="js-diff-progressive-container">${files}</div><div class="js-diff-progressive-container"></div></div>`
  );
}

const TOC = `<a href="#diff-${d("a")}" class="select-menu-item js-jump-to-menu-item"><svg title="modified"></svg><span class="diffstat"><span class="color-fg-success">+1,200</span><span class="color-fg-danger">−10</span></span></a>
<a href="#diff-${d("b")}" class="select-menu-item js-jump-to-menu-item"><svg title="added"></svg><span class="diffstat"><span class="color-fg-success">+30</span><span class="color-fg-danger">−0</span></span></a>`;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("classic files page", () => {
  it("reads identity and the file list from the tree", () => {
    document.body.innerHTML = classicDoc("");
    expect(isClassicFilesDoc(document)).toBe(true);
    const p = parseClassicPage(document, PAGE)!;
    expect(p.identity).toEqual({ owner: "o", repo: "r", number: 7, headSha: HEAD, baseBranch: "main" });
    expect(p.tocUrl).toBe(`/o/r/pull/7/show_toc?base_sha=a&sha1=a&sha2=${HEAD}`);
    expect(p.files).toEqual([
      { path: "src/a.ts", pathDigest: d("a"), changeType: "MODIFIED" },
      { path: "gen/b.ts", pathDigest: d("b"), changeType: "ADDED" },
      { path: "docs/c.md", pathDigest: d("c"), changeType: "REMOVED" },
    ]);
  });

  it("is not the React view", () => {
    document.body.innerHTML = `<div data-testid="virtualized-diffs-list"></div>`;
    expect(isClassicFilesDoc(document)).toBe(false);
    expect(parseClassicPage(document, PAGE)).toBeNull();
  });

  it("falls back to the loaded diffs without a tree", () => {
    document.body.innerHTML = classicDoc(fileDiv(d("a"), "src/a.ts")).replace(/<file-tree>.*<\/file-tree>/, "");
    expect(parseClassicPage(document, PAGE)!.files).toEqual([{ path: "src/a.ts", pathDigest: d("a"), changeType: null }]);
  });

  it("combines jump-menu counts, header counts and viewed state", () => {
    document.body.innerHTML = classicDoc(fileDiv(d("c"), "docs/c.md", { deleted: 7, viewed: true }) + fileDiv(d("a"), "src/a.ts", { added: 1 }));
    const toc = parseToc(new DOMParser().parseFromString(TOC, "text/html"));
    expect(toc.get(d("a"))).toEqual({ added: 1200, deleted: 10, changeType: "MODIFIED" });
    const s = classicSummaries(parseClassicPage(document, PAGE)!, toc, headerCounts(document), viewedOnPage(document));
    expect(s.map((x) => [x.path, x.linesAdded, x.linesDeleted, x.markedAsViewed])).toEqual([
      ["src/a.ts", 1200, 10, false],
      ["gen/b.ts", 30, 0, false],
      ["docs/c.md", 0, 7, true],
    ]);
  });
});

const ff = (path: string, digest: string, group: string | null, idx: number | null, auto = false): FastPrFile => ({
  path, pathDigest: digest, linesAdded: 1, linesDeleted: 0, changeType: null,
  group, groupIndex: idx, autoViewed: auto, originalViewed: false, markedByHook: false, skippedUnviewed: false,
});

describe("classic reorder and labels", () => {
  const files = [ff("src/a.ts", d("a"), "Src", 0), ff("docs/c.md", d("c"), null, null), ff("gen/b.ts", d("b"), "Gen", 1, true)];
  const order = new Map(files.map((f, i) => [f.pathDigest, i]));
  const paths = () => [...document.querySelectorAll<HTMLElement>("div.file")].map((f) => f.dataset.tagsearchPath);

  it("moves diffs into group order, including later batches", () => {
    document.body.innerHTML = classicDoc(fileDiv(d("b"), "gen/b.ts") + fileDiv(d("a"), "src/a.ts"));
    // A later batch lands in GitHub's next progressive container.
    document.querySelectorAll(".js-diff-progressive-container")[1].innerHTML = fileDiv(d("c"), "docs/c.md");
    const a = document.querySelector("copilot-diff-entry[data-file-path='src/a.ts']");
    reorderEntries(document, order);
    expect(paths()).toEqual(["src/a.ts", "docs/c.md", "gen/b.ts"]);
    const first = document.querySelector(".js-diff-progressive-container")!;
    expect(first.querySelectorAll("div.file").length).toBe(3);
    expect(document.querySelector("copilot-diff-entry[data-file-path='src/a.ts']")).toBe(a);
    // Stable once in order.
    const before = [...first.children];
    reorderEntries(document, order);
    expect([...first.children]).toEqual(before);
  });

  it("labels each group's first diff and hints auto-viewed ones", () => {
    document.body.innerHTML = classicDoc(fileDiv(d("a"), "src/a.ts") + fileDiv(d("c"), "docs/c.md") + fileDiv(d("b"), "gen/b.ts"));
    const starts = groupStarts(files);
    decorateClassic(document, files, starts);
    decorateClassic(document, files, starts);
    const labels = [...document.querySelectorAll(".fast-pr-group-label")];
    expect(labels.map((l) => l.textContent)).toEqual(["Src", "Ungrouped", "Genauto-viewed"]);
    expect(labels[0].nextElementSibling?.getAttribute("data-file-path")).toBe("src/a.ts");
    expect([...document.querySelectorAll(".fast-pr-auto-hint")].map((h) => h.textContent)).toEqual(["Auto-viewed: Gen"]);
    // A label left behind by a move is dropped.
    const entryB = document.querySelector("copilot-diff-entry[data-file-path='gen/b.ts']")!;
    entryB.parentElement!.prepend(entryB);
    decorateClassic(document, files, starts);
    expect(document.querySelectorAll(".fast-pr-group-label").length).toBe(3);
    expect(entryB.previousElementSibling?.textContent).toBe("Genauto-viewed");
  });
});
