import { describe, it, expect } from "vitest";
import { parseConfig, compileConfig, CONFIG_PATH } from "../src/core/config";

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
  it("exports config path", () => {
    expect(CONFIG_PATH).toBe(".github/pr-groups.json");
  });
});
