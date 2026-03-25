

## Plan: Fix Voice-to-Text and Audio Recorder in APK

### Root Cause

The microphone buttons are inside a `Popover` component. When clicked, `setMicMenuOpen(false)` closes the popover **before** `startRecording()` completes. In the Android WebView (Capacitor remote-URL), this causes a race condition:
- The popover unmounts/re-renders the component tree
- The `getUserMedia` call either gets interrupted or fails silently
- The recording never starts, but no error is shown to the user

Additionally, the `useNativeStartup` hook's microphone "priming" call may hold/release the mic in a way that conflicts with the actual recording attempt if both happen close together.

### Changes

#### 1. Move recording trigger outside the Popover (src/pages/Activities.tsx)

Replace the current approach where buttons inside the Popover both close the popover AND start recording simultaneously. Instead:

- The Popover buttons should **only** set the mode (`voiceToTextMode` true/false) and close the popover
- Use a `useEffect` to detect when mode is set and popover is closed, then trigger `startRecording()` after a short delay (letting the popover fully unmount)
- This eliminates the race condition between popover close and `getUserMedia`

#### 2. Add retry logic for getUserMedia (src/hooks/useAudioRecorder.ts)

In Android WebView, `getUserMedia` can fail on the first attempt after the priming stream is released. Add a single retry with a 300ms delay if the first call fails with `NotReadableError` or `AbortError`.

#### 3. Guard useNativeStartup mic priming (src/hooks/useNativeStartup.ts)

Store a global flag when the startup mic priming stream is active, so `useAudioRecorder` can wait for it to fully release before requesting a new stream.

### Files to Modify
- **src/pages/Activities.tsx** — Decouple popover close from recording start; use deferred trigger
- **src/hooks/useAudioRecorder.ts** — Add retry logic for getUserMedia failures
- **src/hooks/useNativeStartup.ts** — Add global mic-priming guard flag

