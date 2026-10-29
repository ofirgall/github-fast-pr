import { describe, it, expect, vi } from "vitest";
import { resolveConfig, shouldReload, reloadGuardKey, type LoaderDeps } from "../../src/content/loader";
import type { CachedConfig } from "../../src/core/storage";
import type { PrIdentity } from "../../src/core/route";

const id: PrIdentity = { owner: "o", repo: "r", number: 1, headSha: "abc", baseBranch: "release/1.x" };
const GOOD = JSON.stringify({ groups: [{ name: "A", paths: ["a"] }] });

function mk(map: Record<string, { status: number; body?: string }>, cached: CachedConfig | null = null) {
  const urls: string[] = [];
  const put = vi.fn();
  const logError = vi.fn();
  const deps: LoaderDeps = {
    fetch: async (u) => {
      urls.push(u);
      const r = map[u] ?? { status: 404 };
      return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.body ?? "" };
    },
    now: () => 5,
    logError,
    get: () => cached,
    put,
  };
  return { deps, urls, put, logError };
}
const HEAD = "/o/r/raw/abc/.github/pr-groups.json";
const BASE = "/o/r/raw/release/1.x/.github/pr-groups.json";
const ATTR_HEAD = "/o/r/raw/abc/.gitattributes";
const ATTR_BASE = "/o/r/raw/release/1.x/.gitattributes";
const ATTRS = "*.pb.go linguist-generated\n*.md text\n";

describe("resolveConfig", () => {
  it("uses head 200", async () => {
    const t = mk({ [HEAD]: { status: 200, body: GOOD } });
    const c = await resolveConfig(id, t.deps);
    expect(c.status).toBe("ok");
    expect(t.urls).toEqual([HEAD, ATTR_HEAD, ATTR_BASE]);
    expect(t.put).toHaveBeenCalledWith(id, c);
  });
  it("falls back to base on head 404, encoding segments", async () => {
    const t = mk({ [HEAD]: { status: 404 }, [BASE]: { status: 200, body: GOOD } });
    expect((await resolveConfig(id, t.deps)).status).toBe("ok");
    expect(t.urls.slice(0, 2)).toEqual([HEAD, BASE]);
    const t2 = mk({});
    await resolveConfig({ ...id, baseBranch: "feat/a b#c" }, t2.deps);
    expect(t2.urls[1]).toBe("/o/r/raw/feat/a%20b%23c/.github/pr-groups.json");
  });
  it("adds .gitattributes generated rules to the config, changing its hash", async () => {
    const plain = await resolveConfig(id, mk({ [HEAD]: { status: 200, body: GOOD } }).deps);
    const t = mk({ [HEAD]: { status: 200, body: GOOD }, [ATTR_HEAD]: { status: 200, body: ATTRS } });
    const c = await resolveConfig(id, t.deps);
    expect(t.urls).toEqual([HEAD, ATTR_HEAD]);
    expect(c).toMatchObject({ status: "ok", config: { generated: [{ pattern: "*.pb.go", generated: true }] } });
    expect(c.hash).not.toBe(plain.hash);
  });
  it("a repo with only .gitattributes rules gets an ok config with no other groups", async () => {
    const t = mk({ [ATTR_BASE]: { status: 200, body: ATTRS } });
    const c = await resolveConfig(id, t.deps);
    expect(c).toMatchObject({ status: "ok", config: { groups: [], generated: [{ pattern: "*.pb.go", generated: true }] } });
  });
  it(".gitattributes without linguist-generated changes nothing", async () => {
    const t = mk({ [ATTR_HEAD]: { status: 200, body: "*.md text\n" } });
    expect(await resolveConfig(id, t.deps)).toMatchObject({ status: "none" });
  });
  it("both 404 -> none, cached", async () => {
    const t = mk({});
    const c = await resolveConfig(id, t.deps);
    expect(c).toMatchObject({ status: "none", hash: "none" });
    expect(t.put).toHaveBeenCalled();
    expect(t.logError).not.toHaveBeenCalled();
  });
  it("invalid JSON -> invalid, logged once", async () => {
    const t = mk({ [HEAD]: { status: 200, body: "{nope" } });
    const c = await resolveConfig(id, t.deps);
    expect(c.status).toBe("invalid");
    expect(t.logError).toHaveBeenCalledTimes(1);
    expect(t.logError.mock.calls[0][0]).toMatch(/^\[fast-pr\] \.github\/pr-groups\.json: /);
  });
  it("cache hit does not fetch or log", async () => {
    const hit: CachedConfig = { status: "invalid", hash: "h", at: 1, error: "e" };
    const t = mk({}, hit);
    expect(await resolveConfig(id, t.deps)).toBe(hit);
    expect(t.urls).toEqual([]);
    expect(t.logError).not.toHaveBeenCalled();
  });
  it("server error throws and caches nothing", async () => {
    const t = mk({ [HEAD]: { status: 500 } });
    await expect(resolveConfig(id, t.deps)).rejects.toThrow();
    expect(t.put).not.toHaveBeenCalled();
  });
});

describe("shouldReload truth table", () => {
  const ok = (hash: string): CachedConfig => ({ status: "ok", config: { groups: [] }, hash, at: 1 });
  const none: CachedConfig = { status: "none", hash: "none", at: 1 };
  const invalid: CachedConfig = { status: "invalid", hash: "x", at: 1 };
  const applied = (configStatus: any, appliedHash: string | null) => ({ configStatus, appliedHash });
  it.each([
    ["applied ok h1, next ok h1", applied("ok", "h1"), ok("h1"), false],
    ["applied ok h1, next ok h2", applied("ok", "h1"), ok("h2"), true],
    ["applied ok, next none", applied("ok", "h1"), none, true],
    ["applied ok, next invalid", applied("ok", "h1"), invalid, true],
    ["miss, next ok", applied("miss", null), ok("h1"), true],
    ["none, next ok", applied("none", null), ok("h1"), true],
    ["invalid, next ok", applied("invalid", null), ok("h1"), true],
    ["miss, next none", applied("miss", null), none, false],
    ["miss, next invalid", applied("miss", null), invalid, false],
    ["none, next none", applied("none", null), none, false],
    ["invalid, next none", applied("invalid", null), none, false],
  ])("%s -> %s", (_n, a, next, want) => {
    expect(shouldReload(a, next)).toBe(want);
  });
  it("guard key", () => {
    expect(reloadGuardKey("/o/r/pull/1/changes", "abc", ok("h"))).toBe("fast-pr:reloaded:/o/r/pull/1/changes@abc@h");
    expect(reloadGuardKey("/p", "abc", none)).toBe("fast-pr:reloaded:/p@abc@none");
  });
});
