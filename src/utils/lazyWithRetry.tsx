import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "lazy_chunk_reload_at";

function isChunkError(err: unknown): boolean {
  const msg = (err as Error)?.message || String(err);
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(
    msg
  );
}

/**
 * React.lazy with resilience against stale/失败 chunk fetches after a deploy.
 * 1) retries the import once after a short delay (transient network / CDN warm-up)
 * 2) if it still fails and the error is a chunk error, force one hard reload
 *    (guarded via sessionStorage so we never loop)
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (!isChunkError(err)) throw err;

      // second attempt — often succeeds once the new assets are available
      await new Promise((r) => setTimeout(r, 600));
      try {
        return await factory();
      } catch (err2) {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
        if (Date.now() - last > 15_000) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          console.warn("[lazy] stale chunk, reloading app…");
          window.location.reload();
          // keep Suspense pending while the reload happens
          return await new Promise<{ default: T }>(() => {});
        }
        throw err2;
      }
    }
  });
}
