// MAIN-world data hook: patches GitHub's PR changes route JSON before React reads it.
import { getAutoRecord, isDebug, lookupConfig } from "./core/storage";
import { localConfig } from "./shared/config-source";
import { patchChangesData, type PatchEnv } from "./hook/patch";
import { parseReviewRequest } from "./hook/review";
import { applyViewedToStore, findPrStore } from "./hook/store";
import {
  APPLY_VIEWED_DONE_EVENT,
  APPLY_VIEWED_EVENT,
  RESULT_ATTR,
  RESULT_EVENT,
  VIEWED_EVENT,
  type ApplyViewed,
  type FastPrResult,
  type ViewedChange,
} from "./shared/types";

const env: PatchEnv = {
  configFor(id) {
    const dev = localConfig();
    if (dev) return { cfg: dev, dev: true };
    const c = lookupConfig(id);
    return c ? { cfg: c, dev: false } : null;
  },
  autoPaths: (id) => getAutoRecord(id.owner, id.repo, id.number, id.headSha).paths,
};

let warned = false;
function warn(e: unknown): void {
  if (warned) return;
  warned = true;
  console.warn("[fast-pr] data hook error, leaving data untouched", e);
}

let lastJson: string | null = null;

function announce(json: string): void {
  document.documentElement.setAttribute(RESULT_ATTR, json);
  document.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: json }));
}

function publish(result: FastPrResult): void {
  const json = JSON.stringify(result);
  lastJson = json;
  announce(json);
  if (isDebug()) console.log("[fast-pr] hook applied", result.configStatus, result.appliedHash, result.files.length, "files");
}

function handle(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  try {
    const r = patchChangesData(value, env);
    if (r && r.fresh) publish(r.result);
  } catch (e) {
    warn(e);
  }
}

// On popstate (including #diff-… hash links) GitHub restores <html> attributes from a
// per-URL snapshot, dropping ours and with it all the page UI. Put it back.
try {
  new MutationObserver(() => {
    if (lastJson !== null && !document.documentElement.hasAttribute(RESULT_ATTR)) announce(lastJson);
  }).observe(document.documentElement, { attributes: true, attributeFilter: [RESULT_ATTR] });
} catch (e) {
  warn(e);
}

const origParse = JSON.parse;

function emitViewed(c: ViewedChange): void {
  document.dispatchEvent(new CustomEvent(VIEWED_EVENT, { detail: JSON.stringify(c) }));
}

function reviewOf(url: string, method: string, body: unknown): ViewedChange | null {
  try {
    return parseReviewRequest(url, method, body, location.origin, (s) => origParse(s));
  } catch (e) {
    warn(e);
    return null;
  }
}

// Watch GitHub's own Viewed toggles, so the tree can count viewed files live.
try {
  const origFetch = window.fetch;
  window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const p: Promise<Response> = Reflect.apply(origFetch, this, [input, init]);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const c = reviewOf(url, method, init?.body);
    if (c) p.then((res) => res.ok && emitViewed(c), () => {});
    return p;
  } as typeof fetch;

  const xhrReq = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    xhrReq.set(this, { method: String(args[0]), url: String(args[1]) });
    return Reflect.apply(origOpen, this, args);
  } as typeof XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const r = xhrReq.get(this);
    const c = r && reviewOf(r.url, r.method, body);
    if (c) this.addEventListener("load", () => this.status >= 200 && this.status < 300 && emitViewed(c));
    return Reflect.apply(origSend, this, [body]);
  };
} catch (e) {
  warn(e);
}

// Our batch requests (sent from the content script) are invisible to GitHub's UI; apply them
// to its store, as its own Viewed button does after a request succeeds.
const STORE_ANCHORS = ["[data-path-digest]", "#diff-comparison-viewer-container", 'button[aria-label="Viewed"]'];
try {
  document.addEventListener(APPLY_VIEWED_EVENT, (e) => {
    let ok = false;
    try {
      const req = origParse(String((e as CustomEvent).detail)) as ApplyViewed;
      for (const sel of STORE_ANCHORS) {
        const start = document.querySelector(sel);
        const store = start && findPrStore(start);
        if (!store) continue;
        applyViewedToStore(store, req.paths, req.viewed);
        ok = true;
        break;
      }
    } catch (err) {
      warn(err);
    }
    document.dispatchEvent(new CustomEvent(APPLY_VIEWED_DONE_EVENT, { detail: ok ? "1" : "0" }));
  });
} catch (e) {
  warn(e);
}

try {
  JSON.parse = function (this: unknown, ...args: Parameters<typeof JSON.parse>) {
    const out = Reflect.apply(origParse, this, args);
    handle(out);
    return out;
  } as typeof JSON.parse;

  const origJson = Response.prototype.json;
  Response.prototype.json = function (this: Response) {
    return Reflect.apply(origJson, this, []).then((v: unknown) => {
      handle(v);
      return v;
    });
  };
} catch (e) {
  warn(e);
}
