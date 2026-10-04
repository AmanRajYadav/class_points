import { Student } from "../types";

/**
 * Turns a spoken or typed sentence into marks.
 *
 *   "Shourya did his homework and also quiz and Utsav did his homework"
 *
 * The text usually comes from dictation, and dictation does not know these
 * names: Shourya arrives as "Shore", Vaidik as "Vedic". So names are matched by
 * how they sound rather than how they are spelled, every guess is labelled as
 * one, and nothing is written until the teacher has looked at the result. A
 * wrong mark made silently is worse than a word the parser admits it missed.
 *
 * Deliberately not a language model: it runs offline, costs nothing, and gives
 * the same answer for the same sentence every time.
 */

export type Arrival = "onTime" | "late" | "absent";

export interface ParsedMark {
  student: Student;
  arrival: Arrival | null;
  homework: boolean;
  quiz: boolean;
  /** The word as it was heard, when it was not the student's name exactly. */
  heardAs: string | null;
}

export interface ParsedEntry {
  marks: ParsedMark[];
  /** Words that were neither a name, an item, nor filler. */
  unknown: string[];
  /** A word that fits more than one student equally well. */
  ambiguous: Array<{ word: string; candidates: Student[] }>;
  /** Students who were named without saying what they did. */
  nothingSaid: Student[];
}

type Item = Arrival | "homework" | "quiz";

const ITEM_WORDS: Record<string, Item[]> = {
  homework: ["homework"],
  homeworks: ["homework"],
  hw: ["homework"],
  home: ["homework"],
  work: ["homework"],
  assignment: ["homework"],
  solution: ["homework"],
  solutions: ["homework"],
  quiz: ["quiz"],
  quizz: ["quiz"],
  quizzes: ["quiz"],
  quis: ["quiz"],
  kwiz: ["quiz"],
  mcq: ["quiz"],
  mcqs: ["quiz"],
  test: ["quiz"],
  both: ["homework", "quiz"],
  dono: ["homework", "quiz"],
  // "on time" — "on" is filler, so "time" carries it.
  time: ["onTime"],
  ontime: ["onTime"],
  punctual: ["onTime"],
  early: ["onTime"],
  late: ["late"],
  absent: ["absent"],
};

/** The item that follows one of these was *not* done. */
const NEGATIONS = new Set(["not", "no", "didnt", "didn", "hasnt", "without", "except", "nahi", "nahin"]);

/** Words a sentence needs and a mark does not. English, plus the Hindi that
 *  turns up when the two are mixed. */
const FILLER = new Set(
  (
    "a an the and also too plus then but only just so now next same well as " +
    "did does do done has have had is was were are be been " +
    "his her their him he she they it its this that who " +
    "of for to on in at by with from " +
    "sent send sends submitted submit completed complete finished finish gave give got came come " +
    "took take taken attempted attempt solved solve wrote " +
    "today yesterday class sir mam points point marks mark add please ok okay " +
    "screenshot screenshots photo photos picture pictures " +
    "ne kiya kar liya diya bheja bhi aur ka ki ke ko hai ho gaya aaya aayi"
  ).split(" ")
);

/**
 * Spelling folded down to sound, so that the ways one name gets written all
 * land on the same key: Shourya / Shaurya / Shorya, Vaidik / Vedic,
 * Misti / Misty / Mishti, Aarushi / Arushi.
 */
export const soundKey = (word: string): string =>
  word
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/ph/g, "f")
    .replace(/[cq]/g, "k")
    .replace(/([sbdgkt])h/g, "$1")
    .replace(/w/g, "v")
    .replace(/z/g, "s")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/(.)\1+/g, "$1")
    .replace(/y/g, "i")
    .replace(/ai|ei/g, "e")
    .replace(/au|ou/g, "o")
    .replace(/(.)\1+/g, "$1");

const editDistance = (a: string, b: string): number => {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
};

/** 0..1, how well a heard key fits a name key. */
const similarity = (heard: string, name: string): number => {
  if (heard === name) return 1;
  const [short, long] = heard.length < name.length ? [heard, name] : [name, heard];
  // "Utsa" for Utsav, "Alan" for Alankrit: dictation drops the end of a name
  // far more often than it changes the start.
  if (short.length >= 3 && long.startsWith(short)) return 0.9;
  return 1 - editDistance(heard, name) / long.length;
};

/** Below this a word is not a name at all. */
const MIN_SCORE = 0.58;
/** A guess has to beat the runner-up by this much, or it is a coin toss. */
const MIN_LEAD = 0.12;

type NameMatch =
  | { kind: "match"; student: Student; exact: boolean; score: number }
  | { kind: "ambiguous"; candidates: Student[]; score: number }
  | { kind: "none"; score: number };

const matchName = (word: string, students: Student[]): NameMatch => {
  const heard = soundKey(word);
  if (heard.length < 3) return { kind: "none", score: 0 };

  const scored = students
    .map((student) => {
      // Any word of a full name can stand for it; first names are what get said.
      const keys = student.name.split(/\s+/).map(soundKey).filter((k) => k.length >= 2);
      keys.push(soundKey(student.name));
      return { student, score: Math.max(0, ...keys.map((k) => similarity(heard, k))) };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < MIN_SCORE) return { kind: "none", score: best?.score ?? 0 };

  const rivals = scored.filter((s) => s !== best && best.score - s.score < MIN_LEAD);
  if (rivals.length > 0 && !(best.score === 1 && rivals.every((r) => r.score < 1))) {
    return {
      kind: "ambiguous",
      candidates: [best, ...rivals].map((s) => s.student),
      score: best.score,
    };
  }

  return {
    kind: "match",
    student: best.student,
    exact: word.toLowerCase() === best.student.name.split(/\s+/)[0].toLowerCase(),
    score: best.score,
  };
};

interface Group {
  names: Array<{ student: Student; heardAs: string | null }>;
  items: Set<Item>;
}

export function parseQuickEntry(text: string, students: Student[]): ParsedEntry {
  const result: ParsedEntry = { marks: [], unknown: [], ambiguous: [], nothingSaid: [] };
  const groups: Group[] = [];

  // A full stop or a new line ends a thought. Commas do not: dictation scatters
  // them, and "Shourya, Utsav homework" should give both of them the homework.
  for (const sentence of text.split(/[.\n;]+/)) {
    const words = sentence
      .replace(/['’]/g, "")
      .split(/[^\p{L}]+/u)
      .filter(Boolean);

    let group: Group = { names: [], items: new Set() };
    let negated = false;
    // Items can come first ("homework: Shourya, Utsav") or last; only an item
    // said *after* a name means the next name is somebody new.
    let itemSinceName = false;
    // Set by a word that looks like a name but is nobody on the list. Whatever
    // is said next belongs to that person, so it must not land on the student
    // named before them.
    let orphaned = false;

    const close = () => {
      if (group.names.length > 0) groups.push(group);
      group = { names: [], items: new Set() };
      itemSinceName = false;
    };

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const lower = word.toLowerCase();

      if (NEGATIONS.has(lower)) {
        negated = true;
        continue;
      }

      const items = ITEM_WORDS[lower];
      if (items) {
        if (!negated && !orphaned) for (const item of items) group.items.add(item);
        if (group.names.length > 0) itemSinceName = true;
        negated = false;
        continue;
      }

      if (FILLER.has(lower)) continue;

      // A name split in two by dictation ("Alan Krit") matches better joined.
      let match = matchName(word, students);
      const next = words[i + 1];
      const nextIsName =
        next !== undefined &&
        !ITEM_WORDS[next.toLowerCase()] &&
        !FILLER.has(next.toLowerCase()) &&
        !NEGATIONS.has(next.toLowerCase());
      if (!(match.kind === "match" && match.score === 1) && nextIsName) {
        const joined = matchName(word + next, students);
        if (joined.kind === "match" && joined.score > match.score) {
          match = joined;
          i++;
        }
      }

      if (match.kind === "match") {
        // A name after items starts the next person: "A homework, B quiz".
        if (itemSinceName) close();
        group.names.push({ student: match.student, heardAs: match.exact ? null : word });
        negated = false;
        orphaned = false;
      } else if (match.kind === "ambiguous" || word.length >= 3) {
        if (match.kind === "ambiguous") result.ambiguous.push({ word, candidates: match.candidates });
        else result.unknown.push(word);

        // In the middle of a list ("Shourya, Rahul homework" or "homework:
        // Rahul, Shourya") the rest of the list still stands. Anywhere else
        // this word opens a new person's turn, and that person is unknown.
        const midList =
          (group.names.length > 0 && !itemSinceName) ||
          (group.names.length === 0 && group.items.size > 0);
        if (!midList) {
          close();
          orphaned = true;
        }
      }
    }

    close();
  }

  // Someone named twice ends up with one row carrying everything said.
  const byStudent = new Map<string, ParsedMark>();
  for (const group of groups) {
    const arrival = (["onTime", "late", "absent"] as const).find((a) => group.items.has(a)) ?? null;
    for (const { student, heardAs } of group.names) {
      const mark = byStudent.get(student.id) ?? {
        student,
        arrival: null,
        homework: false,
        quiz: false,
        heardAs: null,
      };
      mark.arrival = arrival ?? mark.arrival;
      mark.homework = mark.homework || group.items.has("homework");
      mark.quiz = mark.quiz || group.items.has("quiz");
      mark.heardAs = mark.heardAs ?? heardAs;
      byStudent.set(student.id, mark);
    }
  }

  for (const mark of byStudent.values()) {
    if (mark.arrival || mark.homework || mark.quiz) result.marks.push(mark);
    else result.nothingSaid.push(mark.student);
  }

  return result;
}
