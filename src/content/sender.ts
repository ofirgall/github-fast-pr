import type { PrIdentity } from "../core/route";
import { addAutoPaths } from "../core/storage";

export interface SenderDeps {
  fetch: (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status">>;
  record: (path: string) => void;
  logError: (msg: string) => void;
  /** Keys already handled this page session. */
  sent: Set<string>;
}

const sessionSent = new Set<string>();

export function defaultSenderDeps(id: PrIdentity): SenderDeps {
  return {
    fetch: (u, i) => fetch(u, i),
    record: (p) => addAutoPaths(id.owner, id.repo, id.number, id.headSha, [p]),
    logError: (m) => console.error(m),
    sent: sessionSent,
  };
}

export async function sendFileReviews(
  id: PrIdentity,
  paths: string[],
  deps: SenderDeps = defaultSenderDeps(id),
  concurrency = 4,
): Promise<void> {
  const todo: string[] = [];
  for (const p of paths) {
    const k = `${id.owner}/${id.repo}#${id.number}@${id.headSha}\0${p}`;
    if (deps.sent.has(k)) continue;
    deps.sent.add(k);
    todo.push(p);
  }
  const url = `/${id.owner}/${id.repo}/pull/${id.number}/file_review`;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const path = todo[next++];
      try {
        const res = await deps.fetch(url, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "GitHub-Verified-Fetch": "true",
          },
          body: JSON.stringify({ path, viewed: "viewed" }),
        });
        if (res.ok) deps.record(path);
        else deps.logError(`[fast-pr] failed to mark viewed: ${path} (${res.status})`);
      } catch (e) {
        deps.logError(`[fast-pr] failed to mark viewed: ${path} (${(e as Error).message})`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
}
