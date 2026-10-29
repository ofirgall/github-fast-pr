// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { adjustedProgress, findViewedProgress, mountViewedProgress } from "../../src/content/viewed-ui";
import { createViewedState } from "../../src/content/viewed-state";
import { VIEWED_EVENT, type FastPrFile, type FastPrResult } from "../../src/shared/types";

const f = (path: string, auto: boolean, viewed = false, marked = false): FastPrFile => ({
  path, pathDigest: path, linesAdded: 1, linesDeleted: 0, changeType: null,
  group: auto ? "Gen" : null, groupIndex: auto ? 0 : null, autoViewed: auto,
  originalViewed: viewed, markedByHook: marked, skippedUnviewed: false,
});
// 4 files: 2 to review, 2 auto (one already viewed, one marked by the hook).
const result = (): FastPrResult => ({
  v: 1, routeKey: "pullRequestsChangesRoute",
  identity: { owner: "o", repo: "r", number: 1, headSha: "s", baseBranch: "main" },
  fullDiff: true, configStatus: "ok", appliedHash: "h", devConfig: false,
  files: [f("a", false), f("b", false, true), f("g1", true, true), f("g2", true, false, true)],
});
const native = (viewed: number, total: number) =>
  `<div id="nat" class="d-flex gh-cls"><svg></svg><span aria-hidden="true">${viewed} / ${total} viewed</span>` +
  `<span class="sr-only">${viewed} of ${total} files viewed</span></div>`;

const initial = (p: string) => ["b", "g1", "g2"].includes(p);
const toggle = (path: string, viewed: boolean, number = 1) =>
  document.dispatchEvent(new CustomEvent(VIEWED_EVENT, { detail: JSON.stringify({ owner: "o", repo: "r", number, path, viewed }) }));

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("viewed progress", () => {
  it("finds GitHub's block by its screen-reader text", () => {
    document.body.innerHTML = native(3, 4);
    expect(findViewedProgress(document)).toMatchObject({ viewed: 3, total: 4 });
  });

  it("subtracts auto-viewed files", () => {
    expect(adjustedProgress(result(), { viewed: 3, total: 4 }, initial)).toEqual({ viewed: 1, total: 2 });
    expect(adjustedProgress(result(), { viewed: 0, total: 4 }, initial)).toEqual({ viewed: 0, total: 2 });
    expect(adjustedProgress(result(), { viewed: 9, total: 4 }, initial)).toEqual({ viewed: 2, total: 2 });
  });

  it("subtracts only auto files that are viewed now", () => {
    expect(adjustedProgress(result(), { viewed: 2, total: 4 }, (p) => p === "b" || p === "g1")).toEqual({ viewed: 1, total: 2 });
  });

  it("follows GitHub's Viewed toggles for this PR", () => {
    const v = createViewedState(result());
    let calls = 0;
    v.subscribe(() => calls++);
    expect(["a", "b", "g1", "g2"].map(v.has)).toEqual([false, true, true, true]);
    toggle("a", true);
    toggle("g1", false);
    toggle("a", true); // no change
    toggle("b", false, 2); // another PR
    toggle("zzz", true); // not in this PR
    expect(["a", "b", "g1", "g2"].map(v.has)).toEqual([true, true, false, true]);
    expect(calls).toBe(2);
    v.destroy();
    toggle("a", false);
    expect(v.has("a")).toBe(true);
  });

  it("replaces GitHub's block, follows its updates, restores on destroy", async () => {
    document.body.innerHTML = native(3, 4);
    const m = mountViewedProgress(result(), createViewedState(result()));
    const nat = document.getElementById("nat")!;
    const ours = () => document.querySelector<HTMLElement>(".fast-pr-viewed")!;
    expect(nat.classList.contains("fast-pr-native-hidden")).toBe(true);
    expect(ours().classList.contains("gh-cls")).toBe(true);
    expect(ours().querySelector(".fast-pr-viewed-text")!.textContent).toBe("1 / 2 viewed(3 / 4)");
    expect(ours().querySelector(".fast-pr-viewed-orig")!.textContent).toBe("(3 / 4)");
    expect(ours().querySelector<HTMLElement>(".fast-pr-viewed-orig")!.dataset.tip).toBe(
      "All files: 3 of 4 viewed, including 2 auto-viewed",
    );
    nat.querySelector(".sr-only")!.textContent = "4 of 4 files viewed";
    await new Promise((r) => setTimeout(r, 80));
    expect(ours().querySelector(".fast-pr-viewed-text")!.textContent).toBe("2 / 2 viewed(4 / 4)");
    m.destroy();
    expect(document.querySelector(".fast-pr-viewed")).toBeNull();
    expect(nat.classList.contains("fast-pr-native-hidden")).toBe(false);
  });

  it("leaves GitHub's block alone when it counts different files", () => {
    document.body.innerHTML = native(1, 9);
    const m = mountViewedProgress(result(), createViewedState(result()));
    expect(document.querySelector(".fast-pr-viewed")).toBeNull();
    m.destroy();
  });
});
