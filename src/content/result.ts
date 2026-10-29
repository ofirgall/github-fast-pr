import { RESULT_ATTR, type FastPrResult } from "../shared/types";
import type { PageInfo } from "./router";

export function parseResult(raw: string | null | undefined): FastPrResult | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as FastPrResult;
    if (r && r.v === 1 && Array.isArray(r.files) && r.identity) return r;
  } catch {
    /* ignore */
  }
  return null;
}

export function readResultRaw(): string | null {
  return document.documentElement.getAttribute(RESULT_ATTR);
}

export function resultMatchesPage(r: FastPrResult, page: PageInfo): boolean {
  const id = r.identity;
  return (
    id.number === page.number &&
    id.owner.toLowerCase() === page.owner.toLowerCase() &&
    id.repo.toLowerCase() === page.repo.toLowerCase()
  );
}
