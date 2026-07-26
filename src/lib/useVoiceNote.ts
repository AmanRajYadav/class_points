import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Records a spoken class summary.
 *
 * Two independent things happen at once, and either can fail without taking
 * the other down: MediaRecorder captures the audio that gets archived, and the
 * Web Speech API transcribes live where it can be trusted.
 *
 * iOS is the reason most of the defensive code here exists — see the notes on
 * TIMESLICE_MS, STOP_TIMEOUT_MS and transcriptionAvailable.
 */

/**
 * Ask for a chunk every second instead of only at the end.
 *
 * Without a timeslice, MediaRecorder emits its single `dataavailable` when
 * stopping — so on a browser that fails to fire the stop sequence, the audio is
 * gone. With one, chunks accumulate as we go and a recording can always be
 * assembled from what already arrived.
 */
const TIMESLICE_MS = 1000;

/**
 * How long to wait for `onstop` before assembling the file anyway.
 *
 * iOS Safari fires `stop` and `dataavailable` inconsistently — reports put it
 * around 40% of the time on some versions. The previous version of this hook
 * awaited `onstop` forever, so on an iPhone the recording never finished and
 * the stop button looked dead. Combined with the timeslice above, giving up
 * after a moment costs at most the final second of audio.
 */
const STOP_TIMEOUT_MS = 1200;

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

/** Every iOS browser is WebKit underneath, so the engine is what matters. */
const isWebKitSpeech = (): boolean => {
  const ua = navigator.userAgent;
  const iOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const desktopSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg/.test(ua);
  return iOS || desktopSafari;
};

/**
 * True only where live transcription actually works.
 *
 * WebKit exposes `webkitSpeechRecognition`, so a plain feature check says yes
 * and then the thing misbehaves: it stops returning results after the first
 * phrase while holding the microphone open indefinitely. Since we are also
 * recording through that microphone, letting it run risks the recording too.
 * Better to record audio only and transcribe later.
 */
export const transcriptionAvailable = (): boolean =>
  getSpeechRecognition() !== null && !isWebKitSpeech();

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
  // Also kept in a ref: the resolve path below reads the final value straight
  // after stop(), where state would still be a render behind.
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

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      cleanup();
      setError("This browser cannot record audio.");
      return false;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onerror = () => setError("Recording stopped unexpectedly.");

    recorder.start(TIMESLICE_MS);
    recorderRef.current = recorder;

    startedAtRef.current = Date.now();
    tickRef.current = window.setInterval(
      () => setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000)),
      500
    );

    const Recognition = transcriptionAvailable() ? getSpeechRecognition() : null;
    if (Recognition) {
      const recognition = new Recognition();
      recognition.lang = "en-IN";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        // Only final segments are appended; interim text is shown separately so
        // the display does not stutter as the engine revises itself.
        let finalText = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) finalText += result[0].transcript;
          else interim += result[0].transcript;
        }
        if (finalText) transcriptRef.current = (transcriptRef.current + " " + finalText).trim();
        setTranscript((transcriptRef.current + " " + interim).trim());
      };

      recognition.onerror = (event: any) => {
        // 'no-speech' and 'aborted' are routine; recording carries on.
        if (event?.error && !["no-speech", "aborted"].includes(event.error)) {
          setError(`Live transcription stopped (${event.error}). The audio is still recording.`);
        }
      };

      // Chrome ends a session after a pause; restart while the recorder is
      // still running so a long explanation is not cut in half.
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
  }, [cleanup]);

  const stop = useCallback(async (): Promise<VoiceNote | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;

    // Cleared up front so a second tap cannot start another stop sequence.
    recorderRef.current = null;
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    const assemble = () =>
      new Blob(chunksRef.current, {
        // Prefer the type the chunks actually carry: iOS records mp4/aac and
        // reports a mimeType that does not always match.
        type: chunksRef.current[0]?.type || recorder.mimeType || "audio/mp4",
      });

    const blob = await new Promise<Blob>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(assemble());
      };

      // The recorder may already be inactive — iOS tears it down on an
      // interruption without telling us — in which case the timesliced chunks
      // are all there is, and that is enough.
      if (recorder.state === "inactive") {
        finish();
        return;
      }

      recorder.onstop = finish;
      // The guarantee that this never hangs.
      window.setTimeout(finish, STOP_TIMEOUT_MS);

      try {
        recorder.requestData();
      } catch {
        /* not supported everywhere; the timeslice already covers us */
      }
      try {
        recorder.stop();
      } catch {
        finish();
      }
    });

    cleanup();
    setRecording(false);

    return { blob, transcript: transcriptRef.current.trim(), durationSeconds };
  }, [cleanup]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      /* ignore */
    }
    chunksRef.current = [];
    cleanup();
    setRecording(false);
    setSeconds(0);
    setTranscript("");
    transcriptRef.current = "";
  }, [cleanup]);

  return { recording, seconds, transcript, error, start, stop, cancel, setTranscript };
}
