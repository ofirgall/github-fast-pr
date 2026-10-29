// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { decorateRows, groupStarts, mountDecorations } from "../../src/content/decorations";
import type { FastPrFile } from "../../src/shared/types";

const f = (digest: string, group: string | null, idx: number | null, auto = false): FastPrFile => ({
  path: digest, pathDigest: digest, linesAdded: 1, linesDeleted: 0, group, groupIndex: idx,
  autoViewed: auto, originalViewed: false, markedByHook: false, skippedUnviewed: false,
});
const FILES = [f("a", "Src", 0), f("b", "Src", 0), f("c", null, null), f("d", "Gen", 1, true), f("e", "Gen", 1, true)];

function row(i: number, digest: string) {
  return `<div data-index="${i}" data-path-digest="${digest}"><div id="diff-${digest}"><div data-diff-header-wrapper><h3><a><code>${digest}</code></a></h3><button aria-pressed="false"></button></div></div></div>`;
}
beforeEach(() => {
  document.body.innerHTML = `<div data-testid="virtualized-diffs-list">${["a", "b", "c", "d", "e"].map((d, i) => row(i, d)).join("")}</div>`;
});

describe("decorations", () => {
  it("computes group starts", () => {
    expect([...groupStarts(FILES)]).toEqual(["a", "c", "d"]);
  });
  it("labels group starts as first child, hints auto files, idempotent", () => {
    const starts = groupStarts(FILES);
    decorateRows(document, FILES, starts);
    decorateRows(document, FILES, starts);
    const labels = [...document.querySelectorAll(".fast-pr-group-label")];
    expect(labels.map((l) => l.textContent)).toEqual(["Src", "Ungrouped", "Genauto-viewed"]);
    for (const l of labels) expect(l.parentElement!.firstElementChild).toBe(l);
    const hints = [...document.querySelectorAll(".fast-pr-auto-hint")];
    expect(hints.map((h) => h.textContent)).toEqual(["Auto-viewed: Gen", "Auto-viewed: Gen"]);
    expect(hints[0].previousElementSibling!.tagName).toBe("H3");
  });
  it("removes stale label when a row is recycled to another digest", () => {
    const starts = groupStarts(FILES);
    decorateRows(document, FILES, starts);
    const r = document.querySelector<HTMLElement>('[data-path-digest="a"]')!;
    r.setAttribute("data-path-digest", "b");
    decorateRows(document, FILES, starts);
    expect(r.querySelector(".fast-pr-group-label")).toBeNull();
  });
  it("ignores unknown digests", () => {
    document.body.innerHTML = `<div data-testid="virtualized-diffs-list">${row(0, "zzz")}</div>`;
    decorateRows(document, FILES, groupStarts(FILES));
    expect(document.querySelector("[data-fast-pr-ui]")).toBeNull();
  });
});

describe("mountDecorations observer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.setAttribute("data-fast-pr", "{}");
    document.body.innerHTML = '<div data-testid="virtualized-diffs-list"></div>';
  });
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.removeAttribute("data-fast-pr");
  });
  const result = () => ({ files: FILES }) as unknown as import("../../src/shared/types").FastPrResult;

  it("decorates rows added after mount even when <html> carries data-fast-pr", async () => {
    const m = mountDecorations(result());
    const list = document.querySelector("[data-testid=virtualized-diffs-list]")!;
    list.insertAdjacentHTML("beforeend", ["a", "d"].map((d, i) => row(i, d)).join(""));
    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelectorAll(".fast-pr-group-label")).toHaveLength(2);
    expect(document.querySelectorAll(".fast-pr-auto-hint")).toHaveLength(1);
    m.destroy();
  });

  it("still decorates under continuous mutations (no starvation)", async () => {
    const m = mountDecorations(result());
    const list = document.querySelector("[data-testid=virtualized-diffs-list]")!;
    list.insertAdjacentHTML("beforeend", row(0, "a"));
    const noise = document.createElement("span");
    document.body.append(noise);
    let n = 0;
    const iv = setInterval(() => noise.setAttribute("data-path-digest", String(n++)), 10);
    await vi.advanceTimersByTimeAsync(300);
    clearInterval(iv);
    expect(document.querySelectorAll(".fast-pr-group-label").length).toBe(1);
    m.destroy();
  });
});
