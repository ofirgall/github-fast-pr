import { describe, it, expect } from "vitest";
import { parseReviewRequest } from "../../src/hook/review";

const O = "https://github.com";
const URL_ = "https://github.com/o/r/pull/12/file_review";

describe("parseReviewRequest", () => {
  it("reads GitHub's mark and unmark requests", () => {
    expect(parseReviewRequest(URL_, "POST", '{"path":"a/b.ts","viewed":"viewed"}', O)).toEqual({
      owner: "o", repo: "r", number: 12, path: "a/b.ts", viewed: true,
    });
    expect(parseReviewRequest("/o/r/pull/12/file_review", "DELETE", '{"path":"a/b.ts","_method":"delete"}', O)).toEqual({
      owner: "o", repo: "r", number: 12, path: "a/b.ts", viewed: false,
    });
    expect(parseReviewRequest(URL_, "post", '{"path":"x","_method":"delete"}', O)?.viewed).toBe(false);
  });

  it("ignores everything else", () => {
    expect(parseReviewRequest("https://github.com/o/r/pull/12/files", "POST", '{"path":"x","viewed":"viewed"}', O)).toBeNull();
    expect(parseReviewRequest("https://evil.example/o/r/pull/12/file_review", "POST", '{"path":"x","viewed":"viewed"}', O)).toBeNull();
    expect(parseReviewRequest(URL_, "GET", '{"path":"x"}', O)).toBeNull();
    expect(parseReviewRequest(URL_, "POST", "not json", O)).toBeNull();
    expect(parseReviewRequest(URL_, "POST", '{"viewed":"viewed"}', O)).toBeNull();
    expect(parseReviewRequest(URL_, "POST", null, O)).toBeNull();
  });
});
