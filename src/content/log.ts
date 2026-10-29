import { isDebug } from "../core/storage";

export function debug(...args: unknown[]): void {
  if (isDebug()) console.log("[fast-pr]", ...args);
}
