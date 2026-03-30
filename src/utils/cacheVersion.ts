declare const __APP_BUILD_ID__: string;

const BUILD_KEY = "app_build_id";
const RELOAD_GUARD = "app_reload_guard";
const CHECK_INTERVAL = 90_000; // 90 seconds

let intervalId: ReturnType<typeof setInterval> | null = null;

function getCurrentBuildId(): string {
  return typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "";
}

async function fetchServerBuildId(): Promise<string | null> {
  try {
    const resp = await fetch(`/build-meta.json?t=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.buildId ?? null;
  } catch {
    return null;
  }
}

function purgeAndReload(reason: string): void {
  console.info(`[App] ${reason} — purging caches and reloading…`);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }

  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((k) => caches.delete(k));
    });
  }

  // Remove app-specific localStorage caches
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("dashboard_") || key.startsWith("REACT_QUERY"))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));

  const currentBuild = getCurrentBuildId();
  localStorage.setItem(RELOAD_GUARD, currentBuild);
  localStorage.setItem(BUILD_KEY, currentBuild);
  window.location.reload();
}

/**
 * Startup check: compares compiled build ID vs localStorage.
 * Returns true if a reload was triggered (caller should stop rendering).
 */
export function checkAndBustCache(): boolean {
  const currentBuild = getCurrentBuildId();
  if (!currentBuild) return false;

  console.info(`[App] Build: ${currentBuild}`);

  const lastBuild = localStorage.getItem(BUILD_KEY);

  if (lastBuild === currentBuild) {
    localStorage.removeItem(RELOAD_GUARD);
    return false;
  }

  if (localStorage.getItem(RELOAD_GUARD) === currentBuild) {
    localStorage.setItem(BUILD_KEY, currentBuild);
    localStorage.removeItem(RELOAD_GUARD);
    return false;
  }

  purgeAndReload("New build detected at startup");
  return true;
}

/**
 * Async check: fetches server build-meta.json and compares against
 * the currently running build. If server has a newer build, purge & reload.
 */
async function syncWithServer(): Promise<void> {
  const currentBuild = getCurrentBuildId();
  if (!currentBuild) return;

  const serverBuild = await fetchServerBuildId();
  if (!serverBuild) return; // network error or file missing — skip

  if (serverBuild === currentBuild) {
    console.debug(`[App] Build in sync: ${currentBuild}`);
    return;
  }

  // Prevent reload loop: if we already reloaded for this server build
  if (localStorage.getItem(RELOAD_GUARD) === serverBuild) {
    localStorage.setItem(BUILD_KEY, serverBuild);
    localStorage.removeItem(RELOAD_GUARD);
    return;
  }

  // Store the SERVER build as the guard target (not the running one)
  localStorage.setItem(RELOAD_GUARD, serverBuild);
  purgeAndReload(`Server build ${serverBuild} differs from running ${currentBuild}`);
}

/**
 * Start periodic + visibility-based server version checks.
 * Call once after initial render.
 */
export function startVersionSync(): void {
  // Initial async server check (non-blocking)
  void syncWithServer();

  // Periodic check
  if (!intervalId) {
    intervalId = setInterval(() => void syncWithServer(), CHECK_INTERVAL);
  }

  // Check when tab becomes visible again
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void syncWithServer();
    }
  });
}
