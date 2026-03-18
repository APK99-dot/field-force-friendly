import { useState, useRef, useCallback } from "react";

export interface AudioRecording {
  blob: Blob;
  url: string;
  duration: number;
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<AudioRecording | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
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
      throw new Error(err.message || "Microphone access denied");
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
    startRecording,
    stopRecording,
    clearRecording,
    formatDuration,
  };
}
