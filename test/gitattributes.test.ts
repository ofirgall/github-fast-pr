import { describe, it, expect } from "vitest";
import { compileGenerated, parseGenerated, patternToRegex } from "../src/core/gitattributes";

describe("parseGenerated", () => {
  it("reads set, true, unset and false forms, skipping comments, macros and other attributes", () => {
    const text = [
      "# comment",
      "",
      "*.pb.go linguist-generated",
      "gen/** linguist-generated=true -diff",
      "gen/keep.go -linguist-generated",
      "api/*.ts linguist-generated=false",
      "docs/** !linguist-generated",
      "*.md text eol=lf",
      "[attr]binary -diff -merge -text",
      "!neg linguist-generated",
      "dir/ linguist-generated",
      "weird linguist-generated=maybe",
      '"with space/*.js" linguist-generated',
      "  vendor/**   linguist-vendored linguist-generated  ",
    ].join("\n");
    expect(parseGenerated(text)).toEqual([
      { pattern: "*.pb.go", generated: true },
      { pattern: "gen/**", generated: true },
      { pattern: "gen/keep.go", generated: false },
      { pattern: "api/*.ts", generated: false },
      { pattern: "docs/**", generated: false },
      { pattern: "with space/*.js", generated: true },
      { pattern: "vendor/**", generated: true },
    ]);
  });

  it("handles CRLF and the last value on a line", () => {
    expect(parseGenerated("a.js linguist-generated -linguist-generated\r\nb.js linguist-generated\r\n")).toEqual([
      { pattern: "a.js", generated: false },
      { pattern: "b.js", generated: true },
    ]);
  });
});

describe("patternToRegex", () => {
  const m = (pattern: string, path: string) => patternToRegex(pattern).test(path);
  it("matches the basename at any depth when the pattern has no slash", () => {
    expect(m("*.pb.go", "a.pb.go")).toBe(true);
    expect(m("*.pb.go", "x/y/a.pb.go")).toBe(true);
    expect(m("*.pb.go", "x/a.pb.go.txt")).toBe(false);
    expect(m("yarn.lock", "web/yarn.lock")).toBe(true);
    expect(m("?.js", "a/b.js")).toBe(true);
    expect(m("?.js", "a/bc.js")).toBe(false);
  });
  it("anchors patterns with a slash to the repo root", () => {
    expect(m("gen/*.go", "gen/a.go")).toBe(true);
    expect(m("gen/*.go", "gen/sub/a.go")).toBe(false);
    expect(m("gen/*.go", "x/gen/a.go")).toBe(false);
    expect(m("/top.txt", "top.txt")).toBe(true);
    expect(m("/top.txt", "a/top.txt")).toBe(false);
  });
  it("supports ** forms", () => {
    expect(m("gen/**", "gen/a/b.go")).toBe(true);
    expect(m("gen/**", "gen")).toBe(false);
    expect(m("**/schema.ts", "schema.ts")).toBe(true);
    expect(m("**/schema.ts", "a/b/schema.ts")).toBe(true);
    expect(m("a/**/z.go", "a/z.go")).toBe(true);
    expect(m("a/**/z.go", "a/b/c/z.go")).toBe(true);
    expect(m("a/**/z.go", "ab/z.go")).toBe(false);
  });
  it("supports character classes and escapes regex characters", () => {
    expect(m("file[0-9].txt", "file3.txt")).toBe(true);
    expect(m("file[!0-9].txt", "file3.txt")).toBe(false);
    expect(m("file[!0-9].txt", "fileA.txt")).toBe(true);
    expect(m("a+b(c).js", "a+b(c).js")).toBe(true);
    expect(m("a.js", "aXjs")).toBe(false);
  });
});

describe("compileGenerated", () => {
  it("lets the last matching rule win, like git", () => {
    const is = compileGenerated([
      { pattern: "gen/**", generated: true },
      { pattern: "gen/keep.go", generated: false },
      { pattern: "*.pb.go", generated: true },
    ]);
    expect(is("gen/a.go")).toBe(true);
    expect(is("gen/keep.go")).toBe(false);
    expect(is("src/x.pb.go")).toBe(true);
    expect(is("src/x.go")).toBe(false);
  });
});
