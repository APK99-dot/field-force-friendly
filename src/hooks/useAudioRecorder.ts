import { useState, useRef, useCallback } from "react";
import { CapacitorAudioRecorder, RecordingStatus } from "@capgo/capacitor-audio-recorder";
import { Capacitor } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";
import { isMicPrimingActive } from "./useNativeStartup";

export interface AudioRecording {
  blob: Blob;
  url: string;
  duration: number;
  mimeType: string;
  fileExtension: string;
}

const NATIVE_AUDIO_MIME_TYPE = "audio/aac";
const NATIVE_AUDIO_EXTENSION = "m4a";

async function readNativeRecordingAsBlob(uri: string) {
  const file = await Filesystem.readFile({ path: uri });
  const base64 = typeof file.data === "string" ? file.data : "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: NATIVE_AUDIO_MIME_TYPE });
}

/**
 * Determine the best supported mimeType for MediaRecorder in the current environment.
 */
function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "video/webm",
  ];
  for (const mime of candidates) {
    try {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    } catch {
      // isTypeSupported may throw in some WebView versions
    }
  }
  return "";
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<AudioRecording | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  const isNativeRecorderAvailable = useCallback(() => Capacitor.isNativePlatform(), []);

  /** Stop all tracks on the current stream and clear refs */
  const stopAllTracks = useCallback(() => {
    // Stop the MediaRecorder first if still active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Already stopped
      }
    }
    mediaRecorderRef.current = null;

    // Release all audio tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* ignore */ }
      });
      streamRef.current = null;
    }

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = 0;
    }
  }, []);

  const startRecording = useCallback(async () => {
    setPermissionDenied(false);

    // *** CRITICAL: Always clean up any existing recording/stream first ***
    stopAllTracks();

    if (isNativeRecorderAvailable()) {
      try {
        const currentPermission = await CapacitorAudioRecorder.checkPermissions();
        const permission = currentPermission.recordAudio === "granted"
          ? currentPermission
          : await CapacitorAudioRecorder.requestPermissions();

        if (permission.recordAudio !== "granted") {
          setPermissionDenied(true);
          throw new Error("Microphone permission denied. Please allow microphone access in your device settings and try again.");
        }

        setRecording(null);
        startTimeRef.current = Date.now();
        setElapsed(0);

        timerRef.current = window.setInterval(() => {
          setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
        }, 1000);

        await CapacitorAudioRecorder.startRecording({
          sampleRate: 44100,
          bitRate: 128000,
        });
        setIsRecording(true);
        return;
      } catch (err: any) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = 0;
        }
        setElapsed(0);
        throw new Error(err?.message || "Could not access microphone");
      }
    }

    // Wait for startup mic priming to finish if active
    if (isMicPrimingActive()) {
      console.log('Waiting for mic priming to finish...');
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 150));
        if (!isMicPrimingActive()) break;
      }
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      console.error('mediaDevices not available. Secure context:', window.isSecureContext);
      throw new Error(
        "Audio recording requires a secure (HTTPS) connection."
      );
    }

    if (typeof MediaRecorder === 'undefined') {
      throw new Error("Audio recording is not supported in this browser.");
    }

    let stream: MediaStream;
    const attemptGetUserMedia = async (): Promise<MediaStream> => {
      return navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    };

    try {
      console.log('Requesting getUserMedia for audio...');
      stream = await attemptGetUserMedia();
      console.log('getUserMedia succeeded, tracks:', stream.getAudioTracks().length);
    } catch (err: any) {
      // Retry once for transient errors common in Android WebView
      if (err.name === 'NotReadableError' || err.name === 'AbortError') {
        console.warn('getUserMedia failed with', err.name, '— retrying in 500ms...');
        await new Promise((r) => setTimeout(r, 500));
        try {
          stream = await attemptGetUserMedia();
          console.log('getUserMedia retry succeeded');
        } catch (retryErr: any) {
          console.error('getUserMedia retry also failed:', retryErr.name, retryErr.message);
          throw new Error(retryErr.message || "Could not access microphone");
        }
      } else {
        console.error('getUserMedia failed:', err.name, err.message);
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError" ||
          err.name === "SecurityError"
        ) {
          setPermissionDenied(true);
          throw new Error(
            "Microphone permission denied. Please allow microphone access in your device settings and try again."
          );
        }
        if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          throw new Error("No microphone found on this device.");
        }
        throw new Error(err.message || "Could not access microphone");
      }
    }

    streamRef.current = stream;

    if (stream.getAudioTracks().length === 0) {
      stopAllTracks();
      throw new Error("No audio track available from microphone.");
    }

    let mediaRecorder: MediaRecorder;
    try {
      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = {};
      if (mimeType) options.mimeType = mimeType;
      console.log('Creating MediaRecorder with mimeType:', mimeType || '(default)');
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (recErr: any) {
      console.warn('MediaRecorder creation with options failed, trying without:', recErr.message);
      try {
        mediaRecorder = new MediaRecorder(stream);
      } catch {
        stopAllTracks();
        throw new Error("MediaRecorder is not supported in this browser.");
      }
    }

    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onerror = () => {
      setIsRecording(false);
      stopAllTracks();
    };

    mediaRecorder.onstop = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = 0;
      }

      if (chunksRef.current.length > 0) {
        const finalMime = mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalMime });
        const url = URL.createObjectURL(blob);
        const duration = Math.max(
          1,
          Math.round((Date.now() - startTimeRef.current) / 1000)
        );
        setRecording({ blob, url, duration, mimeType: finalMime, fileExtension: finalMime.includes("ogg") ? "ogg" : finalMime.includes("mp4") ? "m4a" : "webm" });
      }

      // Release mic tracks after data is captured
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch { /* ignore */ }
        });
        streamRef.current = null;
      }
    };

    mediaRecorderRef.current = mediaRecorder;
    startTimeRef.current = Date.now();
    setElapsed(0);

    timerRef.current = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    mediaRecorder.start(500);
    console.log('MediaRecorder started');
    setIsRecording(true);
  }, [stopAllTracks]);

  const stopRecording = useCallback(() => {
    if (isNativeRecorderAvailable()) {
      void (async () => {
        try {
          const status = await CapacitorAudioRecorder.getRecordingStatus();
          if (status.status === RecordingStatus.Inactive) {
            setIsRecording(false);
            return;
          }

          const result = await CapacitorAudioRecorder.stopRecording();
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = 0;
          }

          if (result.uri) {
            const blob = await readNativeRecordingAsBlob(result.uri);
            const url = URL.createObjectURL(blob);
            const duration = Math.max(1, Math.round((result.duration ?? Date.now() - startTimeRef.current) / 1000));
            setRecording({
              blob,
              url,
              duration,
              mimeType: NATIVE_AUDIO_MIME_TYPE,
              fileExtension: NATIVE_AUDIO_EXTENSION,
            });
          }
        } catch (err) {
          console.error("Native stopRecording failed:", err);
        } finally {
          setIsRecording(false);
        }
      })();
      return;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        stopAllTracks();
      }
    }
    setIsRecording(false);
  }, [stopAllTracks]);

  const clearRecording = useCallback(() => {
    // Always ensure mic is released when clearing
    stopAllTracks();

    if (isNativeRecorderAvailable()) {
      void CapacitorAudioRecorder.cancelRecording().catch(() => {
        // Ignore when nothing is recording.
      });
    }

    if (recording?.url) {
      try { URL.revokeObjectURL(recording.url); } catch { /* ignore */ }
    }
    setRecording(null);
    setElapsed(0);
    setPermissionDenied(false);
  }, [isNativeRecorderAvailable, recording, stopAllTracks]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return {
    isRecording,
    recording,
    elapsed,
    permissionDenied,
    startRecording,
    stopRecording,
    clearRecording,
    formatDuration,
  };
}
