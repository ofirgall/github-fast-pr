export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Coalesce rapid calls into one trailing call. */
export function debounced(fn: () => void, ms: number): { call(): void; cancel(): void } {
  let t: ReturnType<typeof setTimeout> | null = null;
  return {
    call() {
      if (t !== null) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        fn();
      }, ms);
    },
    cancel() {
      if (t !== null) clearTimeout(t);
      t = null;
    },
  };
}

/** Marker on every element we inject, so observers can ignore their own DOM changes. */
export const UI_ATTR = "data-fast-pr-ui";

export function markUi<T extends Element>(e: T): T {
  e.setAttribute(UI_ATTR, "");
  return e;
}

const isUiNode = (n: Node): boolean =>
  n.nodeType === 1 && (n as Element).closest?.(`[${UI_ATTR}]`) != null;

/** True when a mutation was caused solely by our own injected UI. */
export function isOwnMutation(m: MutationRecord): boolean {
  const t = m.target;
  const target = t.nodeType === 1 ? (t as Element) : t.parentElement;
  if (target?.closest?.(`[${UI_ATTR}]`)) return true;
  if (m.type !== "childList") return false;
  const changed = [...m.addedNodes, ...m.removedNodes];
  return changed.length > 0 && changed.every((n) => n.nodeType === 1 && (isUiNode(n) || (n as Element).hasAttribute(UI_ATTR)));
}

/** Run fn at most maxWaitMs after the first pending call; further calls coalesce (never starves). */
export function throttled(fn: () => void, maxWaitMs: number): { call(): void; cancel(): void } {
  let t: ReturnType<typeof setTimeout> | null = null;
  return {
    call() {
      if (t !== null) return;
      t = setTimeout(() => {
        t = null;
        fn();
      }, maxWaitMs);
    },
    cancel() {
      if (t !== null) clearTimeout(t);
      t = null;
    },
  };
}

export const SVG_NS = "http://www.w3.org/2000/svg";
export function icon(path: string, cls?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  if (cls) svg.setAttribute("class", cls);
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", path);
  svg.append(p);
  return svg;
}

export const fmt = (n: number): string => n.toLocaleString("en-US");
