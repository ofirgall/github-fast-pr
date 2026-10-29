export const ROUTE_KEYS = ["pullRequestsChangesRoute", "pullRequestsChangesWithRangeRoute"] as const;

export interface DiffSummary {
  path: string;
  pathDigest: string;
  linesAdded: number;
  linesDeleted: number;
  markedAsViewed: boolean;
  [k: string]: unknown;
}
export interface ChangesRoute {
  diffSummaries: DiffSummary[];
  comparison?: unknown;
  pullRequest?: unknown;
  repository?: unknown;
  user?: { viewedFilesCount?: number; [k: string]: unknown };
  [k: string]: unknown;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function validSummary(s: unknown): boolean {
  return (
    isObj(s) &&
    typeof s.path === "string" &&
    typeof s.pathDigest === "string" &&
    typeof s.linesAdded === "number" &&
    typeof s.linesDeleted === "number" &&
    typeof s.markedAsViewed === "boolean"
  );
}

export function findChangesRoute(obj: unknown): { key: string; route: ChangesRoute } | null {
  try {
    if (!isObj(obj)) return null;
    const payload = obj.payload;
    if (!isObj(payload)) return null;
    for (const key of ROUTE_KEYS) {
      const route = payload[key];
      if (!isObj(route)) continue;
      const ds = route.diffSummaries;
      if (Array.isArray(ds) && ds.every(validSummary)) {
        return { key, route: route as unknown as ChangesRoute };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface PrIdentity { owner: string; repo: string; number: number; headSha: string; baseBranch: string }

export function prIdentity(route: ChangesRoute): PrIdentity | null {
  try {
    const repository = route.repository;
    const pr = route.pullRequest;
    const cmp = route.comparison;
    if (!isObj(repository) || !isObj(pr) || !isObj(cmp)) return null;
    const fullDiff = cmp.fullDiff;
    if (!isObj(fullDiff)) return null;
    const owner = repository.ownerLogin;
    const repo = repository.name;
    const number = pr.number;
    const baseBranch = pr.baseBranch;
    const headSha = fullDiff.headOid;
    if (
      typeof owner !== "string" || !owner ||
      typeof repo !== "string" || !repo ||
      typeof number !== "number" ||
      typeof baseBranch !== "string" || !baseBranch ||
      typeof headSha !== "string" || !headSha
    ) {
      return null;
    }
    return { owner, repo, number, headSha, baseBranch };
  } catch {
    return null;
  }
}

export function isFullDiff(route: ChangesRoute): boolean {
  try {
    const cmp = route.comparison;
    if (!isObj(cmp)) return false;
    return cmp.viewing === "FULL" && cmp.selectedRange == null;
  } catch {
    return false;
  }
}
