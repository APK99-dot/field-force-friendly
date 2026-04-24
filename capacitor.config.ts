import type { CapacitorConfig } from '@capacitor/cli';

// Bump this token on every APK release to force the WebView to bypass
// any cached HTML/JS from a prior install.
const RELEASE_TOKEN = '20260424-1';

const config: CapacitorConfig = {
  appId: 'app.lovable.8df6a1b7334f41738b22176a340f5d67',
  appName: 'field-force-friendly',
  webDir: 'dist',
  server: {
    // Point to the published production site (NOT the preview sandbox) and
    // append a release token so each new APK fetches fresh assets.
    url: `https://field-force-friendly.lovable.app?v=${RELEASE_TOKEN}&forceHideBadge=true`,
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
