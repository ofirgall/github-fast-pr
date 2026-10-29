import { describe, it, expect, vi } from "vitest";
import { applyViewedToStore, findPrStore, type PrStoreState } from "../../src/hook/store";

function fakeStore(viewed: Record<string, boolean>) {
  const state = {
    summariesViewedStatus: { ...viewed },
    diffSummariesActions: { setDiffViewed: vi.fn((p: string, v: boolean) => (state.summariesViewedStatus[p] = v)) },
    filesCollapsedStatusActions: { updateFileCollapsedStatus: vi.fn() },
  } satisfies PrStoreState;
  return { getState: () => state, state };
}

/** A React-like fiber chain: start element -> component -> provider (with the store in a hook). */
function fiberChain(store: unknown) {
  const provider = { memoizedState: { memoizedState: 1, next: { memoizedState: store, next: null } }, return: null };
  const component = { memoizedState: null, return: provider };
  const el = { __reactFiber$abc: { memoizedState: null, return: component } };
  return el as unknown as Element;
}

describe("findPrStore", () => {
  it("walks the fiber chain up to the store that has diffSummariesActions", () => {
    const s = fakeStore({});
    expect(findPrStore(fiberChain(s))).toBe(s);
  });
  it("is null without a fiber or a matching store", () => {
    expect(findPrStore({} as Element)).toBeNull();
    expect(findPrStore(fiberChain({ getState: () => ({}) }))).toBeNull();
  });
});

describe("applyViewedToStore", () => {
  it("sets viewed and collapsed only for files whose status differs", () => {
    const s = fakeStore({ a: false, b: true });
    expect(applyViewedToStore(s, ["a", "b", "unknown"], true)).toBe(1);
    expect(s.state.diffSummariesActions.setDiffViewed.mock.calls).toEqual([["a", true]]);
    expect(s.state.filesCollapsedStatusActions.updateFileCollapsedStatus.mock.calls).toEqual([["a", true]]);
    expect(applyViewedToStore(s, ["a", "b"], false)).toBe(2);
    expect(s.state.summariesViewedStatus).toEqual({ a: false, b: false });
  });
});
