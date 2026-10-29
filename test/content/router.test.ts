import { describe, it, expect } from "vitest";
import { classifyPath } from "../../src/content/router";

describe("classifyPath", () => {
  it.each([
    ["/o/r/pull/12", "conversation"],
    ["/o/r/pull/12/", "conversation"],
    ["/o/r/pull/12/changes", "changes"],
    ["/o/r/pull/12/changes/", "changes"],
    ["/o/r/pull/12/changes/abc123", "changes"],
    ["/o/r/pull/12/changes/abc..def", "changes"],
    ["/o/r/pull/12/commits", "none"],
    ["/o/r/pull/12/files", "none"],
    ["/o/r/pulls", "none"],
    ["/o/r/pull/x", "none"],
    ["/o/r/issues/1", "none"],
    ["/", "none"],
  ])("%s -> %s", (p, kind) => {
    expect(classifyPath(p).kind).toBe(kind);
  });
  it("extracts identity", () => {
    expect(classifyPath("/a/b/pull/7/changes")).toEqual({ kind: "changes", owner: "a", repo: "b", number: 7 });
  });
});
