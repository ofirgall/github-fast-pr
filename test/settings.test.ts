import { describe, expect, it } from "vitest";
import { cacheKeys, mirrorPlan, normalizeSettings } from "../src/core/settings";

describe("normalizeSettings", () => {
  it("defaults on junk", () => {
    expect(normalizeSettings(undefined)).toEqual({ debug: false, localConfig: "" });
    expect(normalizeSettings({ debug: "yes", localConfig: 1 })).toEqual({ debug: false, localConfig: "" });
  });
  it("keeps debug and trimmed config", () => {
    expect(normalizeSettings({ debug: true, localConfig: " {} \n" })).toEqual({ debug: true, localConfig: "{}" });
  });
});

describe("mirrorPlan", () => {
  it("sets config and debug, removes legacy per-repo keys", () => {
    const plan = mirrorPlan({ debug: true, localConfig: "A" }, [
      "fast-pr:dev-config:o/r",
      "fast-pr:cfg:o/r@s",
      "fast-pr:tree-mode",
    ]);
    expect(plan.set).toEqual([["fast-pr:local-config", "A"], ["fast-pr:debug", "1"]]);
    expect(plan.remove).toEqual(["fast-pr:dev-config:o/r"]);
  });
  it("removes config and debug when cleared", () => {
    const plan = mirrorPlan({ debug: false, localConfig: "" }, ["fast-pr:local-config", "fast-pr:debug"]);
    expect(plan).toEqual({ set: [], remove: ["fast-pr:local-config", "fast-pr:debug"] });
    expect(mirrorPlan({ debug: false, localConfig: "" }, [])).toEqual({ set: [], remove: [] });
  });
});

describe("cacheKeys", () => {
  it("selects only cached config keys", () => {
    expect(
      cacheKeys([
        "fast-pr:cfg2:o/r@s", "fast-pr:cfg2-pr:o/r#1", "fast-pr:cfg:o/r@s", "fast-pr:cfg-pr:o/r#1",
        "fast-pr:auto:o/r#1", "fast-pr:local-config",
      ]),
    ).toEqual(["fast-pr:cfg2:o/r@s", "fast-pr:cfg2-pr:o/r#1", "fast-pr:cfg:o/r@s", "fast-pr:cfg-pr:o/r#1"]);
  });
});
