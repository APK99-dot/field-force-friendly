## Plan: Fix APK Showing Stale Build (Old Flag/Milestone UI)

### Root Cause

The APK's `capacitor.config.ts` is configured to load the app from a remote URL:

```ts
server: {
  url: 'https://8df6a1b7-334f-4173-8b22-176a340f5d67.lovableproject.com?forceHideBadge=true',
  cleartext: true,
}
```

This means:

1. The APK does NOT use the bundled `dist/` web assets that get rebuilt when you regenerate the APK. Rebuilding the APK does nothing for the JS/HTML the user sees — the WebView fetches everything from the remote URL at launch.
2. The Android WebView aggressively HTTP-caches HTML, JS, and CSS from that URL. Without a unique release token in the URL, the WebView keeps serving the cached old bundle.
3. The URL also points at the **preview/sandbox** domain (`lovableproject.com`), not the published domain. The preview URL is meant for live editing in Lovable, not for production APKs.

This is exactly why the cache-version memory note recommends adding a release version token to the Capacitor server URL.

---

### Fix (3 changes)

**1. Point the APK at the published production site, not the preview sandbox**

Update `capacitor.config.ts` `server.url` to use the published domain:

```
https://field-force-friendly.lovable.app?v=<release-token>&forceHideBadge=true
```

Also acceptable (custom domain): `https://bb.quickapp.ai?v=<release-token>`

**2. Add a release version token to the URL**

Append a unique `?v=YYYYMMDD-N` query string. Bumping this token in each APK release forces the WebView to treat it as a brand-new origin path and bypass any sticky HTTP cache.

For this release, use `?v=20260424-1`.

**3. Optional but recommended — switch APK to bundled assets later**

Long-term, remove the `server.url` entirely so the APK serves files from the bundled `dist/` directory (the standard Capacitor pattern). Then `npm run build && npx cap sync && rebuild APK` becomes the canonical update flow, and the existing in-app cache-busting (`build-meta.json`) handles in-session updates. This is a bigger change and can be done in a follow-up — for now, the URL token fix unblocks the user immediately.

---

### Files to modify

| File | Change |
|------|--------|
| `capacitor.config.ts` | Update `server.url` to published domain + add `?v=20260424-1` token |

### After this change — user steps

1. Pull the latest code from the GitHub repo
2. Run `npm install`
3. Run `npm run build`
4. Run `npx cap sync android`
5. Rebuild the APK in Android Studio (or `npx cap run android`)
6. **Uninstall the old APK from the device first**, then install the new one (this guarantees the WebView's persisted cache is wiped — Android keeps WebView storage tied to the app install)

The uninstall-before-install step is the most important one — even with the URL token fix, an existing install can hold onto the old cached bundle until the app data is cleared.

### Technical details

- `server.url` causes Capacitor to load the app remotely instead of from `webDir`. The bundled `dist/` is ignored in this mode, so rebuilding the APK alone never helps.
- WebView HTTP caching is independent of service workers. The in-app `cacheVersion.ts` purge logic only runs once the JS bundle is loaded — if the WebView serves a stale `index.html`, the new cache-bust code never executes.
- Changing the query string changes the cache key for `index.html`, forcing a fresh fetch on next launch.
- For each future APK release, bump the `v=` token (e.g., `20260425-1`) so each install fetches fresh assets on first launch.
