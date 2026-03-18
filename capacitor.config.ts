import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.8df6a1b7334f41738b22176a340f5d67',
  appName: 'field-force-friendly',
  webDir: 'dist',
  server: {
    url: 'https://8df6a1b7-334f-4173-8b22-176a340f5d67.lovableproject.com?forceHideBadge=true',
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
  },
};

export default config;
