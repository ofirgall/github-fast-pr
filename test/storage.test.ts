import { describe, it, expect } from "vitest";
import * as S from "../src/core/storage";
import type { PrIdentity } from "../src/core/route";

class MemStore {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const throwing = {
  get length(): number { throw new Error("x"); },
  key(): never { throw new Error("x"); },
  getItem(): never { throw new Error("x"); },
  setItem(): never { throw new Error("x"); },
  removeItem(): never { throw new Error("x"); },
};

const id = (sha = "s1", n = 7): PrIdentity => ({ owner: "o", repo: "r", number: n, headSha: sha, baseBranch: "main" });
const ok = (at: number, hash = "h"): S.CachedConfig => ({ status: "ok", config: { groups: [] }, hash, at });

describe("config cache", () => {
  it("misses on empty", () => {
    expect(S.lookupConfig(id(), new MemStore())).toBeNull();
  });
  it("writes both keys; sha lookup first, then pr", () => {
    const st = new MemStore();
    S.putConfig(id("s1"), ok(1, "one"), st);
    expect(st.getItem("fast-pr:cfg2:o/r@s1")).not.toBeNull();
    expect(st.getItem("fast-pr:cfg2-pr:o/r#7")).not.toBeNull();
    expect(S.getConfigBySha("o", "r", "s1", st)?.hash).toBe("one");
    expect(S.lookupConfig(id("s1"), st)?.hash).toBe("one");
    // new push: no sha entry, falls back to pr key
    expect(S.lookupConfig(id("s2"), st)?.hash).toBe("one");
    expect(S.getConfigBySha("o", "r", "s2", st)).toBeNull();
    S.putConfig(id("s2"), { status: "none", hash: "none", at: 2 }, st);
    expect(S.lookupConfig(id("s1"), st)?.hash).toBe("one");
    expect(S.getConfigByPr("o", "r", 7, st)?.status).toBe("none");
  });
  it("ignores corrupt entries", () => {
    const st = new MemStore();
    st.setItem("fast-pr:cfg2:o/r@s1", "{bad");
    st.setItem("fast-pr:cfg2-pr:o/r#7", '{"status":"weird"}');
    expect(S.lookupConfig(id(), st)).toBeNull();
  });
  it("evicts oldest beyond 300 cfg keys", () => {
    const st = new MemStore();
    for (let i = 0; i < 160; i++) S.putConfig(id("sha" + i, 1000 + i), ok(i + 1), st);
    const cfgKeys = [...st.m.keys()].filter((k) => k.startsWith("fast-pr:cfg2:"));
    expect(cfgKeys.length).toBeLessThanOrEqual(300);
    // 160 sha keys, 160 pr keys cfg-pr (not counted by prefix "fast-pr:cfg2:"); push more
    for (let i = 160; i < 320; i++) S.putConfig(id("sha" + i, 1000 + i), ok(i + 1), st);
    const keys = [...st.m.keys()].filter((k) => k.startsWith("fast-pr:cfg2:"));
    expect(keys.length).toBe(300);
    expect(st.getItem("fast-pr:cfg2:o/r@sha0")).toBeNull();
    expect(st.getItem("fast-pr:cfg2:o/r@sha19")).toBeNull();
    expect(st.getItem("fast-pr:cfg2:o/r@sha20")).not.toBeNull();
    expect(st.getItem("fast-pr:cfg2:o/r@sha319")).not.toBeNull();
  });
});

describe("pr key eviction", () => {
  it("evicts oldest cfg-pr keys beyond 300", () => {
    const st = new MemStore();
    for (let i = 0; i < 320; i++) S.putConfig(id("sha" + i, 1000 + i), ok(i + 1), st);
    const keys = [...st.m.keys()].filter((k) => k.startsWith("fast-pr:cfg2-pr:"));
    expect(keys.length).toBe(300);
    expect(st.getItem("fast-pr:cfg2-pr:o/r#1000")).toBeNull();
    expect(st.getItem("fast-pr:cfg2-pr:o/r#1019")).toBeNull();
    expect(st.getItem("fast-pr:cfg2-pr:o/r#1020")).not.toBeNull();
    expect(st.getItem("fast-pr:cfg2-pr:o/r#1319")).not.toBeNull();
  });
});

describe("auto record", () => {
  it("empty by default, accumulates, dedups", () => {
    const st = new MemStore();
    expect(S.getAutoRecord("o", "r", 7, "s1", st)).toEqual({ headSha: "s1", paths: [] });
    S.addAutoPaths("o", "r", 7, "s1", ["a", "b"], st);
    S.addAutoPaths("o", "r", 7, "s1", ["b", "c"], st);
    expect(S.getAutoRecord("o", "r", 7, "s1", st).paths).toEqual(["a", "b", "c"]);
  });
  it("resets on new headSha", () => {
    const st = new MemStore();
    S.addAutoPaths("o", "r", 7, "s1", ["a"], st);
    expect(S.getAutoRecord("o", "r", 7, "s2", st)).toEqual({ headSha: "s2", paths: [] });
    S.addAutoPaths("o", "r", 7, "s2", ["z"], st);
    expect(S.getAutoRecord("o", "r", 7, "s2", st).paths).toEqual(["z"]);
    expect(S.getAutoRecord("o", "r", 7, "s1", st).paths).toEqual([]);
  });
  it("is per PR", () => {
    const st = new MemStore();
    S.addAutoPaths("o", "r", 7, "s1", ["a"], st);
    expect(S.getAutoRecord("o", "r", 8, "s1", st).paths).toEqual([]);
  });
});

describe("tree mode, debug, dev config", () => {
  it("tree mode defaults to grouped and persists", () => {
    const st = new MemStore();
    expect(S.getTreeMode(st)).toBe("grouped");
    S.setTreeMode("original", st);
    expect(S.getTreeMode(st)).toBe("original");
    S.setTreeMode("grouped", st);
    expect(S.getTreeMode(st)).toBe("grouped");
  });
  it("debug and local config", () => {
    const st = new MemStore();
    expect(S.getLocalConfig(st)).toBeNull();
    st.setItem("fast-pr:local-config", "{}");
    expect(S.isDebug(st)).toBe(false);
    expect(S.getLocalConfig(st)).toBe("{}");
    st.setItem("fast-pr:debug", "1");
    expect(S.isDebug(st)).toBe(true);
  });
});

describe("throwing storage", () => {
  it("never throws and behaves as miss/no-op", () => {
    expect(S.lookupConfig(id(), throwing)).toBeNull();
    expect(() => S.putConfig(id(), ok(1), throwing)).not.toThrow();
    expect(S.getAutoRecord("o", "r", 1, "s", throwing)).toEqual({ headSha: "s", paths: [] });
    expect(() => S.addAutoPaths("o", "r", 1, "s", ["a"], throwing)).not.toThrow();
    expect(S.getTreeMode(throwing)).toBe("grouped");
    expect(() => S.setTreeMode("original", throwing)).not.toThrow();
    expect(S.isDebug(throwing)).toBe(false);
    expect(S.getLocalConfig(throwing)).toBeNull();
  });
});
