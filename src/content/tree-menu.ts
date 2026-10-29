// Right-click menu for tree rows, styled like Primer's ActionMenu.
import { el, markUi } from "./dom";

export interface MenuItem {
  label: string;
  onSelect: () => void;
}

let current: { close(refocus: boolean): void } | null = null;

/** Open a menu at the pointer for `owner` (a tree row); focus returns to it on close. */
export function openTreeMenu(owner: HTMLElement, at: { x: number; y: number }, items: MenuItem[]): void {
  current?.close(false);
  const menu = el("ul", "fast-pr-menu");
  markUi(menu);
  menu.setAttribute("role", "menu");
  const buttons = items.map((item) => {
    const li = el("li", "fast-pr-menu-item", item.label);
    li.setAttribute("role", "menuitem");
    li.tabIndex = -1;
    li.addEventListener("click", () => pick(item));
    menu.append(li);
    return li;
  });

  const onDown = (e: Event) => {
    if (!menu.contains(e.target as Node)) close(false);
  };
  const onScroll = (e: Event) => {
    if (!menu.contains(e.target as Node)) close(false);
  };
  const onBlur = () => close(false);

  function close(refocus: boolean): void {
    if (current !== handle) return;
    current = null;
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("resize", onBlur);
    menu.remove();
    if (refocus) owner.focus();
  }
  function pick(item: MenuItem): void {
    close(true);
    item.onSelect();
  }
  const handle = { close };
  current = handle;

  menu.addEventListener("keydown", (e) => {
    const i = buttons.indexOf(e.target as HTMLLIElement);
    const move = (d: number) => buttons[(i + d + buttons.length) % buttons.length]?.focus();
    switch (e.key) {
      case "ArrowDown": move(1); break;
      case "ArrowUp": move(-1); break;
      case "Home": buttons[0]?.focus(); break;
      case "End": buttons[buttons.length - 1]?.focus(); break;
      case "Enter":
      case " ":
        if (i >= 0) pick(items[i]);
        break;
      case "Escape":
      case "Tab":
        close(true);
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  });
  menu.addEventListener("contextmenu", (e) => e.preventDefault());

  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(0, Math.min(at.x, window.innerWidth - r.width - 4))}px`;
  menu.style.top = `${Math.max(0, Math.min(at.y, window.innerHeight - r.height - 4))}px`;
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("scroll", onScroll, true);
  window.addEventListener("blur", onBlur);
  window.addEventListener("resize", onBlur);
  buttons[0]?.focus();
}
