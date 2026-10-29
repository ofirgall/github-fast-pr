import { describe, it, expect } from "vitest";
import { findChangesRoute, prIdentity, isFullDiff, type ChangesRoute } from "../src/core/route";
import { routePayload, summary, HEAD } from "./fixtures/route";

describe("findChangesRoute", () => {
  it("finds the full route", () => {
    const r = findChangesRoute(routePayload([summary("a.md")]));
    expect(r?.key).toBe("pullRequestsChangesRoute");
    expect(r?.route.diffSummaries).toHaveLength(1);
  });
  it("finds the range route", () => {
    expect(findChangesRoute(routePayload([summary("a")], { range: true }))?.key).toBe("pullRequestsChangesWithRangeRoute");
  });
  it("accepts an empty diffSummaries array", () => {
    expect(findChangesRoute(routePayload([]))).not.toBeNull();
  });
  it("rejects wrong shapes", () => {
    const bad = (patch: Record<string, unknown>) => findChangesRoute(routePayload([summary("a", patch)]));
    expect(bad({ path: 1 })).toBeNull();
    expect(bad({ pathDigest: undefined })).toBeNull();
    expect(bad({ linesAdded: "1" })).toBeNull();
    expect(bad({ linesDeleted: null })).toBeNull();
    expect(bad({ markedAsViewed: "no" })).toBeNull();
    expect(findChangesRoute(routePayload([summary("a")], { key: "otherRoute" }))).toBeNull();
    expect(findChangesRoute({ payload: { pullRequestsChangesRoute: { diffSummaries: {} } } })).toBeNull();
  });
  it("never throws on garbage", () => {
    for (const g of [null, undefined, "str", 5, [], {}, { payload: null }, { payload: "x" }, { payload: [] }, { payload: { pullRequestsChangesRoute: null } }, { payload: { pullRequestsChangesRoute: { diffSummaries: [null] } } }]) {
      expect(findChangesRoute(g)).toBeNull();
    }
    const evil = { get payload(): never { throw new Error("boom"); } };
    expect(findChangesRoute(evil)).toBeNull();
  });
});

const route = (o = {}) => findChangesRoute(routePayload([summary("a")], o))!.route;

describe("prIdentity", () => {
  it("reads identity", () => {
    expect(prIdentity(route())).toEqual({ owner: "acme", repo: "widgets", number: 42, headSha: HEAD, baseBranch: "main" });
  });
  it("returns null when something is missing", () => {
    for (const k of ["repository", "pullRequest", "comparison"]) {
      const r = route() as ChangesRoute;
      delete r[k];
      expect(prIdentity(r)).toBeNull();
    }
    const r2 = route() as any;
    r2.pullRequest.number = "42";
    expect(prIdentity(r2)).toBeNull();
    const r3 = route() as any;
    delete r3.comparison.fullDiff;
    expect(prIdentity(r3)).toBeNull();
    const r4 = route() as any;
    r4.repository.ownerLogin = undefined;
    expect(prIdentity(r4)).toBeNull();
  });
});

describe("isFullDiff", () => {
  it("true for FULL", () => expect(isFullDiff(route())).toBe(true));
  it("false for COMMIT range", () => expect(isFullDiff(route({ range: true }))).toBe(false));
  it("false when FULL but selectedRange set", () => {
    const r = route() as any;
    r.comparison.selectedRange = { baseOid: "x", headOid: "y" };
    expect(isFullDiff(r)).toBe(false);
  });
  it("false for garbage", () => {
    const r = route() as any;
    r.comparison = "nope";
    expect(isFullDiff(r)).toBe(false);
    delete r.comparison;
    expect(isFullDiff(r)).toBe(false);
    r.comparison = { viewing: "WEIRD", selectedRange: null };
    expect(isFullDiff(r)).toBe(false);
    expect(isFullDiff(null as any)).toBe(false);
  });
});
