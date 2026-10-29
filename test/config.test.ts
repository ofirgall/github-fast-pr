import { describe, it, expect } from "vitest";
import {
  parseConfig, compileConfig, withGenerated, ungroupedViewPriority, CONFIG_PATH, GENERATED_GROUP,
} from "../src/core/config";
import { assignGroup } from "../src/core/grouping";

describe("parseConfig", () => {
  it("parses a valid config and defaults autoViewed to false", () => {
    const r = parseConfig(JSON.stringify({ groups: [{ name: "A", paths: ["^a/"] }, { name: "B", paths: ["x"], autoViewed: true }] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.groups.map((g) => g.autoViewed)).toEqual([false, true]);
      expect(r.hash).toMatch(/^[0-9a-f]{8}$/);
    }
  });
  it("hash is stable and changes with content", () => {
    const a = parseConfig('{"groups":[{"name":"A","paths":["a"]}]}');
    const b = parseConfig('{ "groups": [ {"paths":["a"], "name":"A", "autoViewed": false} ] }');
    const c = parseConfig('{"groups":[{"name":"A","paths":["b"]}]}');
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) {
      expect(a.hash).toBe(b.hash);
      expect(a.hash).not.toBe(c.hash);
    }
  });
  it("rejects bad JSON", () => {
    const r = parseConfig("{nope");
    expect(r.ok).toBe(false);
  });
  it.each([
    ["null", "null"],
    ["array", "[]"],
    ["no groups", "{}"],
    ["groups not array", '{"groups":1}'],
    ["group not object", '{"groups":[1]}'],
    ["missing name", '{"groups":[{"paths":["a"]}]}'],
    ["empty name", '{"groups":[{"name":"","paths":["a"]}]}'],
    ["missing paths", '{"groups":[{"name":"A"}]}'],
    ["empty paths", '{"groups":[{"name":"A","paths":[]}]}'],
    ["non-string path", '{"groups":[{"name":"A","paths":[1]}]}'],
    ["non-boolean autoViewed", '{"groups":[{"name":"A","paths":["a"],"autoViewed":"yes"}]}'],
  ])("rejects %s", (_n, text) => {
    expect(parseConfig(text).ok).toBe(false);
  });
  it("names group and pattern for a bad regex", () => {
    const r = parseConfig('{"groups":[{"name":"Broken","paths":["("]}]}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Broken");
      expect(r.error).toContain("(");
    }
  });
  it("reads priorities on groups and the top-level generated and ungrouped objects", () => {
    const r = parseConfig(JSON.stringify({
      groups: [{ name: "A", paths: ["a"], matchPriority: 3, viewPriority: -1.5 }, { name: "B", paths: ["b"] }],
      generated: { matchPriority: 0, viewPriority: 4 },
      ungrouped: { viewPriority: 2 },
    }));
    expect(r).toMatchObject({ ok: true, config: {
      groups: [{ name: "A", matchPriority: 3, viewPriority: -1.5 }, { name: "B" }],
      generatedPriority: { matchPriority: 0, viewPriority: 4 },
      ungrouped: { viewPriority: 2 },
    } });
    if (!r.ok) throw new Error("x");
    expect(r.config.groups[1]).not.toHaveProperty("matchPriority");
    expect(ungroupedViewPriority(r.config)).toBe(2);
    const c = compileConfig(withGenerated(r.config, [{ pattern: "*.g", generated: true }]));
    expect(c.map((g) => [g.name, g.matchPriority, g.viewPriority])).toEqual([
      ["A", 3, -1.5], ["B", 0, 0], [GENERATED_GROUP, 0, 4],
    ]);
  });
  it("defaults priorities to the original order rules", () => {
    const r = parseConfig('{"groups":[{"name":"A","paths":["a"]},{"name":"B","paths":["b"],"autoViewed":true}]}');
    if (!r.ok) throw new Error("x");
    expect(r.config).toEqual({ groups: [
      { name: "A", paths: ["a"], autoViewed: false }, { name: "B", paths: ["b"], autoViewed: true },
    ] });
    expect(compileConfig(r.config).map((g) => [g.matchPriority, g.viewPriority])).toEqual([[0, 0], [1, -2]]);
    expect(ungroupedViewPriority(r.config)).toBe(-1);
  });
  it.each([
    ['{"groups":[{"name":"A","paths":["a"],"matchPriority":"1"}]}', 'Group "A": "matchPriority" must be a number'],
    ['{"groups":[{"name":"A","paths":["a"],"viewPriority":null}]}', 'Group "A": "viewPriority" must be a number'],
    ['{"groups":[],"ungrouped":3}', '"ungrouped" must be an object'],
    ['{"groups":[],"generated":{"viewPriority":true}}', '"generated": "viewPriority" must be a number'],
  ])("rejects bad priorities: %s", (text, error) => {
    expect(parseConfig(text)).toEqual({ ok: false, error });
  });
  it("accepts an empty groups array", () => {
    expect(parseConfig('{"groups":[]}').ok).toBe(true);
  });
});

describe("compileConfig", () => {
  it("compiles regexes without flags and keeps index", () => {
    const r = parseConfig('{"groups":[{"name":"A","paths":["a","b"]},{"name":"B","paths":["c"],"autoViewed":true}]}');
    if (!r.ok) throw new Error("x");
    const c = compileConfig(r.config);
    expect(c.map((g) => g.index)).toEqual([0, 1]);
    expect(c[0].regexes).toHaveLength(2);
    expect(c[0].regexes[0].flags).toBe("");
    expect(c[1].autoViewed).toBe(true);
  });
  it("appends an auto-viewed Generated group from .gitattributes rules, which wins over plain groups", () => {
    const cfg = withGenerated(
      { groups: [{ name: "Src", paths: ["^src/"], autoViewed: false }] },
      [{ pattern: "*.pb.go", generated: true }, { pattern: "keep.pb.go", generated: false }],
    );
    const c = compileConfig(cfg);
    expect(c.map((g) => [g.name, g.index, g.autoViewed])).toEqual([["Src", 0, false], [GENERATED_GROUP, 1, true]]);
    expect(assignGroup("src/a.pb.go", c)?.name).toBe(GENERATED_GROUP);
    expect(assignGroup("src/keep.pb.go", c)?.name).toBe("Src");
    expect(assignGroup("other/x.go", c)).toBeNull();
  });
  it("adds no Generated group without a generating rule", () => {
    const base = { groups: [] };
    expect(withGenerated(base, [{ pattern: "a", generated: false }])).toBe(base);
    expect(withGenerated(base, undefined)).toBe(base);
    expect(compileConfig({ groups: [], generated: [{ pattern: "a", generated: false }] })).toEqual([]);
  });
  it("exports config path", () => {
    expect(CONFIG_PATH).toBe(".github/pr-groups.json");
  });
});
