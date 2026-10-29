import { describe, it, expect } from "vitest";
import { patchChangesData, type PatchEnv } from "../../src/hook/patch";
import { parseConfig } from "../../src/core/config";
import type { CachedConfig } from "../../src/core/storage";
import { HEAD, routePayload, summary } from "../fixtures/route";

const cfgOf = (json: unknown): CachedConfig => {
  const r = parseConfig(JSON.stringify(json));
  if (!r.ok) throw new Error(r.error);
  return { status: "ok", config: r.config, hash: r.hash, at: 1 };
};
const CFG = cfgOf({
  groups: [
    { name: "Src", paths: ["^src/"] },
    { name: "Gen", paths: ["\\.gen\\."], autoViewed: true },
  ],
});
const env = (cfg: CachedConfig | null, auto: string[] = [], dev = false): PatchEnv => ({
  configFor: () => (cfg ? { cfg, dev } : null),
  autoPaths: () => auto,
});
const files = () => [
  summary("README.md"),
  summary("a.gen.ts"),
  summary("src/x.ts"),
  summary("b.gen.ts", { markedAsViewed: true }),
];
const route = (d: any) => d.payload.pullRequestsChangesRoute;

describe("patchChangesData", () => {
  it("returns null for unrelated data", () => {
    expect(patchChangesData({ a: 1 }, env(CFG))).toBeNull();
    expect(patchChangesData(null, env(CFG))).toBeNull();
  });

  it("reorders, marks auto files viewed, recounts", () => {
    const d = routePayload(files());
    const out = patchChangesData(d, env(CFG))!;
    expect(route(d).diffSummaries.map((s: any) => s.path)).toEqual(["src/x.ts", "README.md", "a.gen.ts", "b.gen.ts"]);
    expect(route(d).diffSummaries[2].markedAsViewed).toBe(true);
    expect(route(d).user.viewedFilesCount).toBe(2);
    const r = out.result;
    expect(r.configStatus).toBe("ok");
    expect(r.appliedHash).toBe(CFG.hash);
    expect(r.fullDiff).toBe(true);
    expect(r.files.map((f) => f.path)).toEqual(["src/x.ts", "README.md", "a.gen.ts", "b.gen.ts"]);
    expect(r.files[0]).toMatchObject({ group: "Src", groupIndex: 0, autoViewed: false, markedByHook: false });
    expect(r.files[1]).toMatchObject({ group: null, groupIndex: null });
    expect(r.files[2]).toMatchObject({ group: "Gen", autoViewed: true, originalViewed: false, markedByHook: true });
    expect(r.files[3]).toMatchObject({ originalViewed: true, markedByHook: false, skippedUnviewed: false });
  });

  it("does not mark on a partial range but still orders", () => {
    const d = routePayload(files(), { range: true });
    const out = patchChangesData(d, env(CFG))!;
    const s = d.payload.pullRequestsChangesWithRangeRoute.diffSummaries;
    expect(s.map((x: any) => x.path)[0]).toBe("src/x.ts");
    expect(s.find((x: any) => x.path === "a.gen.ts")!.markedAsViewed).toBe(false);
    expect(out.result.fullDiff).toBe(false);
    expect(out.result.files.some((f) => f.markedByHook)).toBe(false);
    expect(d.payload.pullRequestsChangesWithRangeRoute.user.viewedFilesCount).toBe(1);
  });

  it("skips files the user un-viewed at the same head", () => {
    const d = routePayload(files());
    const out = patchChangesData(d, env(CFG, ["a.gen.ts"]))!;
    const f = out.result.files.find((x) => x.path === "a.gen.ts")!;
    expect(f).toMatchObject({ skippedUnviewed: true, markedByHook: false });
    expect(route(d).diffSummaries.find((s: any) => s.path === "a.gen.ts").markedAsViewed).toBe(false);
    expect(route(d).user.viewedFilesCount).toBe(1);
  });

  it("re-marks after head changes (record empty for new sha)", () => {
    const d = routePayload(files());
    const out = patchChangesData(d, env(CFG, []))!;
    expect(out.result.files.find((x) => x.path === "a.gen.ts")!.markedByHook).toBe(true);
  });

  it.each([
    ["none", { status: "none", hash: "none", at: 1 } as CachedConfig],
    ["invalid", { status: "invalid", hash: "x", at: 1, error: "e" } as CachedConfig],
    ["miss", null],
  ])("%s leaves data untouched", (status, cfg) => {
    const d = routePayload(files());
    const before = JSON.stringify(d);
    const out = patchChangesData(d, env(cfg))!;
    expect(JSON.stringify(d)).toBe(before);
    expect(out.result.configStatus).toBe(status);
    expect(out.result.appliedHash).toBeNull();
    expect(out.result.files.map((f) => f.path)).toEqual(["README.md", "a.gen.ts", "src/x.ts", "b.gen.ts"]);
    expect(out.result.files.every((f) => f.group === null)).toBe(true);
  });

  it("leaves data untouched when env throws", () => {
    const d = routePayload(files());
    const before = JSON.stringify(d);
    const bad: PatchEnv = { configFor: () => { throw new Error("boom"); }, autoPaths: () => [] };
    expect(() => patchChangesData(d, bad)).toThrow();
    expect(JSON.stringify(d)).toBe(before);
    const bad2: PatchEnv = { configFor: () => ({ cfg: CFG, dev: false }), autoPaths: () => { throw new Error("x"); } };
    expect(() => patchChangesData(d, bad2)).toThrow();
    expect(JSON.stringify(d)).toBe(before);
  });

  it("is idempotent", () => {
    const d = routePayload(files());
    const a = patchChangesData(d, env(CFG))!;
    const snap = JSON.stringify(d);
    const b = patchChangesData(d, env(CFG))!;
    expect(b.fresh).toBe(false);
    expect(b.result).toBe(a.result);
    expect(JSON.stringify(d)).toBe(snap);
    expect(a.fresh).toBe(true);
  });

  it("flags dev config", () => {
    const out = patchChangesData(routePayload(files()), env(CFG, [], true))!;
    expect(out.result.devConfig).toBe(true);
    expect(out.result.identity.headSha).toBe(HEAD);
  });

  it("does not touch viewedFilesCount when absent", () => {
    const d = routePayload(files());
    delete route(d).user.viewedFilesCount;
    patchChangesData(d, env(CFG));
    expect("viewedFilesCount" in route(d).user).toBe(false);
  });
});
