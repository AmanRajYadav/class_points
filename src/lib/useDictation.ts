import { useCallback, useEffect, useRef, useState } from "react";

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: any) => void) | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  onerror: ((event: any) => void) | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  onend: (() => void) | null;
}

const getSpeechRecognition = (): (new () => Recognition) | null => {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
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
 * WebKit exposes webkitSpeechRecognition, so a plain feature check says yes
 * and then the thing misbehaves: it stops returning results after the first
 * phrase while holding the microphone open indefinitely.
 */
const transcriptionAvailable = (): boolean => getSpeechRecognition() !== null && !isWebKitSpeech();

/**
 * Speech to text, and nothing else — no recording, no upload.
 *
 * Only offered where `transcriptionAvailable()` says the browser can be
 * trusted, which rules out every iPhone. That costs nothing: the microphone
 * key on the phone's own keyboard dictates into any text box, so the box works
 * by voice everywhere and this button is only the shortcut.
 */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  // Read through a ref so a re-render mid-sentence cannot leave the engine
  // calling a stale handler.
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    setError(null);

    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) text += event.results[i][0].transcript + " ";
      }
      if (text.trim()) onTextRef.current(text.trim());
    };

    recognition.onerror = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (event?.error === "not-allowed") setError("Microphone permission was refused.");
      else if (event?.error && !["no-speech", "aborted"].includes(event.error)) {
        setError(`Dictation stopped (${event.error}).`);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      setError("Dictation could not start.");
    }
  }, []);

  return { available: transcriptionAvailable(), listening, error, start, stop };
}
