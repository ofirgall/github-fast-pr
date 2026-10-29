// "N / M viewed" progress in the changes page header, counting only files to review.
import type { FastPrResult } from "../shared/types";
import { el, fmt, isOwnMutation, markUi, SVG_NS, throttled } from "./dom";
import type { Mounted } from "./tree-ui";

const SR_RE = /^(\d+) of (\d+) files? viewed$/;
const CIRCUMFERENCE = 38; // GitHub's ring: r=6

export interface NativeProgress {
  container: HTMLElement;
  viewed: number;
  total: number;
}

/** GitHub's progress block, found by its screen-reader text "65 of 228 files viewed". */
export function findViewedProgress(root: ParentNode): NativeProgress | null {
  for (const s of root.querySelectorAll<HTMLElement>("span.sr-only")) {
    const m = SR_RE.exec((s.textContent ?? "").trim());
    const container = s.parentElement;
    if (m && container && !container.hasAttribute("data-fast-pr-ui")) {
      return { container, viewed: Number(m[1]), total: Number(m[2]) };
    }
  }
  return null;
}

/**
 * Files to review that are viewed, given GitHub's live count. Auto-viewed files that were
 * viewed when the page loaded are subtracted; later changes are assumed to be files to review.
 */
export function adjustedProgress(result: FastPrResult, native: { viewed: number; total: number }) {
  const auto = result.files.filter((f) => f.autoViewed);
  const autoViewed = auto.filter((f) => f.originalViewed || f.markedByHook).length;
  const total = native.total - auto.length;
  return { viewed: Math.min(total, Math.max(0, native.viewed - autoViewed)), total };
}

function ring(viewed: number, total: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("role", "presentation");
  svg.style.transform = "rotate(-90deg)";
  const circle = (stroke: string) => {
    const c = document.createElementNS(SVG_NS, "circle");
    for (const [k, v] of [["cx", "50%"], ["cy", "50%"], ["r", "6"], ["fill", "transparent"], ["stroke-width", "2"], ["stroke", stroke]]) {
      c.setAttribute(k, v);
    }
    return c;
  };
  const done = circle("var(--fgColor-done, #8250df)");
  done.setAttribute("stroke-dasharray", String(CIRCUMFERENCE));
  done.setAttribute("stroke-dashoffset", String(total > 0 ? CIRCUMFERENCE * (1 - viewed / total) : 0));
  done.setAttribute("stroke-linecap", "round");
  svg.append(circle("var(--borderColor-default, #d1d9e0)"), done);
  return svg;
}

/** Instant CSS tooltip (a native title takes about a second to show). */
function tip(e: HTMLElement, text: string): void {
  e.classList.add("fast-pr-tip");
  e.dataset.tip = text;
}

export function buildViewedProgress(
  adjusted: { viewed: number; total: number },
  native: { viewed: number; total: number },
): HTMLElement {
  const w = el("div", "fast-pr-viewed");
  markUi(w);
  w.dataset.sig = `${adjusted.viewed}/${adjusted.total}/${native.viewed}/${native.total}`;
  const text = el("span", "fast-pr-viewed-text");
  text.setAttribute("aria-hidden", "true");
  // Files to review on top; GitHub's full count below, smaller (like the +/- summary).
  const top = el("span", "fast-pr-viewed-top");
  top.append(
    el("span", "fast-pr-viewed-num", fmt(adjusted.viewed)),
    " / ",
    el("span", "fast-pr-viewed-num", fmt(adjusted.total)),
    " ",
    el("span", "fast-pr-viewed-label", "viewed"),
  );
  tip(top, "Files to review viewed (auto-viewed files left out)");
  const orig = el("span", "fast-pr-viewed-orig", `(${fmt(native.viewed)} / ${fmt(native.total)})`);
  const auto = native.total - adjusted.total;
  tip(orig, `All files: ${fmt(native.viewed)} of ${fmt(native.total)} viewed, including ${fmt(auto)} auto-viewed`);
  text.append(top, orig);
  w.append(
    ring(adjusted.viewed, adjusted.total),
    text,
    el("span", "sr-only", `${adjusted.viewed} of ${adjusted.total} files to review viewed`),
  );
  return w;
}

export function mountViewedProgress(result: FastPrResult): Mounted {
  let hidden: HTMLElement | null = null;
  const ours = () => hidden?.nextElementSibling?.classList.contains("fast-pr-viewed") ? (hidden.nextElementSibling as HTMLElement) : null;

  const render = () => {
    const n = findViewedProgress(document);
    if (!n) return;
    // Only when GitHub counts the same files the hook saw (full diff of this PR).
    if (n.total !== result.files.length) return;
    if (hidden && hidden !== n.container) {
      ours()?.remove();
      hidden.classList.remove("fast-pr-native-hidden");
    }
    hidden = n.container;
    const adjusted = adjustedProgress(result, n);
    const mine = ours();
    const sig = `${adjusted.viewed}/${adjusted.total}/${n.viewed}/${n.total}`;
    if (!mine || mine.dataset.sig !== sig) {
      mine?.remove();
      const w = buildViewedProgress(adjusted, n);
      // GitHub's own classes too, e.g. hiding the block on narrow screens.
      n.container.classList.forEach((c) => c !== "fast-pr-native-hidden" && w.classList.add(c));
      n.container.after(w);
    }
    n.container.classList.add("fast-pr-native-hidden");
  };
  const sched = throttled(render, 50);
  const mo = new MutationObserver((muts) => {
    if (muts.every(isOwnMutation)) return;
    sched.call();
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  render();

  return {
    destroy() {
      mo.disconnect();
      sched.cancel();
      ours()?.remove();
      hidden?.classList.remove("fast-pr-native-hidden");
    },
  };
}
