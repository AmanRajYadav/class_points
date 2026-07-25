import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Records a spoken class summary.
 *
 * Two independent things happen at once, and either can work without the other:
 *  - MediaRecorder captures the audio, which is what gets archived. Supported
 *    everywhere that matters.
 *  - The Web Speech API transcribes live. Chrome and Android Chrome only; on
 *    iOS Safari and Firefox it simply does not run, so the transcript comes
 *    back empty and the audio is still saved for a Whisper pass later.
 *
 * Nothing here throws when speech recognition is missing — the transcript is
 * an optional bonus over a recording that always happens.
 */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: any) => void) | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  onerror: ((event: any) => void) | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  onend: (() => void) | null;
}

const getSpeechRecognition = (): (new () => SpeechRecognitionLike) | null => {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
};

export const speechSupported = () => getSpeechRecognition() !== null;

export interface VoiceNote {
  blob: Blob;
  transcript: string;
  durationSeconds: number;
}

export function useVoiceNote() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  // Kept in a ref as well: the resolve callback below reads the final value
  // after stop(), and state would still be one render behind.
  const transcriptRef = useRef("");
  const startedAtRef = useRef(0);

  const cleanup = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setTranscript("");
    transcriptRef.current = "";
    chunksRef.current = [];
    setSeconds(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone permission was refused, so nothing can be recorded.");
      return false;
    }

    streamRef.current = stream;

    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    recorderRef.current = recorder;

    startedAtRef.current = Date.now();
    tickRef.current = window.setInterval(
      () => setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000)),
      500
    );

    const Recognition = getSpeechRecognition();
    if (Recognition) {
      const recognition = new Recognition();
      recognition.lang = "en-IN";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        // Only final segments are appended; interim ones are shown separately
        // so the text does not stutter as the engine revises itself.
        let finalText = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) finalText += result[0].transcript;
          else interim += result[0].transcript;
        }
        if (finalText) {
          transcriptRef.current = (transcriptRef.current + " " + finalText).trim();
        }
        setTranscript((transcriptRef.current + " " + interim).trim());
      };

      recognition.onerror = (event: any) => {
        // 'no-speech' and 'aborted' are routine; the recording continues.
        if (event?.error && !["no-speech", "aborted"].includes(event.error)) {
          setError(`Speech recognition stopped (${event.error}). The audio is still recording.`);
        }
      };

      // Chrome ends the session on its own after a pause; restart while the
      // recorder is still going so a long explanation is not cut short.
      recognition.onend = () => {
        if (recorderRef.current?.state === "recording") {
          try {
            recognition.start();
          } catch {
            /* racing a manual stop */
          }
        }
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
      } catch {
        recognitionRef.current = null;
      }
    }

    setRecording(true);
    return true;
  }, []);

  const stop = useCallback(async (): Promise<VoiceNote | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;

    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () =>
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      recorder.stop();
    });

    recorderRef.current = null;
    cleanup();
    setRecording(false);

    return { blob, transcript: transcriptRef.current.trim(), durationSeconds };
  }, [cleanup]);

  const cancel = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    chunksRef.current = [];
    cleanup();
    setRecording(false);
    setSeconds(0);
    setTranscript("");
    transcriptRef.current = "";
  }, [cleanup]);

  return { recording, seconds, transcript, error, start, stop, cancel, setTranscript };
}
