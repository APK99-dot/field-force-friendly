import type { CapacitorConfig } from '@capacitor/cli';

// Bump this token on every APK release to force the WebView to bypass
// any cached HTML/JS from a prior install.
const RELEASE_TOKEN = '20260818-1';

const config: CapacitorConfig = {
  appId: 'app.lovable.8df6a1b7334f41738b22176a340f5d67',
  appName: 'field-force-friendly',
  webDir: 'dist',
  server: {
    // Point to the published production site (NOT the preview sandbox) and
    // append a release token so each new APK fetches fresh assets.
    //
    // Use the custom domain directly. The old lovable.app host 301s here, and
    // while the query string does survive that hop, a cross-origin redirect on
    // every launch is a variable worth removing from a WebView that has been
    // serving stale assets — the redirect itself is cacheable.
    url: `https://bb.quickapp.ai?v=${RELEASE_TOKEN}&forceHideBadge=true`,
    cleartext: true,
  },
  android: {
    // Allow WebView to handle camera/location permission prompts
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    Camera: {
      permissions: ['camera'],
    },
    Geolocation: {
      permissions: ['location', 'coarseLocation'],
    },
    Microphone: {
      permissions: ['microphone'],
    },
    Filesystem: {
      permissions: ['publicStorage'],
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
