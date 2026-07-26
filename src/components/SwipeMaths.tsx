import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Flame,
  RotateCcw,
  Sparkles,
  Target,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  generateRound,
  Level,
  LEVEL_META,
  Question,
  secondsFor,
  TOPICS,
  TopicId,
  topicsForLevel,
} from "../lib/mathQuiz";

const ROUND_LENGTH = 12;
const COMMIT_PX = 90;
const FLICK_MIN_PX = 45;

type Phase = "menu" | "chapters" | "playing" | "done";

interface Answer {
  question: Question;
  saidTrue: boolean;
  correct: boolean;
}

/** Best score per level, kept on the device — no login, no table. */
const BEST_KEY = "fluence_swipe_maths_best";

const readBest = (): Partial<Record<Level, number>> => {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}");
  } catch {
    return {};
  }
};

const writeBest = (next: Partial<Record<Level, number>>) => {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(next));
  } catch {
    /* private mode; the score just won't persist */
  }
};

const ACCENTS: Record<string, { chip: string; solid: string; ring: string }> = {
  emerald: {
    chip: "bg-emerald-50 text-emerald-700 border-emerald-100",
    solid: "bg-emerald-600 hover:bg-emerald-700",
    ring: "ring-emerald-400",
  },
  sky: {
    chip: "bg-sky-50 text-sky-700 border-sky-100",
    solid: "bg-sky-600 hover:bg-sky-700",
    ring: "ring-sky-400",
  },
  violet: {
    chip: "bg-violet-50 text-violet-700 border-violet-100",
    solid: "bg-violet-600 hover:bg-violet-700",
    ring: "ring-violet-400",
  },
  amber: {
    chip: "bg-amber-50 text-amber-700 border-amber-100",
    solid: "bg-amber-500 hover:bg-amber-600",
    ring: "ring-amber-400",
  },
};

export const SwipeMaths: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const [phase, setPhase] = useState<Phase>("menu");
  const [level, setLevel] = useState<Level>("easy");
  const [chosenTopics, setChosenTopics] = useState<TopicId[]>([]);
  const [round, setRound] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [flash, setFlash] = useState<{ correct: boolean; explain: string } | null>(null);
  const [best, setBest] = useState<Partial<Record<Level, number>>>(readBest);

  const flashTimer = useRef<number | null>(null);

  const score = answers.filter((a) => a.correct).length;
  const current = round[index];

  // --- flow ---------------------------------------------------------------

  const beginRound = useCallback((lvl: Level, topics?: TopicId[]) => {
    setRound(generateRound(lvl, ROUND_LENGTH, topics));
    setIndex(0);
    setAnswers([]);
    setStreak(0);
    setBestStreak(0);
    setSecondsLeft(secondsFor(lvl));
    setFlash(null);
    setPhase("playing");
  }, []);

  const startLevel = (lvl: Level) => {
    setLevel(lvl);
    if (lvl === "legend") {
      // Legend is the only level where the chapter mix is the player's choice.
      setChosenTopics(topicsForLevel("legend"));
      setPhase("chapters");
      return;
    }
    beginRound(lvl);
  };

  const answer = useCallback(
    (saidTrue: boolean) => {
      const q = round[index];
      if (!q) return;

      const correct = saidTrue === q.isTrue;

      setAnswers((prev) => [...prev, { question: q, saidTrue, correct }]);
      setStreak((prev) => {
        const next = correct ? prev + 1 : 0;
        setBestStreak((b) => Math.max(b, next));
        return next;
      });

      if (navigator.vibrate) navigator.vibrate(correct ? 20 : [40, 40, 40]);

      setFlash({ correct, explain: q.explain });
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), correct ? 900 : 2200);

      if (index + 1 >= round.length) {
        setPhase("done");
        const finalScore = answers.filter((a) => a.correct).length + (correct ? 1 : 0);
        setBest((prev) => {
          if ((prev[level] ?? -1) >= finalScore) return prev;
          const next = { ...prev, [level]: finalScore };
          writeBest(next);
          return next;
        });
      } else {
        setIndex((i) => i + 1);
        setSecondsLeft(secondsFor(level));
      }
    },
    [round, index, answers, level]
  );

  // Countdown. Running out counts as a wrong answer, which is what keeps a
  // timed level honest — you cannot wait out a question you cannot do.
  useEffect(() => {
    if (phase !== "playing" || !current) return;
    if (secondsLeft <= 0) {
      answer(!current.isTrue);
      return;
    }
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [phase, secondsLeft, current, answer]);

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    []
  );

  const accent = ACCENTS[LEVEL_META[level].accent];

  // --- menu ---------------------------------------------------------------

  if (phase === "menu") {
    return (
      <div className="space-y-4">
        <Header onExit={onExit} />

        <div className="space-y-2.5">
          {(Object.keys(LEVEL_META) as Level[]).map((lvl) => {
            const meta = LEVEL_META[lvl];
            const a = ACCENTS[meta.accent];
            return (
              <motion.button
                key={lvl}
                whileTap={{ scale: 0.98 }}
                onClick={() => startLevel(lvl)}
                className="w-full bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center gap-3 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer text-left"
              >
                <div
                  className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${a.chip}`}
                >
                  {lvl === "legend" ? (
                    <Flame className="w-5 h-5" />
                  ) : (
                    <Target className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block font-black text-slate-800 text-sm">{meta.label}</span>
                  <span className="block text-[11px] text-slate-400 font-semibold leading-snug">
                    {meta.blurb}
                  </span>
                </div>
                {best[lvl] !== undefined && (
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg shrink-0">
                    Best {best[lvl]}/{ROUND_LENGTH}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-400 font-semibold text-center px-6 leading-relaxed">
          Swipe right if the statement is correct, left if it is wrong.
          {" "}Class 10 topics follow the CBSE 2026-27 syllabus.
        </p>
      </div>
    );
  }

  // --- chapter picker (Legend only) ---------------------------------------

  if (phase === "chapters") {
    const groups = ["Foundations", "Class 10"] as const;
    const legendTopics = topicsForLevel("legend");

    const toggle = (id: TopicId) =>
      setChosenTopics((prev) =>
        prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
      );

    return (
      <div className="space-y-4">
        <Header onExit={() => setPhase("menu")} title="Legend" subtitle="Choose your chapters" />

        {groups.map((group) => {
          const inGroup = TOPICS.filter(
            (t) => t.group === group && legendTopics.includes(t.id)
          );
          const allOn = inGroup.every((t) => chosenTopics.includes(t.id));

          return (
            <div key={group} className="bg-white rounded-3xl border border-slate-200/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {group}
                </h3>
                <button
                  onClick={() =>
                    setChosenTopics((prev) =>
                      allOn
                        ? prev.filter((t) => !inGroup.some((g) => g.id === t))
                        : [...new Set([...prev, ...inGroup.map((g) => g.id)])]
                    )
                  }
                  className="text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  {allOn ? "None" : "All"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {inGroup.map((t) => {
                  const on = chosenTopics.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggle(t.id)}
                      className={`px-3 py-2 rounded-xl text-[11px] font-black border-2 transition-all active:scale-95 cursor-pointer ${
                        on
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          onClick={() => beginRound("legend", chosenTopics)}
          disabled={chosenTopics.length === 0}
          className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-black text-sm rounded-2xl shadow transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
        >
          <Flame className="w-4 h-4" />
          {chosenTopics.length === 0
            ? "Pick at least one chapter"
            : `Start Legend · ${chosenTopics.length} chapters`}
        </button>
      </div>
    );
  }

  // --- results ------------------------------------------------------------

  if (phase === "done") {
    const wrong = answers.filter((a) => !a.correct);
    const pct = Math.round((score / round.length) * 100);

    return (
      <div className="space-y-4">
        <Header onExit={onExit} />

        <div className={`rounded-3xl border-2 p-6 text-center ${accent.chip}`}>
          <Trophy className="w-10 h-10 mx-auto" />
          <p className="text-4xl font-black font-mono mt-2">
            {score}
            <span className="text-lg text-slate-400">/{round.length}</span>
          </p>
          <p className="text-[11px] font-black uppercase tracking-widest mt-1">
            {pct}% · best streak {bestStreak}
          </p>
          <p className="text-xs font-bold mt-2">
            {pct === 100
              ? "Perfect round."
              : pct >= 75
                ? "Strong. Try the next level up."
                : pct >= 50
                  ? "Getting there — check the ones below."
                  : "Worth going through these slowly."}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => beginRound(level, level === "legend" ? chosenTopics : undefined)}
            className={`flex-1 py-3.5 text-white font-black text-sm rounded-2xl shadow transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 ${accent.solid}`}
          >
            <RotateCcw className="w-4 h-4" /> Play again
          </button>
          <button
            onClick={() => setPhase("menu")}
            className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm rounded-2xl transition-all active:scale-95 cursor-pointer"
          >
            Levels
          </button>
        </div>

        {wrong.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
              What went wrong ({wrong.length})
            </h3>
            <div className="space-y-3">
              {wrong.map((a, i) => (
                <div key={i} className="border-l-2 border-rose-300 pl-3">
                  <p className="text-sm font-extrabold text-slate-800">{a.question.prompt}</p>
                  <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                    That statement is {a.question.isTrue ? "correct" : "wrong"} — you said{" "}
                    {a.saidTrue ? "correct" : "wrong"}.
                  </p>
                  <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                    {a.question.explain}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- playing ------------------------------------------------------------

  const timeFraction = secondsLeft / secondsFor(level);

  return (
    <div className="space-y-4">
      <Header onExit={() => setPhase("menu")} title={LEVEL_META[level].label} subtitle="Swipe to judge" />

      {/* Progress and score */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 space-y-3">
        <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-400">
          <span>
            {index + 1} / {round.length}
          </span>
          <span className="flex items-center gap-3">
            {streak >= 3 && (
              <span className="flex items-center gap-1 text-amber-600">
                <Flame className="w-3.5 h-3.5" /> {streak}
              </span>
            )}
            <span className="text-emerald-600">{score} right</span>
          </span>
        </div>

        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-indigo-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${(index / round.length) * 100}%` }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Timer className={`w-3.5 h-3.5 ${timeFraction < 0.3 ? "text-rose-500" : "text-slate-400"}`} />
          <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                timeFraction < 0.3 ? "bg-rose-500" : "bg-slate-300"
              }`}
              style={{ width: `${Math.max(0, timeFraction) * 100}%` }}
            />
          </div>
          <span
            className={`text-[11px] font-black font-mono w-6 text-right ${
              timeFraction < 0.3 ? "text-rose-500" : "text-slate-400"
            }`}
          >
            {secondsLeft}
          </span>
        </div>
      </div>

      {/* The card */}
      <div className="relative h-[300px] select-none">
        {current && (
          <QuestionCard key={current.id} question={current} onAnswer={answer} />
        )}
      </div>

      <div className="flex items-center justify-center gap-6">
        <button
          onClick={() => answer(false)}
          aria-label="Statement is wrong"
          className="w-16 h-16 rounded-full bg-white border-2 border-rose-200 text-rose-500 hover:bg-rose-50 shadow-sm flex items-center justify-center transition-all active:scale-90 cursor-pointer"
        >
          <X className="w-7 h-7" strokeWidth={3} />
        </button>
        <button
          onClick={() => answer(true)}
          aria-label="Statement is correct"
          className="w-16 h-16 rounded-full bg-white border-2 border-emerald-200 text-emerald-500 hover:bg-emerald-50 shadow-sm flex items-center justify-center transition-all active:scale-90 cursor-pointer"
        >
          <Check className="w-7 h-7" strokeWidth={3} />
        </button>
      </div>

      {/* Feedback, pinned above the bottom bar rather than placed in the flow.
          In the flow it lands below the fold on a short screen, which hides the
          explanation — the one moment in the round actually worth reading. Wrong
          answers linger longer than right ones for the same reason. */}
      {flash && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={`fixed left-3 right-3 bottom-20 lg:bottom-6 lg:left-auto lg:right-6 lg:max-w-sm z-40 rounded-2xl border-2 p-3.5 shadow-xl ${
            flash.correct
              ? "bg-emerald-50 border-emerald-300"
              : "bg-rose-50 border-rose-300"
          }`}
        >
          <p
            className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
              flash.correct ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {flash.correct ? <Sparkles className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
            {flash.correct ? "Correct" : "Not quite"}
          </p>
          <p className="text-xs font-semibold text-slate-700 mt-1">{flash.explain}</p>
        </motion.div>
      )}
    </div>
  );
};

function Header({
  onExit,
  title = "Swipe Maths",
  subtitle = "True or false, one swipe each",
}: {
  onExit: () => void;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 p-4 flex items-center gap-3">
      <button
        onClick={onExit}
        aria-label="Back"
        className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      <div className="min-w-0">
        <h2 className="text-lg font-black text-slate-900 leading-tight truncate">{title}</h2>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * The question card. Same imperative-animation approach as the attendance deck:
 * the card leaves in the direction it was thrown, and only transform and
 * opacity animate so the motion stays on the compositor.
 */
function QuestionCard({
  question,
  onAnswer,
}: {
  question: Question;
  onAnswer: (saidTrue: boolean) => void;
}) {
  const x = useMotionValue(0);
  const leaving = useRef(false);

  const rotate = useTransform(x, [-240, 240], [-12, 12]);
  const trueOpacity = useTransform(x, [25, 110], [0, 1]);
  const falseOpacity = useTransform(x, [-110, -25], [1, 0]);
  const trueTint = useTransform(x, [0, 160], [0, 0.45]);
  const falseTint = useTransform(x, [-160, 0], [0.45, 0]);

  const fly = (saidTrue: boolean) => {
    if (leaving.current) return;
    leaving.current = true;
    animate(x, (saidTrue ? 1.3 : -1.3) * window.innerWidth, {
      duration: 0.24,
      ease: [0.2, 0.6, 0.35, 1],
      onComplete: () => onAnswer(saidTrue),
    });
  };

  return (
    <motion.div
      drag="x"
      dragMomentum={false}
      dragElastic={0.7}
      style={{ x, rotate, touchAction: "pan-y", willChange: "transform" }}
      onDragEnd={(_, info) => {
        const { offset, velocity } = info;
        const far = Math.abs(offset.x) > COMMIT_PX;
        const flicked = Math.abs(velocity.x) > 600 && Math.abs(offset.x) > FLICK_MIN_PX;
        if (!far && !flicked) {
          animate(x, 0, { type: "spring", stiffness: 500, damping: 38 });
          return;
        }
        fly(offset.x > 0);
      }}
      initial={{ scale: 0.97, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="absolute inset-0 rounded-3xl bg-white border-2 border-slate-200 shadow-lg flex flex-col items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden px-6"
    >
      <motion.div
        style={{ opacity: trueTint }}
        className="absolute inset-0 bg-emerald-100 pointer-events-none"
      />
      <motion.div
        style={{ opacity: falseTint }}
        className="absolute inset-0 bg-rose-100 pointer-events-none"
      />

      <motion.div
        style={{ opacity: trueOpacity }}
        className="absolute top-5 left-5 border-4 border-emerald-500 text-emerald-500 font-black text-lg uppercase tracking-wider px-3 py-1 rounded-xl -rotate-12 pointer-events-none"
      >
        Correct
      </motion.div>
      <motion.div
        style={{ opacity: falseOpacity }}
        className="absolute top-5 right-5 border-4 border-rose-500 text-rose-500 font-black text-lg uppercase tracking-wider px-3 py-1 rounded-xl rotate-12 pointer-events-none"
      >
        Wrong
      </motion.div>

      <p className="relative text-2xl sm:text-3xl font-black text-slate-900 text-center leading-snug">
        {question.prompt}
      </p>

      <div className="absolute bottom-4 inset-x-0 flex items-center justify-between px-6 text-[10px] font-black uppercase tracking-widest text-slate-300 pointer-events-none">
        <span>← Wrong</span>
        <span>Correct →</span>
      </div>
    </motion.div>
  );
}
