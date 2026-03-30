declare const __APP_BUILD_ID__: string;

const BUILD_KEY = "app_build_id";
const RELOAD_GUARD = "app_reload_guard";

/**
 * Compares current build ID with the last-seen one stored in localStorage.
 * If they differ, clears caches and forces a one-time hard reload so
 * the browser fetches fresh assets.
 *
 * Returns `true` if a reload was triggered (caller should stop rendering).
 */
export function checkAndBustCache(): boolean {
  const currentBuild = typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "";
  if (!currentBuild) return false;

  // Log the build ID so we can verify which version is running
  console.info(`[App] Build: ${currentBuild}`);

  const lastBuild = localStorage.getItem(BUILD_KEY);

  // Same build → nothing to do
  if (lastBuild === currentBuild) {
    localStorage.removeItem(RELOAD_GUARD);
    return false;
  }

  // Prevent infinite reload loop: if we already reloaded once for this build, stop
  if (localStorage.getItem(RELOAD_GUARD) === currentBuild) {
    localStorage.setItem(BUILD_KEY, currentBuild);
    localStorage.removeItem(RELOAD_GUARD);
    return false;
  }

  // New build detected → clear caches
  console.info("[App] New build detected, clearing caches…");

  // Unregister service workers
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }

  // Clear Cache Storage
  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((k) => caches.delete(k));
    });
  }

  // Remove dashboard / TanStack Query persisted cache keys
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("dashboard_") || key.startsWith("REACT_QUERY"))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));

  // Set guard + trigger hard reload
  localStorage.setItem(RELOAD_GUARD, currentBuild);
  localStorage.setItem(BUILD_KEY, currentBuild);
  window.location.reload();
  return true;
}
