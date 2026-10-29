import type { ViewedChange } from "../shared/types";

const REVIEW_RE = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/file_review$/;

/**
 * GitHub's Viewed checkbox: POST /pull/N/file_review {path, viewed: "viewed"} marks a file,
 * DELETE with {path, _method: "delete"} unmarks it. Anything else is null.
 */
export function parseReviewRequest(
  url: string,
  method: string,
  body: unknown,
  origin: string,
  parse: (s: string) => unknown = JSON.parse,
): ViewedChange | null {
  let u: URL;
  try {
    u = new URL(url, origin);
  } catch {
    return null;
  }
  if (u.origin !== origin) return null;
  const m = REVIEW_RE.exec(u.pathname);
  if (!m || typeof body !== "string") return null;
  let data: unknown;
  try {
    data = parse(body);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const d = data as { path?: unknown; viewed?: unknown; _method?: unknown };
  if (typeof d.path !== "string") return null;
  const verb = method.toUpperCase();
  let viewed: boolean;
  if (verb === "DELETE" || d._method === "delete") viewed = false;
  else if (verb === "POST" && d.viewed === "viewed") viewed = true;
  else return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]), path: d.path, viewed };
}
