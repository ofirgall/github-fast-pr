import type { PrIdentity } from "../core/route";

export type ConfigStatus = "ok" | "none" | "invalid" | "miss";

export interface FastPrFile {
  path: string;
  pathDigest: string;
  linesAdded: number;
  linesDeleted: number;
  /** GitHub's diff summary changeType (ADDED, MODIFIED, RENAMED, REMOVED, ...); null if absent. */
  changeType: string | null;
  group: string | null;
  groupIndex: number | null;
  autoViewed: boolean;
  originalViewed: boolean;
  markedByHook: boolean;
  skippedUnviewed: boolean;
}

export interface FastPrResult {
  v: 1;
  routeKey: string;
  identity: PrIdentity;
  fullDiff: boolean;
  configStatus: ConfigStatus;
  appliedHash: string | null;
  devConfig: boolean;
  files: FastPrFile[];
}

export const RESULT_ATTR = "data-fast-pr";
export const RESULT_EVENT = "fast-pr:files";
