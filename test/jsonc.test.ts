import { describe, it, expect } from "vitest";
import { stripJsonc } from "../src/core/jsonc";
import { parseConfig } from "../src/core/config";

const parse = (s: string) => JSON.parse(stripJsonc(s));

describe("stripJsonc", () => {
  it("removes line and block comments, keeping length and newlines", () => {
    const text = '{ // note\n  "a": /* x */ 1 /* multi\nline */ }';
    const out = stripJsonc(text);
    expect(out).toHaveLength(text.length);
    expect(out.split("\n")).toHaveLength(3);
    expect(JSON.parse(out)).toEqual({ a: 1 });
  });
  it("leaves comment markers and commas inside strings alone", () => {
    expect(parse('{"u": "^https?://x/*y*/", "c": ",]", "q": "a\\"//b"}')).toEqual({
      u: "^https?://x/*y*/", c: ",]", q: 'a"//b',
    });
  });
  it("drops trailing commas, also with comments before the bracket", () => {
    expect(parse('{"a": [1, 2,], "b": {"c": 1,},}')).toEqual({ a: [1, 2], b: { c: 1 } });
    expect(parse('[1, // last\n]')).toEqual([1]);
  });
  it("keeps commas that are not trailing and leaves invalid JSON invalid", () => {
    expect(parse("[1, 2]")).toEqual([1, 2]);
    expect(() => parse("[1,,]")).toThrow();
    expect(() => parse("{/* open")).toThrow();
  });
});

describe("parseConfig with JSONC", () => {
  it("accepts comments and trailing commas", () => {
    const r = parseConfig(`{
      // Grouping for this repo
      "groups": [
        { "name": "Docs", "paths": ["\\\\.md$"], "autoViewed": true }, /* docs are skimmed */
      ],
    }`);
    expect(r).toMatchObject({ ok: true, config: { groups: [{ name: "Docs", paths: ["\\.md$"], autoViewed: true }] } });
  });
  it("hashes the parsed config, so comments do not change it", () => {
    const a = parseConfig('{"groups":[]}');
    const b = parseConfig('{"groups":[] // none yet\n}');
    expect(a.ok && b.ok && a.hash === b.hash).toBe(true);
  });
});
