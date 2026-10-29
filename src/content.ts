// ISOLATED-world content script: config loading, PR page UI, auto-viewed persistence.
import { classifyPath } from "./content/router";
import { startChangesPage, startConversationPage, type Teardown } from "./content/pages";
import { debug } from "./content/log";
import { RESULT_EVENT } from "./shared/types";

let currentKey: string | null = null;
let teardown: Teardown | null = null;

function sync(): void {
  const key = location.pathname;
  if (key === currentKey) return;
  currentKey = key;
  try {
    teardown?.();
  } catch (e) {
    console.warn("[fast-pr] teardown error", e);
  }
  teardown = null;
  const page = classifyPath(key);
  if (page.kind === "none") return;
  debug("page", page.kind, key);
  try {
    teardown = page.kind === "changes" ? startChangesPage(page) : startConversationPage(page);
  } catch (e) {
    console.warn("[fast-pr] start error", e);
  }
}

const nav = (globalThis as unknown as { navigation?: EventTarget }).navigation;
nav?.addEventListener("navigatesuccess", sync);
window.addEventListener("popstate", sync);
document.addEventListener(RESULT_EVENT, sync);
setInterval(sync, 500);
sync();
