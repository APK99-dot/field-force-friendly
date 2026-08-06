import { useEffect, useState, useCallback } from "react";

export type UiMode = "classic" | "lightning";

const KEY = "bb.ui.procurement";

function read(): UiMode {
  if (typeof window === "undefined") return "lightning";
  const v = window.localStorage.getItem(KEY);
  // Lightning is the default experience; only an explicit opt-out uses classic.
  return v === "classic" ? "classic" : "lightning";
}

/**
 * Per-user UI mode preference for the Procurement / Vendor 360 surfaces.
 * Persists to localStorage and cross-tab syncs via the `storage` event.
 */
export function useUiMode(): [UiMode, (m: UiMode) => void, () => void] {
  const [mode, setMode] = useState<UiMode>(() => read());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setMode(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((m: UiMode) => {
    window.localStorage.setItem(KEY, m);
    setMode(m);
  }, []);

  const toggle = useCallback(() => {
    update(read() === "lightning" ? "classic" : "lightning");
  }, [update]);

  return [mode, update, toggle];
}

export const isLightning = (m: UiMode) => m === "lightning";
