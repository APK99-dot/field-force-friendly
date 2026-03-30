import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { requestNativePermissions } from "./utils/nativePermissions";
import { checkAndBustCache } from "./utils/cacheVersion";

// Check for new build and bust cache if needed (triggers reload once)
const reloading = checkAndBustCache();

if (!reloading) {
  // Always clean up any stray service workers
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister();
      });
    });
  }

  if ("caches" in window) {
    void caches.keys().then((cacheKeys) => {
      cacheKeys.forEach((cacheKey) => {
        void caches.delete(cacheKey);
      });
    });
  }

  requestNativePermissions();

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
