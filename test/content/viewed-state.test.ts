// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createViewedState } from "../../src/content/viewed-state";
import type { FastPrFile, FastPrResult } from "../../src/shared/types";

const f = (path: string, viewed = false): FastPrFile => ({
  path, pathDigest: path, linesAdded: 1, linesDeleted: 0, changeType: null,
  group: null, groupIndex: null, autoViewed: false,
  originalViewed: viewed, markedByHook: false, skippedUnviewed: false,
});
const result = (): FastPrResult => ({
  v: 1, routeKey: "pullRequestsChangesRoute",
  identity: { owner: "o", repo: "r", number: 1, headSha: "s", baseBranch: "main" },
  fullDiff: true, configStatus: "ok", appliedHash: "h", devConfig: false,
  files: [f("a"), f("b", true)],
});

describe("viewed state set", () => {
  it("applies local changes and notifies subscribers", () => {
    const v = createViewedState(result());
    const fn = vi.fn();
    v.subscribe(fn);
    v.set("a", true);
    expect(v.has("a")).toBe(true);
    v.set("b", false);
    expect(v.has("b")).toBe(false);
    expect(fn).toHaveBeenCalledTimes(2);
    v.destroy();
  });

  it("ignores unknown paths and repeated values", () => {
    const v = createViewedState(result());
    const fn = vi.fn();
    v.subscribe(fn);
    v.set("nope", true);
    v.set("b", true);
    expect(v.has("nope")).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    v.destroy();
  });
});
