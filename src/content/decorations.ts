import type { FastPrFile, FastPrResult } from "../shared/types";
import { el, isOwnMutation, markUi, throttled } from "./dom";
import type { Mounted } from "./tree-ui";

const ROW = "[data-path-digest][data-index]";
const LIST = '[data-testid="virtualized-diffs-list"]';

export function labelText(f: FastPrFile): string {
  return f.group ?? "Ungrouped";
}

export function groupStarts(files: FastPrFile[]): Set<string> {
  const starts = new Set<string>();
  let prev: string | null | undefined = undefined;
  let prevIdx: number | null | undefined = undefined;
  for (const f of files) {
    if (prev === undefined || f.group !== prev || f.groupIndex !== prevIdx) starts.add(f.pathDigest);
    prev = f.group;
    prevIdx = f.groupIndex;
  }
  return starts;
}

export function decorateRows(root: ParentNode, files: FastPrFile[], starts: Set<string>): void {
  const byDigest = new Map(files.map((f) => [f.pathDigest, f]));
  const scope = root.querySelector(LIST) ?? root;
  for (const row of scope.querySelectorAll<HTMLElement>(ROW)) {
    const digest = row.getAttribute("data-path-digest") ?? "";
    const file = byDigest.get(digest);
    // group label
    let label = row.querySelector<HTMLElement>(":scope > .fast-pr-group-label");
    const want = file !== undefined && starts.has(digest);
    if (label && (!want || label.dataset.digest !== digest || label.dataset.text !== labelText(file!))) {
      label.remove();
      label = null;
    }
    if (want && !label) {
      label = el("div", "fast-pr-group-label");
      markUi(label);
      label.dataset.digest = digest;
      label.dataset.text = labelText(file!);
      label.append(el("span", "fast-pr-group-name", labelText(file!)));
      if (file!.autoViewed) label.append(el("span", "fast-pr-pill", "auto-viewed"));
      row.prepend(label);
    }
    // hint
    const header = row.querySelector<HTMLElement>("[data-diff-header-wrapper]");
    if (!header) continue;
    let hint = header.querySelector<HTMLElement>(".fast-pr-auto-hint");
    const wantHint = file !== undefined && file.autoViewed;
    const text = wantHint ? `Auto-viewed: ${labelText(file!)}` : "";
    if (hint && (!wantHint || hint.textContent !== text)) {
      hint.remove();
      hint = null;
    }
    if (wantHint && !hint) {
      hint = el("span", "fast-pr-auto-hint", text);
      markUi(hint);
      const h3 = header.querySelector("h3");
      if (h3 && h3.parentNode) h3.after(hint);
      else header.append(hint);
    }
  }
}

export function mountDecorations(result: FastPrResult): Mounted {
  const starts = groupStarts(result.files);
  const run = () => decorateRows(document, result.files, starts);
  const sched = throttled(run, 50);
  const mo = new MutationObserver((muts) => {
    if (muts.every(isOwnMutation)) return;
    sched.call();
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-path-digest"] });
  run();
  return {
    destroy() {
      mo.disconnect();
      sched.cancel();
      document.querySelectorAll(".fast-pr-group-label, .fast-pr-auto-hint").forEach((n) => n.remove());
    },
  };
}
