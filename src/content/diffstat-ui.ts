import type { Diffstat } from "../core/diffstat";
import { el, fmt, isOwnMutation, markUi, throttled } from "./dom";

export interface Native {
  container: HTMLElement;
  srOnly: HTMLElement;
  numbers: HTMLElement[];
  squares: HTMLElement | null;
}

export function findNativeDiffstat(root: ParentNode): Native | null {
  const scope = root.querySelector('[data-component="PH_Navigation"]') ?? root;
  for (const s of scope.querySelectorAll<HTMLElement>("span.sr-only")) {
    if (!(s.textContent ?? "").trim().startsWith("Lines changed:")) continue;
    const container = s.parentElement;
    if (!container) continue;
    const kids = [...container.children] as HTMLElement[];
    return {
      container,
      srOnly: s,
      numbers: kids.filter(
        (c) => c.tagName === "SPAN" && c !== s && !c.classList.contains("sr-only") && !c.classList.contains("fast-pr-diffstat"),
      ),
      squares: kids.find((c) => c.tagName === "DIV") ?? null,
    };
  }
  return null;
}

const signed = (sign: string, n: number) => `${sign}${fmt(n)}`;

export function buildWidget(stat: Diffstat): HTMLElement {
  const w = el("span", "fast-pr-diffstat");
  markUi(w);
  w.dataset.sig = JSON.stringify(stat);

  const top = el("span", "fast-pr-ds-top");
  top.append(
    el("span", "fast-pr-add", signed("+", stat.adjusted.added)),
    el("span", "fast-pr-del", signed("-", stat.adjusted.deleted)),
  );
  const wrap = el("span", "fast-pr-info-wrap");
  const btn = el("button", "fast-pr-info", "ⓘ");
  btn.type = "button";
  btn.setAttribute("aria-label", "Line breakdown by group");
  btn.setAttribute("aria-expanded", "false");
  const pop = el("div", "fast-pr-popover");
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Line breakdown by group");
  pop.hidden = true;
  const table = el("table", "fast-pr-table");
  const head = el("tr");
  for (const h of ["Group", "Added", "Deleted", "Files"]) head.append(el("th", undefined, h));
  table.append(head);
  for (const r of stat.rows) {
    const tr = el("tr");
    const name = el("td", "fast-pr-cell-name", r.name);
    if (r.autoViewed) name.append(" ", el("span", "fast-pr-pill", "auto-viewed"));
    tr.append(
      name,
      el("td", "fast-pr-add", signed("+", r.added)),
      el("td", "fast-pr-del", signed("-", r.deleted)),
      el("td", undefined, fmt(r.files)),
    );
    table.append(tr);
  }
  pop.append(table);
  wrap.append(btn, pop);
  top.append(wrap);

  const orig = el("span", "fast-pr-ds-orig");
  orig.append(
    "(",
    el("span", "fast-pr-add", signed("+", stat.original.added)),
    " ",
    el("span", "fast-pr-del", signed("-", stat.original.deleted)),
    ")",
  );
  orig.title = "Original totals, including auto-viewed files";
  w.append(top, orig);

  const show = (v: boolean) => {
    pop.hidden = !v;
    btn.setAttribute("aria-expanded", String(v));
  };
  wrap.addEventListener("mouseenter", () => show(true));
  wrap.addEventListener("mouseleave", () => show(false));
  btn.addEventListener("focus", () => show(true));
  btn.addEventListener("blur", () => show(false));
  btn.addEventListener("click", () => show(pop.hidden));
  wrap.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") show(false);
  });
  return w;
}

/** Placeholder shown next to the native numbers while grouped counts are computed. */
export function buildSpinner(): HTMLElement {
  const w = el("span", "fast-pr-diffstat fast-pr-ds-loading");
  markUi(w);
  w.dataset.sig = "loading";
  w.setAttribute("role", "status");
  w.title = "Fast PR: computing grouped line counts";
  w.append(el("span", "fast-pr-spinner"), el("span", "sr-only", "Computing grouped line counts"));
  return w;
}

export interface DiffstatController {
  set(stat: Diffstat | null): void;
  /** Show the spinner until the next set(). */
  loading(): void;
  destroy(): void;
}

export function createDiffstatController(onNativeChange: () => void): DiffstatController {
  let stat: Diffstat | null = null;
  let isLoading = false;
  let nativeText: string | null = null;

  const existingWidget = (n: Native) =>
    ([...n.container.children] as HTMLElement[]).find((c) => c.classList.contains("fast-pr-diffstat"));

  const cleanup = (n: Native | null) => {
    if (!n) return;
    existingWidget(n)?.remove();
    n.numbers.forEach((x) => x.classList.remove("fast-pr-native-hidden"));
  };

  const render = () => {
    const n = findNativeDiffstat(document);
    if (!n) return;
    const text = n.srOnly.textContent ?? "";
    if (nativeText === null) nativeText = text;
    else if (text !== nativeText) {
      nativeText = text;
      onNativeChange();
    }
    if (!stat && !isLoading) {
      cleanup(n);
      return;
    }
    const sig = stat ? JSON.stringify(stat) : "loading";
    let w = existingWidget(n);
    if (!w || w.dataset.sig !== sig) {
      w?.remove();
      w = stat ? buildWidget(stat) : buildSpinner();
      if (n.squares) n.container.insertBefore(w, n.squares);
      else n.container.append(w);
    }
    // Native numbers stay visible next to the spinner; the widget replaces them.
    n.numbers.forEach((x) => x.classList.toggle("fast-pr-native-hidden", stat !== null));
  };
  const sched = throttled(render, 50);
  const mo = new MutationObserver((muts) => {
    if (muts.every(isOwnMutation)) return;
    sched.call();
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });

  return {
    set(s) {
      stat = s;
      isLoading = false;
      const n = findNativeDiffstat(document);
      nativeText = n ? (n.srOnly.textContent ?? "") : null;
      render();
    },
    loading() {
      stat = null;
      isLoading = true;
      render();
    },
    destroy() {
      mo.disconnect();
      sched.cancel();
      cleanup(findNativeDiffstat(document));
    },
  };
}
