// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { applyToGitHub } from "../../src/content/github-viewed";
import { APPLY_VIEWED_DONE_EVENT, APPLY_VIEWED_EVENT } from "../../src/shared/types";

describe("applyToGitHub", () => {
  it("sends the request and reads the MAIN world's synchronous answer", () => {
    const got: unknown[] = [];
    const hook = (e: Event) => {
      got.push(JSON.parse(String((e as CustomEvent).detail)));
      document.dispatchEvent(new CustomEvent(APPLY_VIEWED_DONE_EVENT, { detail: "1" }));
    };
    document.addEventListener(APPLY_VIEWED_EVENT, hook);
    expect(applyToGitHub(["a"], true)).toBe(true);
    expect(got).toEqual([{ paths: ["a"], viewed: true }]);
    document.removeEventListener(APPLY_VIEWED_EVENT, hook);
  });

  it("is false when nothing answers or the store was missing", () => {
    expect(applyToGitHub(["a"], false)).toBe(false);
    const hook = () => document.dispatchEvent(new CustomEvent(APPLY_VIEWED_DONE_EVENT, { detail: "0" }));
    document.addEventListener(APPLY_VIEWED_EVENT, hook);
    expect(applyToGitHub(["a"], false)).toBe(false);
    document.removeEventListener(APPLY_VIEWED_EVENT, hook);
  });
});
