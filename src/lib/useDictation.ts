import { useCallback, useEffect, useRef, useState } from "react";
import { getSpeechRecognition, transcriptionAvailable } from "./useVoiceNote";

type Recognition = InstanceType<NonNullable<ReturnType<typeof getSpeechRecognition>>>;

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
