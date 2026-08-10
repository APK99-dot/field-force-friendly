import { useCallback } from "react";

export type UiMode = "classic" | "lightning";

/**
 * UI mode for the Procurement / Vendor 360 surfaces.
 *
 * Lightning is now the only mode on those pages. The toggle used to live in the
 * Procurement, Vendor Management and Vendor detail headers and persisted an
 * opt-out to localStorage; both are gone, so there is nothing left to read or
 * store and the mode is fixed.
 *
 * The hook keeps its original shape on purpose: several procurement components
 * still branch on `lightning ? … : …`, and pinning the value here switches all
 * of them on in one place without touching that markup. It also means anyone
 * who had previously opted into classic gets Lightning immediately, instead of
 * being stranded in a mode with no way back.
 */
export function useUiMode(): [UiMode, (m: UiMode) => void, () => void] {
  const noop = useCallback(() => {}, []);
  return ["lightning", noop, noop];
}

export const isLightning = (m: UiMode) => m === "lightning";
