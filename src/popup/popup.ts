// Extension menu (toolbar popup and options page): debug toggle and the local config.
import { parseConfig } from "../core/config";
import { DEFAULT_SETTINGS, normalizeSettings, SETTINGS_KEY, type Settings } from "../core/settings";
import type { SyncMessage, SyncReply } from "../settings-sync";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const debugBox = $<HTMLInputElement>("debug");
const collapseBox = $<HTMLInputElement>("collapse-groups");
const configInput = $<HTMLTextAreaElement>("config");
const validation = $<HTMLParagraphElement>("validation");
const saveBtn = $<HTMLButtonElement>("save");
const removeBtn = $<HTMLButtonElement>("remove");
const fileInput = $<HTMLInputElement>("file");
const status = $<HTMLParagraphElement>("status");

let settings: Settings = { ...DEFAULT_SETTINGS };
/** The active tab when it is a github.com page running our content script. */
let githubTab: number | null = null;

const say = (msg: string) => (status.textContent = msg);

async function send(msg: SyncMessage): Promise<SyncReply | null> {
  if (githubTab === null) return null;
  try {
    return (await chrome.tabs.sendMessage(githubTab, msg)) as SyncReply;
  } catch {
    return null;
  }
}

async function findGithubTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  try {
    const r = (await chrome.tabs.sendMessage(tab.id, { type: "fast-pr:sync" } satisfies SyncMessage)) as SyncReply;
    if (r?.pathname) githubTab = tab.id;
  } catch {
    // Not a github.com tab (or opened before the extension was loaded).
  }
}

async function store(): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

/** Push settings into the GitHub tab, then reload it so the data hook sees them. */
async function applyToTab(done: string): Promise<void> {
  if (githubTab === null) {
    say(`${done} Reload your GitHub tabs to apply.`);
    return;
  }
  await send({ type: "fast-pr:sync" });
  await chrome.tabs.reload(githubTab);
  say(`${done} Reloaded the GitHub tab.`);
}

function validate(): boolean {
  const text = configInput.value.trim();
  let ok = false;
  validation.className = "validation";
  if (text === "") {
    validation.textContent = "";
  } else {
    const r = parseConfig(text);
    if (r.ok) {
      const auto = r.config.groups.filter((g) => g.autoViewed).length;
      const n = r.config.groups.length;
      validation.textContent = `Valid: ${n} group${n === 1 ? "" : "s"}, ${auto} auto-viewed.`;
      validation.classList.add("ok");
      ok = true;
    } else {
      validation.textContent = r.error;
      validation.classList.add("error");
    }
  }
  saveBtn.disabled = !ok || text === settings.localConfig;
  removeBtn.disabled = settings.localConfig === "";
  return ok;
}

debugBox.addEventListener("change", async () => {
  settings.debug = debugBox.checked;
  await store();
  await send({ type: "fast-pr:sync" });
  say(settings.debug ? "Debug on. Reload a GitHub page to see [fast-pr] logs." : "Debug off.");
});

collapseBox.addEventListener("change", async () => {
  settings.collapseGroups = collapseBox.checked;
  await store();
  await send({ type: "fast-pr:sync" });
  say(`Groups start ${settings.collapseGroups ? "collapsed" : "expanded"} on the next PR you open or reload.`);
});

configInput.addEventListener("input", validate);

$("load-file").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  configInput.value = await file.text();
  fileInput.value = "";
  validate();
  say(`Loaded ${file.name}. Save to apply.`);
});

saveBtn.addEventListener("click", async () => {
  if (!validate()) return;
  settings.localConfig = configInput.value.trim();
  await store();
  validate();
  await applyToTab("Saved local config.");
});

removeBtn.addEventListener("click", async () => {
  settings.localConfig = "";
  await store();
  configInput.value = "";
  validate();
  await applyToTab("Removed local config; repos use their own configs.");
});

$("clear-cache").addEventListener("click", async () => {
  const r = await send({ type: "fast-pr:clear-cache" });
  say(r ? `Cleared ${r.removed ?? 0} cached config entries.` : "Open a GitHub tab first, then try again.");
});

async function init(): Promise<void> {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  settings = normalizeSettings(r[SETTINGS_KEY]);
  debugBox.checked = settings.debug;
  collapseBox.checked = settings.collapseGroups;
  configInput.value = settings.localConfig;
  // Already in a tab (options page): the "open in tab" link is pointless.
  if (await chrome.tabs.getCurrent()) $("open-tab").hidden = true;
  await findGithubTab();
  validate();
}

void init();
