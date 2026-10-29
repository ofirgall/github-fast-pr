import { describe, it, expect, vi } from "vitest";
import { sendFileReviews, type SenderDeps } from "../../src/content/sender";

const id = { owner: "o", repo: "r", number: 3, headSha: "s", baseBranch: "main" };

function mk(status: (p: string) => number | Error) {
  let active = 0, maxActive = 0;
  const calls: { url: string; init: RequestInit }[] = [];
  const record = vi.fn();
  const logError = vi.fn();
  const deps: SenderDeps = {
    fetch: async (url, init) => {
      calls.push({ url, init });
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      const path = JSON.parse(init.body as string).path;
      const s = status(path);
      if (s instanceof Error) throw s;
      return { ok: s < 300, status: s };
    },
    record, logError, sent: new Set(),
  };
  return { deps, calls, record, logError, max: () => maxActive };
}

describe("sendFileReviews", () => {
  it("posts with right shape, concurrency <= 4, records successes", async () => {
    const t = mk(() => 200);
    const paths = Array.from({ length: 10 }, (_, i) => `f${i}`);
    await sendFileReviews(id, paths, t.deps);
    expect(t.calls).toHaveLength(10);
    expect(t.max()).toBeLessThanOrEqual(4);
    expect(t.max()).toBeGreaterThan(1);
    expect(t.calls[0].url).toBe("/o/r/pull/3/file_review");
    expect(t.calls[0].init.method).toBe("POST");
    expect(JSON.parse(t.calls[0].init.body as string)).toEqual({ path: "f0", viewed: "viewed" });
    expect((t.calls[0].init.headers as any)["GitHub-Verified-Fetch"]).toBe("true");
    expect(t.record).toHaveBeenCalledTimes(10);
    expect(t.logError).not.toHaveBeenCalled();
  });
  it("logs failures and does not record them", async () => {
    const t = mk((p) => (p === "bad" ? 422 : p === "net" ? new Error("down") : 200));
    await sendFileReviews(id, ["ok", "bad", "net"], t.deps);
    expect(t.record.mock.calls.map((c) => c[0])).toEqual(["ok"]);
    expect(t.logError).toHaveBeenCalledWith("[fast-pr] failed to mark viewed: bad (422)");
    expect(t.logError).toHaveBeenCalledWith("[fast-pr] failed to mark viewed: net (down)");
  });
  it("sends each (head, path) once per session", async () => {
    const t = mk(() => 200);
    await sendFileReviews(id, ["a", "a", "b"], t.deps);
    await sendFileReviews(id, ["a", "b", "c"], t.deps);
    expect(t.calls).toHaveLength(3);
    await sendFileReviews({ ...id, headSha: "s2" }, ["a"], t.deps);
    expect(t.calls).toHaveLength(4);
  });
  it("handles empty input", async () => {
    const t = mk(() => 200);
    await sendFileReviews(id, [], t.deps);
    expect(t.calls).toHaveLength(0);
  });
});
