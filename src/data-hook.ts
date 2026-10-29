// MAIN-world data hook: patches GitHub's PR changes route JSON before React reads it.
import { getAutoRecord, isDebug, lookupConfig } from "./core/storage";
import { localConfig } from "./shared/config-source";
import { patchChangesData, type PatchEnv } from "./hook/patch";
import { RESULT_ATTR, RESULT_EVENT, type FastPrResult } from "./shared/types";

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

try {
  const origParse = JSON.parse;
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
