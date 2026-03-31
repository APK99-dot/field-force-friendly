import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { requestNativePermissions } from "./utils/nativePermissions";
import { checkAndBustCache, startVersionSync } from "./utils/cacheVersion";

// Check for new build and bust cache if needed (triggers reload once)
const reloading = checkAndBustCache();

if (!reloading) {
  requestNativePermissions();

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // Start periodic server-version sync (production only, non-blocking)
  startVersionSync();
}
