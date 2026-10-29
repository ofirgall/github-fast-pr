// ISOLATED-world content script at document_start: mirrors the menu's settings
// (chrome.storage.local) into github.com localStorage, where the data hook reads them.
import { cacheKeys, mirrorPlan, normalizeSettings, SETTINGS_KEY, type Settings } from "./core/settings";

export type SyncMessage = { type: "fast-pr:sync" } | { type: "fast-pr:clear-cache" };
export interface SyncReply { pathname: string; removed?: number }

function localKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k !== null && k.startsWith("fast-pr:")) keys.push(k);
  }
  return keys;
}

function apply(s: Settings): void {
  try {
    const plan = mirrorPlan(s, localKeys());
    for (const k of plan.remove) localStorage.removeItem(k);
    for (const [k, v] of plan.set) localStorage.setItem(k, v);
  } catch (e) {
    console.warn("[fast-pr] settings sync failed", e);
  }
}

async function load(): Promise<void> {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  apply(normalizeSettings(r[SETTINGS_KEY]));
}

void load();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SETTINGS_KEY]) apply(normalizeSettings(changes[SETTINGS_KEY].newValue));
});

chrome.runtime.onMessage.addListener((msg: SyncMessage, _sender, reply: (r: SyncReply) => void) => {
  if (msg?.type === "fast-pr:sync") {
    load().then(() => reply({ pathname: location.pathname }));
    return true;
  }
  if (msg?.type === "fast-pr:clear-cache") {
    let removed = 0;
    try {
      for (const k of cacheKeys(localKeys())) {
        localStorage.removeItem(k);
        removed++;
      }
    } catch (e) {
      console.warn("[fast-pr] clear cache failed", e);
    }
    reply({ pathname: location.pathname, removed });
  }
  return false;
});
