// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { compileConfig, parseConfig } from "../../src/core/config";
import { computeDiffstat } from "../../src/core/diffstat";
import { buildWidget, createDiffstatController, findNativeDiffstat, HIDE_DELAY_MS } from "../../src/content/diffstat-ui";

const NATIVE = `<div data-component="PH_Navigation"><div class="d-flex flex-items-center gap-1" id="stat"><span aria-hidden="true" class="f6 fgColor-success text-bold">+28,358</span><span aria-hidden="true" class="f6 fgColor-danger text-bold">-199</span><span class="sr-only">Lines changed: 28358 additions &amp; 199 deletions</span><div class="d-flex" id="squares"><span>■</span></div></div></div>`;

const cfg = parseConfig(JSON.stringify({ groups: [{ name: "Src", paths: ["^src/"] }, { name: "Gen", paths: ["gen"], autoViewed: true }] }));
if (!cfg.ok) throw new Error();
const stat = computeDiffstat(
  [
    { path: "src/a.ts", linesAdded: 1200, linesDeleted: 10 },
    { path: "gen/x.ts", linesAdded: 30000, linesDeleted: 100 },
    { path: "other", linesAdded: 5, linesDeleted: 1 },
  ],
  compileConfig(cfg.config),
);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  document.body.innerHTML = NATIVE;
});

describe("diffstat widget", () => {
  it("finds the native container", () => {
    const n = findNativeDiffstat(document)!;
    expect(n.container.id).toBe("stat");
    expect(n.numbers.map((x) => x.textContent)).toEqual(["+28,358", "-199"]);
    expect(n.squares!.id).toBe("squares");
    expect(findNativeDiffstat(document.createElement("div"))).toBeNull();
  });

  it("builds adjusted/original lines and a per-group popover", () => {
    const w = buildWidget(stat);
    expect(w.querySelector(".fast-pr-ds-top .fast-pr-add")!.textContent).toBe("+1,205");
    expect(w.querySelector(".fast-pr-ds-top .fast-pr-del")!.textContent).toBe("-11");
    expect(w.querySelector(".fast-pr-ds-orig")!.textContent).toBe("(+31,205 -111)");
    const rows = [...w.querySelectorAll("tr")].slice(1).map((r) => r.textContent);
    expect(rows).toEqual([
      "To review+1,205-112",
      "Src+1,200-101",
      "Ungrouped+5-11",
      "Auto-viewed+30,000-1001",
      "Gen+30,000-1001",
    ]);
    expect([...w.querySelectorAll("tr.fast-pr-section td:first-child")].map((t) => t.textContent)).toEqual([
      "To review",
      "Auto-viewed",
    ]);
    const btn = w.querySelector<HTMLButtonElement>("button.fast-pr-info")!;
    expect(btn.getAttribute("aria-label")).toBe("Line breakdown by group");
  });

  it("omits an empty section", () => {
    const noAuto = { ...stat, rows: stat.rows.filter((r) => !r.autoViewed) };
    const w = buildWidget(noAuto);
    expect([...w.querySelectorAll("tr.fast-pr-section")].map((t) => t.firstChild!.textContent)).toEqual(["To review"]);
  });

  it("popover opens on hover and focus, closes on blur / Escape", () => {
    vi.useFakeTimers();
    document.body.append(buildWidget(stat));
    const wrap = document.querySelector<HTMLElement>(".fast-pr-info-wrap")!;
    const btn = wrap.querySelector<HTMLButtonElement>("button")!;
    const pop = wrap.querySelector<HTMLElement>(".fast-pr-popover")!;
    expect(pop.hidden).toBe(true);
    wrap.dispatchEvent(new MouseEvent("mouseenter"));
    expect(pop.hidden).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    // Leaving starts a grace period; re-entering (pointer moved into the popover) cancels it.
    wrap.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(HIDE_DELAY_MS - 50);
    expect(pop.hidden).toBe(false);
    wrap.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(HIDE_DELAY_MS);
    expect(pop.hidden).toBe(false);
    wrap.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(HIDE_DELAY_MS);
    expect(pop.hidden).toBe(true);
    vi.useRealTimers();
    btn.dispatchEvent(new FocusEvent("focus"));
    expect(pop.hidden).toBe(false);
    btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(pop.hidden).toBe(true);
    btn.dispatchEvent(new FocusEvent("focus"));
    btn.dispatchEvent(new FocusEvent("blur"));
    expect(pop.hidden).toBe(true);
  });

  it("controller hides native numbers (not sr-only), inserts before squares, destroy restores", () => {
    const c = createDiffstatController(() => {});
    c.set(stat);
    const container = document.getElementById("stat")!;
    const w = container.querySelector(".fast-pr-diffstat")!;
    expect(w.nextElementSibling!.id).toBe("squares");
    expect(container.querySelectorAll(".fast-pr-native-hidden")).toHaveLength(2);
    expect(container.querySelector(".sr-only")!.classList.contains("fast-pr-native-hidden")).toBe(false);
    c.destroy();
    expect(container.querySelector(".fast-pr-diffstat")).toBeNull();
    expect(container.querySelectorAll(".fast-pr-native-hidden")).toHaveLength(0);
  });

  it("re-inserts after React re-render, without duplicating", async () => {
    const c = createDiffstatController(() => {});
    c.set(stat);
    document.body.innerHTML = NATIVE; // re-render wipes our widget
    expect(document.querySelector(".fast-pr-diffstat")).toBeNull();
    await wait(120);
    expect(document.querySelectorAll(".fast-pr-diffstat")).toHaveLength(1);
    expect(document.querySelectorAll(".fast-pr-native-hidden")).toHaveLength(2);
    c.destroy();
  });

  it("set(null) touches nothing", () => {
    const before = document.body.innerHTML;
    const c = createDiffstatController(() => {});
    c.set(null);
    expect(document.body.innerHTML).toBe(before);
    c.destroy();
  });

  it("loading shows a spinner beside the native numbers, then set() replaces it", () => {
    const c = createDiffstatController(() => {});
    c.loading();
    const container = document.getElementById("stat")!;
    const spin = container.querySelector(".fast-pr-ds-loading")!;
    expect(spin.querySelector(".fast-pr-spinner")).not.toBeNull();
    expect(spin.nextElementSibling!.id).toBe("squares");
    expect(container.querySelectorAll(".fast-pr-native-hidden")).toHaveLength(0);
    c.set(stat);
    expect(container.querySelector(".fast-pr-ds-loading")).toBeNull();
    expect(container.querySelectorAll(".fast-pr-diffstat")).toHaveLength(1);
    expect(container.querySelectorAll(".fast-pr-native-hidden")).toHaveLength(2);
    c.destroy();
  });

  it("loading then set(null) restores the native diffstat exactly", () => {
    const before = document.body.innerHTML;
    const c = createDiffstatController(() => {});
    c.loading();
    c.set(null);
    expect(document.body.innerHTML).toBe(before);
    c.destroy();
  });

  it("Files changed counter shows files to review with the full count muted", () => {
    const tab = `<a id="prs-files-anchor-tab">Files changed<span aria-hidden="true" data-variant="secondary" data-component="CounterLabel" class="ml-2 pill">3</span><span class="vh">&nbsp;(3)</span></a>`;
    document.body.insertAdjacentHTML("afterbegin", tab);
    const before = document.body.innerHTML;
    const c = createDiffstatController(() => {});
    c.set(stat);
    const native = document.querySelector('[data-component="CounterLabel"]')!;
    const mine = native.nextElementSibling as HTMLElement;
    expect(native.classList.contains("fast-pr-native-hidden")).toBe(true);
    expect(mine.classList.contains("fast-pr-files-count")).toBe(true);
    expect(mine.classList.contains("pill")).toBe(true);
    expect(mine.textContent).toBe("2 (3)");
    expect(mine.querySelector(".fast-pr-files-orig")!.textContent).toBe("(3)");
    c.destroy();
    expect(document.body.innerHTML).toBe(before);
  });

  it("notifies when native text changes", async () => {
    const cb = vi.fn();
    const c = createDiffstatController(cb);
    c.set(stat);
    document.querySelector(".sr-only")!.textContent = "Lines changed: 5 additions & 1 deletions";
    await wait(120);
    expect(cb).toHaveBeenCalledTimes(1);
    c.destroy();
  });
});
