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

/** MAIN world -> content script: GitHub marked a file viewed or not viewed. Detail is JSON. */
export const VIEWED_EVENT = "fast-pr:viewed";
export interface ViewedChange {
  owner: string;
  repo: string;
  number: number;
  path: string;
  viewed: boolean;
}

/**
 * Content script -> MAIN world: our own requests changed these files on the server; update
 * GitHub's in-page state to match. Detail is JSON `{ paths, viewed }`. The MAIN world answers
 * synchronously with APPLY_VIEWED_DONE_EVENT, detail "1" when GitHub's store was updated.
 */
export const APPLY_VIEWED_EVENT = "fast-pr:apply-viewed";
export const APPLY_VIEWED_DONE_EVENT = "fast-pr:apply-viewed-done";
export interface ApplyViewed {
  paths: string[];
  viewed: boolean;
}
