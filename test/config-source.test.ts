import { describe, it, expect } from "vitest";
import { effectiveConfig, withRepoGenerated } from "../src/shared/config-source";
import { putConfig, type CachedConfig } from "../src/core/storage";
import type { PrIdentity } from "../src/core/route";

class MemStore {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const id: PrIdentity = { owner: "o", repo: "r", number: 1, headSha: "s", baseBranch: "main" };
const rules = [{ pattern: "*.gen.ts", generated: true }];
const repo: CachedConfig = { status: "ok", config: { groups: [], generated: rules }, hash: "repo", at: 1 };
const LOCAL = '{"groups":[{"name":"A","paths":["^a/"]}]}';

describe("effectiveConfig", () => {
  it("is the cached repo config when no local config is set", () => {
    const s = new MemStore();
    expect(effectiveConfig(id, s)).toBeNull();
    putConfig(id, repo, s);
    expect(effectiveConfig(id, s)).toEqual({ cfg: repo, dev: false });
  });
  it("adds the repo's generated rules to a local config and rehashes it", () => {
    const s = new MemStore();
    s.setItem("fast-pr:local-config", LOCAL);
    const alone = effectiveConfig(id, s)!;
    putConfig(id, repo, s);
    const merged = effectiveConfig(id, s)!;
    expect(merged.dev).toBe(true);
    expect(merged.cfg).toMatchObject({ status: "ok", config: { groups: [{ name: "A" }], generated: rules } });
    expect(merged.cfg.hash).not.toBe(alone.cfg.hash);
  });
  it("leaves a local config alone when the repo has no generated rules or it is invalid", () => {
    const local: CachedConfig = { status: "ok", config: { groups: [] }, hash: "l", at: 0 };
    expect(withRepoGenerated(local, { ...repo, config: { groups: [] } })).toBe(local);
    expect(withRepoGenerated(local, null)).toBe(local);
    const bad: CachedConfig = { status: "invalid", hash: "b", at: 0 };
    expect(withRepoGenerated(bad, repo)).toBe(bad);
  });
});
