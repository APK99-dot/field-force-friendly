import { useState, useRef, useCallback } from "react";
import { isMicPrimingActive } from "./useNativeStartup";

export interface AudioRecording {
  blob: Blob;
  url: string;
  duration: number;
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

    // Small delay to let OS fully release the mic
    await new Promise((r) => setTimeout(r, 150));

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
    try {
      console.log('Requesting getUserMedia for audio...');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      console.log('getUserMedia succeeded, tracks:', stream.getAudioTracks().length);
    } catch (err: any) {
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
      if (err.name === "NotReadableError" || err.name === "AbortError") {
        throw new Error("Microphone is in use by another app. Please close other apps and try again.");
      }
      throw new Error(err.message || "Could not access microphone");
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
        setRecording({ blob, url, duration });
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

    if (recording?.url) {
      try { URL.revokeObjectURL(recording.url); } catch { /* ignore */ }
    }
    setRecording(null);
    setElapsed(0);
    setPermissionDenied(false);
  }, [recording, stopAllTracks]);

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
