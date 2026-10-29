import { APPLY_VIEWED_DONE_EVENT, APPLY_VIEWED_EVENT, type ApplyViewed } from "../shared/types";

/**
 * Ask the MAIN-world hook to update GitHub's in-page viewed state after our own requests.
 * DOM events dispatch synchronously across worlds, so the answer is known on return.
 */
export function applyToGitHub(paths: string[], viewed: boolean): boolean {
  let ok = false;
  const onDone = (e: Event) => {
    ok = (e as CustomEvent).detail === "1";
  };
  document.addEventListener(APPLY_VIEWED_DONE_EVENT, onDone);
  try {
    const req: ApplyViewed = { paths, viewed };
    document.dispatchEvent(new CustomEvent(APPLY_VIEWED_EVENT, { detail: JSON.stringify(req) }));
  } finally {
    document.removeEventListener(APPLY_VIEWED_DONE_EVENT, onDone);
  }
  return ok;
}
