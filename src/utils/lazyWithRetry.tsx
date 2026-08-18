import { lazy, type ComponentType } from "react";
import { hardReloadForStaleChunk } from "./cacheVersion";

function isChunkError(err: unknown): boolean {
  const msg = (err as Error)?.message || String(err);
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(
    msg
  );
}

/** Shown when a chunk cannot be fetched and an automatic reload is not allowed. */
function ChunkErrorFallback() {
  const reload = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("__v", String(Date.now()));
    window.location.replace(url.toString());
  };
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        This page was updated. Reload to get the latest version.
      </p>
      <button
        onClick={reload}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Reload
      </button>
    </div>
  );
}

/**
 * React.lazy with resilience against stale or failed chunk fetches after a deploy.
 * 1) retries the import twice with a short backoff (transient network / CDN warm-up)
 * 2) forces one hard reload (guarded via sessionStorage so we never loop)
 * 3) if a reload already happened recently, renders a Reload prompt instead of
 *    letting the error bubble up into a blank screen
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await factory();
      } catch (err) {
        if (!isChunkError(err)) throw err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        if (hardReloadForStaleChunk()) {
          // keep Suspense pending while the reload happens
          return await new Promise<{ default: T }>(() => {});
        }
        return { default: ChunkErrorFallback as unknown as T };
      }
    }
    return { default: ChunkErrorFallback as unknown as T };
  });
}
