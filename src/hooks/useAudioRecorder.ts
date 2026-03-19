import { useState, useRef, useCallback } from "react";
import { requestMicrophonePermission } from "@/utils/nativePermissions";

export interface AudioRecording {
  blob: Blob;
  url: string;
  duration: number;
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<AudioRecording | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  const startRecording = useCallback(async () => {
    setPermissionDenied(false);

    // Request permission (handles both native Capacitor WebView and browser)
    const permStatus = await requestMicrophonePermission();
    if (permStatus === "denied") {
      setPermissionDenied(true);
      throw new Error(
        "Microphone permission denied. Please allow microphone access in your device settings and try again."
      );
    }
    // If 'prompt', proceed anyway — getUserMedia below will trigger the actual permission dialog

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "",
      });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
        setRecording({ blob, url, duration });
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
      };

      mediaRecorderRef.current = mediaRecorder;
      startTimeRef.current = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      mediaRecorder.start(250);
      setIsRecording(true);
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setPermissionDenied(true);
        throw new Error(
          "Microphone permission denied. Please allow microphone access in your device settings and try again."
        );
      }
      throw new Error(err.message || "Could not access microphone");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const clearRecording = useCallback(() => {
    if (recording?.url) URL.revokeObjectURL(recording.url);
    setRecording(null);
    setElapsed(0);
    setPermissionDenied(false);
  }, [recording]);

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
