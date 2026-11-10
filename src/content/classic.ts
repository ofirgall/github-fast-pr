// GitHub's classic (server-rendered) "Files changed" page, at /pull/N/files. The newer React
// view lives at /pull/N/changes; users pick one, and GitHub redirects the other URL to it.
import type { PrIdentity } from "../core/route";
import type { PageInfo } from "./router";

/** A changed file, shaped like the React view's diff summary. */
export interface ClassicSummary {
  path: string;
  pathDigest: string;
  linesAdded: number;
  linesDeleted: number;
  markedAsViewed: boolean;
  changeType: string | null;
}

export interface ClassicPage {
  identity: PrIdentity;
  /** The "Jump to…" menu fragment: every file with its +/- counts. */
  tocUrl: string | null;
  /** Every changed file in GitHub's order (from the file tree, else the loaded diffs). */
  files: { path: string; pathDigest: string; changeType: string | null }[];
}

/** Octicon titles in the classic tree and jump menu -> the React view's changeType. */
const CHANGE_TYPES: Record<string, string> = {
  added: "ADDED",
  modified: "MODIFIED",
  removed: "REMOVED",
  deleted: "REMOVED",
  renamed: "RENAMED",
  moved: "RENAMED",
  copied: "COPIED",
};

function changeTypeIn(e: Element): string | null {
  for (const svg of e.querySelectorAll("svg[title]")) {
    const t = CHANGE_TYPES[(svg.getAttribute("title") ?? "").toLowerCase()];
    if (t) return t;
  }
  return null;
}

const DIGEST_RE = /diff-([0-9a-f]{64})$/;

const num = (s: string | null | undefined): number => Number((s ?? "").replace(/[^0-9]/g, "")) || 0;

const inputValue = (root: ParentNode, name: string): string =>
  root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? "";

/** True when this document is the classic files page (not the React changes view). */
export function isClassicFilesDoc(root: ParentNode): boolean {
  return !!root.querySelector("#files.js-diff-container, .js-diff-progressive-container");
}

/** Identity and file list of a classic files page; null when it isn't one. */
export function parseClassicPage(root: ParentNode, page: PageInfo): ClassicPage | null {
  if (!isClassicFilesDoc(root)) return null;
  const headSha = inputValue(root, "head_sha") || inputValue(root, "comparison_end_oid");
  const baseBranch = root.querySelector(".base-ref")?.textContent?.trim() ?? "";
  if (!/^[0-9a-f]{40}$/.test(headSha) || !baseBranch) return null;

  const files: ClassicPage["files"] = [];
  const seen = new Set<string>();
  const add = (pathDigest: string, path: string, changeType: string | null) => {
    if (!path || seen.has(pathDigest)) return;
    seen.add(pathDigest);
    files.push({ path, pathDigest, changeType });
  };
  for (const li of root.querySelectorAll<HTMLElement>('file-tree li[data-tree-entry-type="file"]')) {
    const m = DIGEST_RE.exec(li.id);
    const path = li.querySelector("[data-filterable-item-text]")?.textContent?.trim() ?? "";
    if (m) add(m[1], path, changeTypeIn(li));
  }
  // No tree (it can be turned off): the diffs on the page, which may not be all of them yet.
  if (files.length === 0) {
    for (const f of root.querySelectorAll<HTMLElement>("div.file[data-tagsearch-path]")) {
      const m = DIGEST_RE.exec(f.id);
      if (m) add(m[1], f.dataset.tagsearchPath ?? "", null);
    }
  }
  const toc = root.querySelector('[src*="/show_toc"]')?.getAttribute("src") ?? null;
  return {
    identity: { owner: page.owner, repo: page.repo, number: page.number, headSha, baseBranch },
    tocUrl: toc,
    files,
  };
}

/** Per-file counts and change type from the jump menu's HTML, by path digest. */
export function parseToc(root: ParentNode): Map<string, { added: number; deleted: number; changeType: string | null }> {
  const out = new Map<string, { added: number; deleted: number; changeType: string | null }>();
  for (const a of root.querySelectorAll<HTMLAnchorElement>("a.js-jump-to-menu-item")) {
    const m = DIGEST_RE.exec(a.getAttribute("href") ?? "");
    if (!m) continue;
    out.set(m[1], {
      added: num(a.querySelector(".diffstat .color-fg-success")?.textContent),
      deleted: num(a.querySelector(".diffstat .color-fg-danger")?.textContent),
      changeType: changeTypeIn(a),
    });
  }
  return out;
}

/** "18 changes: 18 additions & 0 deletions" in a classic diff header. */
const HEADER_RE = /([\d,]+) additions? & ([\d,]+) deletions?/;

/** Counts from the diffs already on the page, for files the jump menu left out. */
export function headerCounts(root: ParentNode): Map<string, { added: number; deleted: number }> {
  const out = new Map<string, { added: number; deleted: number }>();
  for (const f of root.querySelectorAll<HTMLElement>("div.file[data-tagsearch-path]")) {
    const d = DIGEST_RE.exec(f.id);
    const sr = [...f.querySelectorAll(".file-info .sr-only")].map((s) => s.textContent ?? "").find((t) => HEADER_RE.test(t));
    const m = sr ? HEADER_RE.exec(sr) : null;
    if (d && m) out.set(d[1], { added: num(m[1]), deleted: num(m[2]) });
  }
  return out;
}

/** The file's Viewed checkbox; GitHub replaces it after every toggle, so look it up fresh. */
export function viewedCheckbox(file: Element): HTMLInputElement | null {
  return file.querySelector<HTMLInputElement>("input.js-reviewed-checkbox");
}

/** Viewed state of every diff on the page, by path. Files not loaded yet are absent. */
export function viewedOnPage(root: ParentNode): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const f of root.querySelectorAll<HTMLElement>("div.file[data-tagsearch-path]")) {
    const cb = viewedCheckbox(f);
    if (cb) out.set(f.dataset.tagsearchPath ?? "", cb.checked);
  }
  return out;
}

/** Summaries for every file: counts from the jump menu, else the diff headers on the page. */
export function classicSummaries(
  page: ClassicPage,
  toc: ReturnType<typeof parseToc>,
  headers: ReturnType<typeof headerCounts>,
  viewed: Map<string, boolean>,
): ClassicSummary[] {
  return page.files.map((f) => {
    const t = toc.get(f.pathDigest);
    const h = headers.get(f.pathDigest);
    return {
      path: f.path,
      pathDigest: f.pathDigest,
      linesAdded: t?.added ?? h?.added ?? 0,
      linesDeleted: t?.deleted ?? h?.deleted ?? 0,
      markedAsViewed: viewed.get(f.path) ?? false,
      changeType: f.changeType ?? t?.changeType ?? null,
    };
  });
}

export async function fetchToc(url: string): Promise<ReturnType<typeof parseToc>> {
  const res = await fetch(url, { credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for jump menu`);
  return parseToc(new DOMParser().parseFromString(await res.text(), "text/html"));
}

/**
 * For the conversation page when the user is on the classic experience: read the classic
 * files page for the file list, and its jump menu for counts. Null when /files is not classic.
 */
export async function fetchClassicSummaries(page: PageInfo): Promise<{ identity: PrIdentity; summaries: ClassicSummary[] } | null> {
  const res = await fetch(`/${page.owner}/${page.repo}/pull/${page.number}/files`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for classic files page`);
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");
  const parsed = parseClassicPage(doc, page);
  if (!parsed) return null;
  const toc = parsed.tocUrl ? await fetchToc(parsed.tocUrl) : new Map();
  return { identity: parsed.identity, summaries: classicSummaries(parsed, toc, headerCounts(doc), new Map()) };
}
