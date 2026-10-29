import { compileConfig, ungroupedViewPriority } from "../core/config";
import { orderFiles } from "../core/grouping";
import { findChangesRoute, isFullDiff, prIdentity, type DiffSummary, type PrIdentity } from "../core/route";
import type { CachedConfig } from "../core/storage";
import type { ConfigStatus, FastPrFile, FastPrResult } from "../shared/types";

export interface PatchEnv {
  /** Sync config lookup; `dev` marks the local config from the extension menu. */
  configFor(id: PrIdentity): { cfg: CachedConfig; dev: boolean } | null;
  /** Paths the extension already auto-viewed for this PR at id.headSha. */
  autoPaths(id: PrIdentity): string[];
  /** The menu's "Auto-mark viewed" option; when false, auto-viewed groups only group (default on). */
  autoView?(): boolean;
}

const FLAG = "__fastPr";

/**
 * Patches a parsed JSON value in place if it holds a changes route.
 * Returns null when it isn't one. Throws only if env throws (callers catch);
 * data is mutated only after everything has been computed.
 */
const changeTypeOf = (s: DiffSummary): string | null =>
  typeof s.changeType === "string" ? s.changeType : null;

export function patchChangesData(
  data: unknown,
  env: PatchEnv,
): { result: FastPrResult; fresh: boolean } | null {
  const found = findChangesRoute(data);
  if (!found) return null;
  const { key, route } = found;
  const bag = route as unknown as Record<string, unknown>;
  const existing = bag[FLAG] as FastPrResult | undefined;
  if (existing) return { result: existing, fresh: false };

  const id = prIdentity(route);
  if (!id) return null;
  const full = isFullDiff(route);
  const looked = env.configFor(id);
  const status: ConfigStatus = looked ? looked.cfg.status : "miss";
  const summaries = route.diffSummaries;

  let result: FastPrResult;
  if (looked && looked.cfg.status === "ok") {
    const groups = compileConfig(looked.cfg.config);
    const ordered = orderFiles(summaries, groups, ungroupedViewPriority(looked.cfg.config));
    const marking = full && (env.autoView?.() ?? true);
    const already = marking ? new Set(env.autoPaths(id)) : new Set<string>();
    const toMark: typeof summaries = [];
    const files: FastPrFile[] = ordered.map(({ file, group }) => {
      const auto = group?.autoViewed === true;
      let mark = false;
      let skipped = false;
      if (marking && auto && !file.markedAsViewed) {
        if (already.has(file.path)) skipped = true;
        else {
          mark = true;
          toMark.push(file);
        }
      }
      return {
        path: file.path,
        pathDigest: file.pathDigest,
        linesAdded: file.linesAdded,
        linesDeleted: file.linesDeleted,
        changeType: changeTypeOf(file),
        group: group ? group.name : null,
        groupIndex: group ? group.index : null,
        autoViewed: auto,
        originalViewed: file.markedAsViewed,
        markedByHook: mark,
        skippedUnviewed: skipped,
      };
    });
    result = {
      v: 1,
      routeKey: key,
      identity: id,
      fullDiff: full,
      configStatus: "ok",
      appliedHash: looked.cfg.hash,
      devConfig: looked.dev,
      files,
    };
    // Mutate last.
    const newOrder = ordered.map((o) => o.file);
    for (const f of toMark) f.markedAsViewed = true;
    route.diffSummaries = newOrder;
    const user = route.user;
    if (user && typeof user === "object" && typeof user.viewedFilesCount === "number") {
      user.viewedFilesCount = newOrder.filter((f) => f.markedAsViewed).length;
    }
  } else {
    result = {
      v: 1,
      routeKey: key,
      identity: id,
      fullDiff: full,
      configStatus: status,
      appliedHash: null,
      devConfig: looked?.dev === true,
      files: summaries.map((f) => ({
        path: f.path,
        pathDigest: f.pathDigest,
        linesAdded: f.linesAdded,
        linesDeleted: f.linesDeleted,
        changeType: changeTypeOf(f),
        group: null,
        groupIndex: null,
        autoViewed: false,
        originalViewed: f.markedAsViewed,
        markedByHook: false,
        skippedUnviewed: false,
      })),
    };
  }
  Object.defineProperty(route, FLAG, { value: result, enumerable: false });
  return { result, fresh: true };
}
