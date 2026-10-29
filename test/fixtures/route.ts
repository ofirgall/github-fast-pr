import type { DiffSummary } from "../../src/core/route";

export const HEAD = "a".repeat(40);
export const BASE = "b".repeat(40);

export function summary(path: string, o: Partial<DiffSummary> = {}): DiffSummary {
  return {
    changeType: "MODIFIED",
    linesAdded: 1,
    linesChanged: 1,
    linesDeleted: 0,
    markedAsViewed: false,
    path,
    pathDigest: "d".repeat(60) + String(path.length).padStart(4, "0"),
    isSymlink: false,
    ...o,
  };
}

export function routePayload(
  summaries: DiffSummary[],
  opts: { key?: string; range?: boolean } = {},
) {
  const key = opts.key ?? (opts.range ? "pullRequestsChangesWithRangeRoute" : "pullRequestsChangesRoute");
  return {
    payload: {
      [key]: {
        comparison: {
          fullDiff: { baseOid: BASE, headOid: HEAD },
          selectedRange: opts.range ? { baseOid: BASE, headOid: HEAD } : null,
          viewing: opts.range ? "COMMIT" : "FULL",
        },
        pullRequest: {
          number: 42,
          baseBranch: "main",
          headBranch: "feat",
          comparison: { baseOid: BASE, headOid: HEAD },
        },
        repository: { ownerLogin: "acme", name: "widgets", defaultBranch: "main" },
        user: { viewedFilesCount: 0, currentUserLogin: "me" },
        diffSummaries: summaries,
      },
    },
  };
}
