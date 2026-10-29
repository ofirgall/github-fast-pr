// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { openTreeMenu } from "../../src/content/tree-menu";

const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
const menu = () => document.querySelector<HTMLElement>(".fast-pr-menu");
const items = () => [...document.querySelectorAll<HTMLElement>('.fast-pr-menu [role="menuitem"]')];

let row: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<ul><li tabindex="0" id="row">x</li></ul><button id="out">out</button>';
  row = document.getElementById("row")!;
  row.focus();
});

describe("openTreeMenu", () => {
  it("renders items at the pointer and focuses the first one", () => {
    openTreeMenu(row, { x: 30, y: 40 }, [
      { label: "One", onSelect: () => {} },
      { label: "Two", onSelect: () => {} },
    ]);
    expect(menu()!.getAttribute("role")).toBe("menu");
    expect(menu()!.style.left).toBe("30px");
    expect(menu()!.style.top).toBe("40px");
    expect(menu()!.hasAttribute("data-fast-pr-ui")).toBe(true);
    expect(items().map((i) => i.textContent)).toEqual(["One", "Two"]);
    expect(document.activeElement).toBe(items()[0]);
  });

  it("arrow keys move, Enter picks, and focus returns to the row", () => {
    const one = vi.fn();
    const two = vi.fn();
    openTreeMenu(row, { x: 0, y: 0 }, [
      { label: "One", onSelect: one },
      { label: "Two", onSelect: two },
    ]);
    key(items()[0], "ArrowDown");
    expect(document.activeElement).toBe(items()[1]);
    key(items()[1], "ArrowDown");
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], "ArrowUp");
    key(items()[1], "Enter");
    expect(two).toHaveBeenCalledOnce();
    expect(one).not.toHaveBeenCalled();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it("click picks an item", () => {
    const one = vi.fn();
    openTreeMenu(row, { x: 0, y: 0 }, [{ label: "One", onSelect: one }]);
    items()[0].click();
    expect(one).toHaveBeenCalledOnce();
    expect(menu()).toBeNull();
  });

  it("closes on Escape and on a pointerdown outside, without picking", () => {
    const one = vi.fn();
    openTreeMenu(row, { x: 0, y: 0 }, [{ label: "One", onSelect: one }]);
    key(items()[0], "Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(row);
    openTreeMenu(row, { x: 0, y: 0 }, [{ label: "One", onSelect: one }]);
    document.getElementById("out")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(menu()).toBeNull();
    expect(one).not.toHaveBeenCalled();
  });

  it("keeps only one menu open", () => {
    openTreeMenu(row, { x: 0, y: 0 }, [{ label: "One", onSelect: () => {} }]);
    openTreeMenu(row, { x: 0, y: 0 }, [{ label: "Two", onSelect: () => {} }]);
    expect(document.querySelectorAll(".fast-pr-menu")).toHaveLength(1);
    expect(items()[0].textContent).toBe("Two");
  });

  it("clamps to the viewport", () => {
    openTreeMenu(row, { x: window.innerWidth + 500, y: window.innerHeight + 500 }, [{ label: "One", onSelect: () => {} }]);
    expect(parseFloat(menu()!.style.left)).toBeLessThanOrEqual(window.innerWidth);
    expect(parseFloat(menu()!.style.top)).toBeLessThanOrEqual(window.innerHeight);
  });
});
