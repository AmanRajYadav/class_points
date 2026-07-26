/**
 * Game sound, synthesised in the browser.
 *
 * No audio files: every sound is oscillators and gain envelopes, so there is
 * nothing to download, nothing to cache, and no delay before the first bleep.
 * A wrong answer has to be audible within milliseconds of the swipe or it
 * stops feeling connected to it.
 *
 * Browsers refuse to start audio until the user has interacted with the page,
 * so the context is created lazily on the first sound — which is always
 * downstream of a tap — and resumed if the tab suspended it.
 */

const MUTE_KEY = "fluence_sfx_muted";

let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  /* private mode; default to on */
}

const context = (): AudioContext | null => {
  if (muted) return null;
  if (typeof window === "undefined") return null;

  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }

  // iOS suspends the context whenever the tab loses focus.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

export const isMuted = () => muted;

export const setMuted = (value: boolean) => {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (value && ctx?.state === "running") void ctx.suspend();
};

interface ToneOptions {
  freq: number;
  /** Seconds from now. */
  at?: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  /** Slides to this frequency across the note. */
  glideTo?: number;
}

function tone({ freq, at = 0, duration = 0.12, type = "sine", gain = 0.18, glideTo }: ToneOptions) {
  const audio = context();
  if (!audio) return;

  const start = audio.currentTime + at;
  const osc = audio.createOscillator();
  const amp = audio.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), start + duration);

  // A quick attack and an exponential tail: a linear fade to zero clicks,
  // and anything slower than ~8ms of attack sounds mushy at this length.
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(amp).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Short burst of filtered noise, for thuds and buzzes. */
function noise(duration = 0.18, gain = 0.12, cutoff = 900) {
  const audio = context();
  if (!audio) return;

  const frames = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Fade the noise out across the buffer so it lands as a hit, not a hiss.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }

  const src = audio.createBufferSource();
  src.buffer = buffer;

  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;

  const amp = audio.createGain();
  amp.gain.value = gain;

  src.connect(filter).connect(amp).connect(audio.destination);
  src.start();
}

// Notes used below (equal temperament, A4 = 440).
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const A3 = 220.0;
const E3 = 164.81;

export const sfx = {
  /** Rising third — short enough to fire on every correct answer without tiring. */
  correct() {
    tone({ freq: C5, duration: 0.09, type: "triangle", gain: 0.16 });
    tone({ freq: E5, at: 0.07, duration: 0.12, type: "triangle", gain: 0.16 });
  },

  /** Falling buzz. Deliberately duller than `correct`, never harsh. */
  wrong() {
    tone({ freq: A3, glideTo: E3, duration: 0.24, type: "sawtooth", gain: 0.1 });
    noise(0.12, 0.05, 500);
  },

  /** Climbing arpeggio when a streak hits a milestone. */
  streak(step = 0) {
    const base = [C5, E5, G5, C6];
    base.forEach((f, i) =>
      tone({
        freq: f * (1 + Math.min(step, 3) * 0.05),
        at: i * 0.06,
        duration: 0.1,
        type: "triangle",
        gain: 0.13,
      })
    );
  },

  /** A life gone: low thud, unmistakably worse than a plain wrong answer. */
  lifeLost() {
    noise(0.22, 0.16, 320);
    tone({ freq: 160, glideTo: 70, duration: 0.34, type: "square", gain: 0.1 });
  },

  /** Run over — a slow descent, so it reads as an ending rather than a penalty. */
  gameOver() {
    [G5, E5, C5, A3].forEach((f, i) =>
      tone({ freq: f, at: i * 0.13, duration: 0.24, type: "triangle", gain: 0.14 })
    );
  },

  /** Round finished well. */
  fanfare() {
    [C5, E5, G5, C6].forEach((f, i) =>
      tone({ freq: f, at: i * 0.08, duration: 0.26, type: "triangle", gain: 0.15 })
    );
    tone({ freq: G5, at: 0.34, duration: 0.4, type: "sine", gain: 0.12 });
  },

  /** Countdown urgency, from the last few seconds of a survival question. */
  tick() {
    tone({ freq: 1200, duration: 0.04, type: "square", gain: 0.05 });
  },

  /** Card released without committing. */
  swipeBack() {
    tone({ freq: 380, glideTo: 300, duration: 0.07, type: "sine", gain: 0.05 });
  },
};
