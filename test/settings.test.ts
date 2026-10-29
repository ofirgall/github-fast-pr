import { describe, expect, it } from "vitest";
import { cacheKeys, mirrorPlan, normalizeSettings } from "../src/core/settings";

describe("normalizeSettings", () => {
  it("defaults on junk", () => {
    expect(normalizeSettings(undefined)).toEqual({ debug: false, localConfig: "", collapseGroups: true, autoView: true });
    expect(normalizeSettings({ debug: "yes", localConfig: 1, collapseGroups: 0, autoView: "no" })).toEqual({
      debug: false, localConfig: "", collapseGroups: true, autoView: true,
    });
  });
  it("keeps debug, trimmed config and turned-off options", () => {
    expect(normalizeSettings({ debug: true, localConfig: " {} \n", collapseGroups: false, autoView: false })).toEqual({
      debug: true, localConfig: "{}", collapseGroups: false, autoView: false,
    });
  });
});

describe("mirrorPlan", () => {
  it("sets config and debug, removes legacy per-repo keys and old config caches", () => {
    const plan = mirrorPlan({ debug: true, localConfig: "A", collapseGroups: true, autoView: true }, [
      "fast-pr:dev-config:o/r",
      "fast-pr:cfg:o/r@s",
      "fast-pr:cfg-pr:o/r#1",
      "fast-pr:cfg2:o/r@s",
      "fast-pr:cfg2-pr:o/r#1",
      "fast-pr:cfg3:o/r@s",
      "fast-pr:cfg3-pr:o/r#1",
      "fast-pr:tree-mode",
    ]);
    expect(plan.set).toEqual([["fast-pr:local-config", "A"], ["fast-pr:debug", "1"]]);
    expect(plan.remove).toEqual([
      "fast-pr:dev-config:o/r", "fast-pr:cfg:o/r@s", "fast-pr:cfg-pr:o/r#1", "fast-pr:cfg2:o/r@s", "fast-pr:cfg2-pr:o/r#1",
    ]);
  });
  it("removes config and debug when cleared", () => {
    const off = { debug: false, localConfig: "", collapseGroups: true, autoView: true };
    const plan = mirrorPlan(off, ["fast-pr:local-config", "fast-pr:debug"]);
    expect(plan).toEqual({ set: [], remove: ["fast-pr:local-config", "fast-pr:debug"] });
    expect(mirrorPlan(off, [])).toEqual({ set: [], remove: [] });
  });
  it("marks expand-groups and no-auto-view only when those options are off", () => {
    const s = { debug: false, localConfig: "", collapseGroups: false, autoView: false };
    expect(mirrorPlan(s, []).set).toEqual([["fast-pr:expand-groups", "1"], ["fast-pr:no-auto-view", "1"]]);
    const on = { ...s, collapseGroups: true, autoView: true };
    expect(mirrorPlan(on, ["fast-pr:expand-groups", "fast-pr:no-auto-view"]).remove).toEqual([
      "fast-pr:expand-groups", "fast-pr:no-auto-view",
    ]);
  });
});

describe("cacheKeys", () => {
  it("selects only cached config keys", () => {
    expect(
      cacheKeys([
        "fast-pr:cfg3:o/r@s", "fast-pr:cfg3-pr:o/r#1", "fast-pr:cfg:o/r@s", "fast-pr:cfg-pr:o/r#1", "fast-pr:cfg2:o/r@s",
        "fast-pr:auto:o/r#1", "fast-pr:local-config",
      ]),
    ).toEqual(["fast-pr:cfg3:o/r@s", "fast-pr:cfg3-pr:o/r#1", "fast-pr:cfg:o/r@s", "fast-pr:cfg-pr:o/r#1", "fast-pr:cfg2:o/r@s"]);
  });
});
