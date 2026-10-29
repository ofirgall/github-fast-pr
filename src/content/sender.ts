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

/** The request GitHub's own Viewed checkbox sends (see parseReviewRequest). */
function reviewRequest(path: string, viewed: boolean): RequestInit {
  return {
    method: viewed ? "POST" : "DELETE",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "GitHub-Verified-Fetch": "true",
    },
    body: JSON.stringify(viewed ? { path, viewed: "viewed" } : { path, _method: "delete" }),
  };
}

const reviewUrl = (id: PrIdentity) => `/${id.owner}/${id.repo}/pull/${id.number}/file_review`;

/** Run `job` over `items`, at most `concurrency` at a time. */
async function pool<T>(items: T[], concurrency: number, job: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await job(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

/** Send one review request; failures are logged and reported as false. */
async function sendOne(
  id: PrIdentity,
  path: string,
  viewed: boolean,
  deps: Pick<SenderDeps, "fetch" | "logError">,
): Promise<boolean> {
  const what = viewed ? "viewed" : "unviewed";
  try {
    const res = await deps.fetch(reviewUrl(id), reviewRequest(path, viewed));
    if (res.ok) return true;
    deps.logError(`[fast-pr] failed to mark ${what}: ${path} (${res.status})`);
  } catch (e) {
    deps.logError(`[fast-pr] failed to mark ${what}: ${path} (${(e as Error).message})`);
  }
  return false;
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
  await pool(todo, concurrency, async (path) => {
    if (await sendOne(id, path, true, deps)) deps.record(path);
  });
}

/** User-requested batch from the tree menu: every path is sent, nothing is recorded as auto-viewed. */
export async function sendViewedBatch(
  id: PrIdentity,
  paths: string[],
  viewed: boolean,
  deps: Pick<SenderDeps, "fetch" | "logError"> = defaultSenderDeps(id),
  onEach?: (path: string, ok: boolean) => void,
  concurrency = 4,
): Promise<{ ok: string[]; failed: string[] }> {
  const ok: string[] = [];
  const failed: string[] = [];
  await pool(paths, concurrency, async (path) => {
    const done = await sendOne(id, path, viewed, deps);
    (done ? ok : failed).push(path);
    onEach?.(path, done);
  });
  return { ok, failed };
}
