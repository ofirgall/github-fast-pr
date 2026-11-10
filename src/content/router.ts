/**
 * conversation: /pull/N. changes: the React files view, /pull/N/changes[/range].
 * files: the classic files view, /pull/N/files[/range] (GitHub redirects between the two
 * by the user's choice of experience).
 */
export type PageKind = "conversation" | "changes" | "files" | "none";
export interface PageInfo { kind: PageKind; owner: string; repo: string; number: number }

const RE = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(\/?|\/(changes|files)(?:\/[^/]+)?\/?)$/;

export function classifyPath(pathname: string): PageInfo {
  const m = RE.exec(pathname);
  if (!m) return { kind: "none", owner: "", repo: "", number: 0 };
  return {
    kind: m[5] === "changes" ? "changes" : m[5] === "files" ? "files" : "conversation",
    owner: m[1],
    repo: m[2],
    number: Number(m[3]),
  };
}

/** A classic files URL for a commit or range, not the whole PR. */
export const isClassicRange = (pathname: string): boolean => /\/pull\/\d+\/files\/[^/]+/.test(pathname);
