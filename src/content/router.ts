export type PageKind = "conversation" | "changes" | "none";
export interface PageInfo { kind: PageKind; owner: string; repo: string; number: number }

const RE = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(\/?|\/changes(?:\/[^/]+)?\/?)$/;

export function classifyPath(pathname: string): PageInfo {
  const m = RE.exec(pathname);
  if (!m) return { kind: "none", owner: "", repo: "", number: 0 };
  return {
    kind: m[4].startsWith("/changes") ? "changes" : "conversation",
    owner: m[1],
    repo: m[2],
    number: Number(m[3]),
  };
}
