/**
 * Question bank for Swipe Maths.
 *
 * Every question is a *statement* the player judges true or false: swipe right
 * if the maths is right, left if it is wrong. Questions are generated rather
 * than authored, so the bank never runs out.
 *
 * Two rules the generators must hold to:
 *
 *  1. A statement marked true has to be arithmetically true. This is a teaching
 *     tool; a wrong "correct" answer teaches the wrong thing.
 *  2. A false statement has to be plausibly wrong — the answer a student would
 *     reach by making a real mistake (dropped sign, BODMAS ignored, added
 *     denominators). An absurd value makes the game a reading test rather than
 *     a maths one.
 *
 * Topic coverage follows the CBSE Class X course structure (subject code
 * 041/241, 2026-27) for the class 10 topics.
 */

export type Level = "easy" | "medium" | "hard" | "legend";

export type TopicId =
  // foundations
  | "arithmetic"
  | "bodmas"
  | "integers"
  | "fractions"
  | "percentages"
  | "ratio"
  | "powersRoots"
  | "lcmHcf"
  | "simpleEquations"
  | "wordProblems"
  | "surds"
  // class 10
  | "realNumbers"
  | "polynomials"
  | "splitMiddleTerm"
  | "quadratic"
  | "linearPair"
  | "progressions"
  | "trigonometry"
  | "circleAreas"
  | "coordinateGeometry"
  | "statistics"
  | "probability";

export interface TopicDef {
  id: TopicId;
  label: string;
  /** Grouping for the Legend chapter picker. */
  group: "Foundations" | "Class 10";
  levels: Level[];
}

export const TOPICS: TopicDef[] = [
  { id: "arithmetic", label: "Arithmetic", group: "Foundations", levels: ["easy", "medium", "legend"] },
  { id: "bodmas", label: "BODMAS", group: "Foundations", levels: ["easy", "medium", "hard", "legend"] },
  { id: "integers", label: "Integers", group: "Foundations", levels: ["easy", "medium", "legend"] },
  { id: "fractions", label: "Fractions", group: "Foundations", levels: ["easy", "medium", "hard", "legend"] },
  { id: "percentages", label: "Percentages", group: "Foundations", levels: ["easy", "medium", "legend"] },
  { id: "ratio", label: "Ratio & Proportion", group: "Foundations", levels: ["medium", "hard", "legend"] },
  { id: "powersRoots", label: "Powers & Roots", group: "Foundations", levels: ["easy", "medium", "hard", "legend"] },
  { id: "lcmHcf", label: "LCM & HCF", group: "Foundations", levels: ["medium", "hard", "legend"] },
  { id: "simpleEquations", label: "Simple Equations", group: "Foundations", levels: ["medium", "hard", "legend"] },
  { id: "wordProblems", label: "Word Problems", group: "Foundations", levels: ["medium", "hard", "legend"] },
  { id: "surds", label: "Surds", group: "Foundations", levels: ["hard", "legend"] },

  { id: "realNumbers", label: "Real Numbers", group: "Class 10", levels: ["hard", "legend"] },
  { id: "polynomials", label: "Polynomials & Zeroes", group: "Class 10", levels: ["hard", "legend"] },
  { id: "splitMiddleTerm", label: "Splitting the Middle Term", group: "Class 10", levels: ["hard", "legend"] },
  { id: "quadratic", label: "Quadratic Equations", group: "Class 10", levels: ["hard", "legend"] },
  { id: "linearPair", label: "Linear Equations (2 vars)", group: "Class 10", levels: ["hard", "legend"] },
  { id: "progressions", label: "Arithmetic Progressions", group: "Class 10", levels: ["hard", "legend"] },
  { id: "trigonometry", label: "Trigonometry", group: "Class 10", levels: ["hard", "legend"] },
  { id: "circleAreas", label: "Areas Related to Circles", group: "Class 10", levels: ["hard", "legend"] },
  { id: "coordinateGeometry", label: "Coordinate Geometry", group: "Class 10", levels: ["hard", "legend"] },
  { id: "statistics", label: "Statistics", group: "Class 10", levels: ["hard", "legend"] },
  { id: "probability", label: "Probability", group: "Class 10", levels: ["hard", "legend"] },
];

export const topicsForLevel = (level: Level): TopicId[] =>
  TOPICS.filter((t) => t.levels.includes(level)).map((t) => t.id);

export interface Question {
  id: string;
  prompt: string;
  isTrue: boolean;
  topic: TopicId;
  /** Shown after answering, so a wrong swipe teaches something. */
  explain: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(items: readonly T[]): T => items[rnd(0, items.length - 1)];
const coin = () => Math.random() < 0.5;

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number) => Math.abs(a * b) / gcd(a, b);

/** Renders a fraction in lowest terms, as an integer when it divides. */
const frac = (n: number, d: number): string => {
  const g = gcd(n, d) || 1;
  const nn = n / g;
  const dd = d / g;
  if (dd === 1) return `${nn}`;
  return `${nn}/${dd}`;
};

const signed = (n: number) => (n < 0 ? `(${n})` : `${n}`);

/** A non-zero pick, so polynomials never come out degenerate. */
const nonZero = (min: number, max: number): number => {
  let v = 0;
  while (v === 0) v = rnd(min, max);
  return v;
};

/**
 * Renders x² + bx + c the way a textbook would: a coefficient of 1 is implied
 * and a zero term is dropped, so nothing reads as "x² + 0x − 36" or "x² − 1x".
 */
const quad = (b: number, c: number): string => {
  let out = "x²";
  if (b !== 0) out += ` ${b < 0 ? "−" : "+"} ${Math.abs(b) === 1 ? "" : Math.abs(b)}x`;
  if (c !== 0) out += ` ${c < 0 ? "−" : "+"} ${Math.abs(c)}`;
  return out;
};

/** A number formatted for display: trims trailing zeros from decimals. */
const num = (v: number) => (Number.isInteger(v) ? `${v}` : `${Number(v.toFixed(2))}`);

/**
 * Builds the statement. Half the time it states the truth; otherwise it states
 * one of the near-miss values, which are the mistakes a student actually makes.
 */
/**
 * Swaps the hyphen JavaScript produces for a real minus sign, so a statement
 * never mixes the two — "x² − 4 … is -4" looks like a typo in a maths app.
 */
const minus = (text: string): string => text.replace(/-(?=\d)/g, "−");

function statement(
  topic: TopicId,
  render: (shown: string) => string,
  correct: number | string,
  nearMisses: (number | string)[],
  explain: string
): Question {
  const wrongPool = nearMisses.filter((w) => `${w}` !== `${correct}`);
  const asTrue = wrongPool.length === 0 || coin();
  const shown = asTrue ? correct : pick(wrongPool);

  return {
    id: Math.random().toString(36).slice(2, 10),
    prompt: minus(render(`${shown}`)),
    isTrue: asTrue,
    topic,
    explain: minus(explain),
  };
}

// ---------------------------------------------------------------------------
// Foundations
// ---------------------------------------------------------------------------

const genArithmetic = (level: Level): Question => {
  const big = level === "easy" ? 1 : level === "medium" ? 2 : 3;
  const op = pick(["+", "-", "×", "÷"] as const);

  if (op === "÷") {
    const b = rnd(2, big > 1 ? 15 : 9);
    const q = rnd(2, big > 1 ? 20 : 10);
    const a = b * q;
    return statement(
      "arithmetic",
      (s) => `${a} ÷ ${b} = ${s}`,
      q,
      [q + 1, q - 1, q + 10],
      `${a} ÷ ${b} = ${q}`
    );
  }

  if (op === "×") {
    const a = rnd(2, big === 1 ? 12 : big === 2 ? 25 : 60);
    const b = rnd(2, big === 1 ? 12 : big === 2 ? 15 : 30);
    const r = a * b;
    return statement(
      "arithmetic",
      (s) => `${a} × ${b} = ${s}`,
      r,
      [r + a, r - a, r + b, r - 10],
      `${a} × ${b} = ${r}`
    );
  }

  const a = rnd(10, big === 1 ? 99 : big === 2 ? 999 : 9999);
  const b = rnd(10, big === 1 ? 99 : big === 2 ? 999 : 9999);
  if (op === "+") {
    const r = a + b;
    return statement("arithmetic", (s) => `${a} + ${b} = ${s}`, r, [r + 10, r - 10, r + 1, r - 9], `${a} + ${b} = ${r}`);
  }
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const r = hi - lo;
  return statement("arithmetic", (s) => `${hi} − ${lo} = ${s}`, r, [r + 10, r - 10, r + 1], `${hi} − ${lo} = ${r}`);
};

const genBodmas = (level: Level): Question => {
  if (level === "easy") {
    const a = rnd(2, 9);
    const b = rnd(2, 9);
    const c = rnd(2, 9);
    const r = a + b * c;
    return statement(
      "bodmas",
      (s) => `${a} + ${b} × ${c} = ${s}`,
      r,
      // (a+b)×c is the classic error: doing it left to right.
      [(a + b) * c, a + b + c],
      `Multiply first: ${b} × ${c} = ${b * c}, then ${a} + ${b * c} = ${r}`
    );
  }

  if (coin()) {
    const a = rnd(2, 12);
    const b = rnd(2, 9);
    const c = rnd(2, 9);
    const d = rnd(2, 6);
    const r = a + b * c - d;
    return statement(
      "bodmas",
      (s) => `${a} + ${b} × ${c} − ${d} = ${s}`,
      r,
      [(a + b) * c - d, a + b * (c - d), r + d],
      `${b} × ${c} = ${b * c}, so ${a} + ${b * c} − ${d} = ${r}`
    );
  }

  const inner = rnd(2, 9);
  const add = rnd(2, 9);
  const mul = rnd(2, 9);
  const div = pick([2, 3, 4, 5]);
  const bracket = inner + add;
  const r = (bracket * mul) / div;
  if (!Number.isInteger(r)) return genBodmas(level); // retry for a clean value
  return statement(
    "bodmas",
    (s) => `(${inner} + ${add}) × ${mul} ÷ ${div} = ${s}`,
    r,
    [inner + (add * mul) / div, r + 1, bracket * mul],
    `Brackets first: ${bracket}, then ${bracket} × ${mul} = ${bracket * mul}, ÷ ${div} = ${r}`
  );
};

const genIntegers = (): Question => {
  const a = rnd(-30, 30);
  const b = rnd(-30, 30);
  if (coin()) {
    const r = a + b;
    return statement(
      "integers",
      (s) => `${signed(a)} + ${signed(b)} = ${s}`,
      r,
      // -(a+b) only reads as a slip when at least one operand is negative.
      [a - b, ...(a < 0 || b < 0 ? [-(a + b)] : []), r + 1],
      `${a} + ${b} = ${r}`
    );
  }
  const r = a * b;
  const bothNegative = a < 0 && b < 0;
  const mixedSigns = a < 0 !== b < 0;
  return statement(
    "integers",
    (s) => `${signed(a)} × ${signed(b)} = ${s}`,
    r,
    // Flipping the sign is only a believable mistake when a sign is involved.
    [...(bothNegative || mixedSigns ? [-r] : []), r + a, r - b],
    bothNegative
      ? `A negative times a negative is positive: ${a} × ${b} = ${r}`
      : mixedSigns
        ? `Opposite signs give a negative: ${a} × ${b} = ${r}`
        : `${a} × ${b} = ${r}`
  );
};

const genFractions = (level: Level): Question => {
  const d1 = rnd(2, level === "easy" ? 6 : 12);
  const d2 = rnd(2, level === "easy" ? 6 : 12);
  const n1 = rnd(1, d1 - 1 || 1);
  const n2 = rnd(1, d2 - 1 || 1);

  if (coin()) {
    const den = lcm(d1, d2);
    const numr = n1 * (den / d1) + n2 * (den / d2);
    return statement(
      "fractions",
      (s) => `${n1}/${d1} + ${n2}/${d2} = ${s}`,
      frac(numr, den),
      // Adding numerators and denominators straight across is the standard slip.
      [frac(n1 + n2, d1 + d2), frac(n1 + n2, den), frac(numr + 1, den)],
      `Common denominator ${den}: ${frac(numr, den)}`
    );
  }

  const numr = n1 * n2;
  const den = d1 * d2;
  return statement(
    "fractions",
    (s) => `${n1}/${d1} × ${n2}/${d2} = ${s}`,
    frac(numr, den),
    [frac(n1 * d2, d1 * n2), frac(numr + 1, den)],
    `Multiply across: ${n1 * n2}/${d1 * d2} = ${frac(numr, den)}`
  );
};

const genPercentages = (): Question => {
  const pct = pick([5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 75]);
  const base = pick([40, 60, 80, 120, 150, 200, 240, 300, 400, 500]);
  const r = (pct / 100) * base;
  return statement(
    "percentages",
    (s) => `${pct}% of ${base} = ${s}`,
    num(r),
    // Doubling, halving and a ten-percent slip: all whole-number mistakes.
    [num(r * 2), num(r / 2), num((pct / 10 / 100) * base)],
    `${pct}% of ${base} = ${num(r)}`
  );
};

const genRatio = (): Question => {
  const g = rnd(2, 9);
  const a = rnd(2, 9) * g;
  let b = rnd(2, 9) * g;
  // "shared in the ratio 63 : 63" is not a ratio question.
  while (b === a) b = rnd(2, 9) * g;
  if (coin()) {
    const d = gcd(a, b);
    return statement(
      "ratio",
      (s) => `${a} : ${b} in simplest form is ${s}`,
      `${a / d} : ${b / d}`,
      [`${a / g} : ${b / g}`, `${b / d} : ${a / d}`],
      `HCF of ${a} and ${b} is ${d}, giving ${a / d} : ${b / d}`
    );
  }
  // Sharing an amount in a ratio.
  const total = (a + b) * rnd(2, 5);
  const share = (total * a) / (a + b);
  return statement(
    "ratio",
    (s) => `₹${total} shared in the ratio ${a} : ${b} gives the first person ₹${s}`,
    num(share),
    [num(total - share), num(total / 2), num(share + a)],
    `${a} parts of ${a + b}: ${a}/${a + b} × ${total} = ${num(share)}`
  );
};

const genPowersRoots = (level: Level): Question => {
  if (coin()) {
    const n = rnd(2, level === "easy" ? 15 : 25);
    const r = n * n;
    return statement("powersRoots", (s) => `${n}² = ${s}`, r, [r + n, r - n, n * 2], `${n}² = ${r}`);
  }
  const n = rnd(2, level === "easy" ? 12 : 30);
  const sq = n * n;
  return statement("powersRoots", (s) => `√${sq} = ${s}`, n, [n + 1, n - 1, sq / 2], `${n} × ${n} = ${sq}`);
};

const genLcmHcf = (): Question => {
  const a = rnd(4, 60);
  const b = rnd(4, 60);
  if (coin()) {
    const h = gcd(a, b);
    return statement("lcmHcf", (s) => `HCF of ${a} and ${b} is ${s}`, h, [lcm(a, b), h * 2, 1], `HCF(${a}, ${b}) = ${h}`);
  }
  const l = lcm(a, b);
  return statement("lcmHcf", (s) => `LCM of ${a} and ${b} is ${s}`, l, [gcd(a, b), a * b, l / 2], `LCM(${a}, ${b}) = ${l}`);
};

const genSimpleEquations = (): Question => {
  const x = rnd(-12, 15);
  const a = rnd(2, 12);
  const b = rnd(-20, 20);
  const rhs = a * x + b;
  return statement(
    "simpleEquations",
    (s) => `If ${a}x ${b < 0 ? "−" : "+"} ${Math.abs(b)} = ${rhs}, then x = ${s}`,
    x,
    // Sign slip on the transposed constant, and forgetting to divide.
    [(rhs + b) / a, rhs - b, -x].map((v) => (Number.isInteger(v) ? v : Math.round(v))),
    `${a}x = ${rhs - b}, so x = ${x}`
  );
};

const genWordProblems = (): Question => {
  const kind = rnd(0, 3);

  if (kind === 0) {
    const speed = pick([40, 45, 50, 60, 72, 80]);
    const hours = pick([2, 3, 4, 5]);
    const dist = speed * hours;
    return statement(
      "wordProblems",
      (s) => `A car at ${speed} km/h covers ${dist} km in ${s} hours`,
      hours,
      [hours + 1, hours - 1, dist / 100],
      `Time = distance ÷ speed = ${dist} ÷ ${speed} = ${hours} h`
    );
  }

  if (kind === 1) {
    const cp = pick([200, 250, 400, 500, 800, 1200]);
    const profitPct = pick([10, 15, 20, 25]);
    const sp = cp + (cp * profitPct) / 100;
    return statement(
      "wordProblems",
      (s) => `An item bought for ₹${cp} and sold at ${profitPct}% profit sells for ₹${s}`,
      num(sp),
      [num(cp - (cp * profitPct) / 100), num(cp + profitPct), num(sp + cp / 10)],
      `Profit = ₹${num((cp * profitPct) / 100)}, so SP = ₹${num(sp)}`
    );
  }

  if (kind === 2) {
    const men = rnd(4, 12);
    const days = rnd(4, 15);
    const work = men * days;
    const newMen = pick([2, 3, 4, 6]);
    const newDays = work / newMen;
    if (!Number.isInteger(newDays)) return genWordProblems();
    return statement(
      "wordProblems",
      (s) => `If ${men} workers finish a job in ${days} days, ${newMen} workers take ${s} days`,
      newDays,
      [days, newDays / 2, newDays + newMen],
      `Total work = ${work} worker-days, so ${work} ÷ ${newMen} = ${newDays} days`
    );
  }

  const age = rnd(8, 20);
  const factor = pick([2, 3, 4]);
  const fatherAge = age * factor;
  return statement(
    "wordProblems",
    (s) => `A father is ${factor} times his son's age. If the son is ${age}, the father is ${s}`,
    fatherAge,
    [age + factor, fatherAge - age, fatherAge + factor],
    `${factor} × ${age} = ${fatherAge}`
  );
};

const genSurds = (): Question => {
  const kind = rnd(0, 2);

  if (kind === 0) {
    // √(a²b) = a√b
    const a = rnd(2, 6);
    const b = pick([2, 3, 5, 6, 7, 10]);
    const inside = a * a * b;
    return statement(
      "surds",
      (s) => `√${inside} = ${s}`,
      `${a}√${b}`,
      [`${a * b}√${b}`, `${a}√${b * a}`, `${a + b}√${b}`],
      `${inside} = ${a * a} × ${b}, so √${inside} = ${a}√${b}`
    );
  }

  if (kind === 1) {
    // √a × √b = √(ab)
    const a = pick([2, 3, 5, 6, 7]);
    const b = pick([2, 3, 5, 6, 7]);
    return statement(
      "surds",
      (s) => `√${a} × √${b} = ${s}`,
      `√${a * b}`,
      [`√${a + b}`, `${a * b}`, `2√${a * b}`],
      `√a × √b = √(ab) = √${a * b}`
    );
  }

  // Rationalising 1/√a
  const a = pick([2, 3, 5, 7, 11]);
  return statement(
    "surds",
    (s) => `1/√${a} = ${s}`,
    `√${a}/${a}`,
    [`${a}/√${a}`, `√${a}/${a * a}`, `1/${a}`],
    `Multiply top and bottom by √${a}: √${a}/${a}`
  );
};

// ---------------------------------------------------------------------------
// Class 10
// ---------------------------------------------------------------------------

const genRealNumbers = (): Question => {
  const kind = rnd(0, 2);

  if (kind === 0) {
    const a = rnd(6, 40);
    const b = rnd(6, 40);
    const product = a * b;
    return statement(
      "realNumbers",
      (s) => `For ${a} and ${b}, HCF × LCM = ${s}`,
      product,
      [a + b, product / 2, gcd(a, b) * gcd(a, b)],
      `HCF × LCM always equals the product: ${a} × ${b} = ${product}`
    );
  }

  if (kind === 1) {
    const irr = pick([2, 3, 5, 6, 7, 10, 11, 13]);
    const perfect = pick([4, 9, 16, 25, 36, 49, 100]);
    const useIrrational = coin();
    const n = useIrrational ? irr : perfect;
    const claimIrrational = coin();
    const actuallyIrrational = !Number.isInteger(Math.sqrt(n));
    return {
      id: Math.random().toString(36).slice(2, 10),
      prompt: `√${n} is ${claimIrrational ? "irrational" : "rational"}`,
      isTrue: claimIrrational === actuallyIrrational,
      topic: "realNumbers",
      explain: actuallyIrrational
        ? `${n} is not a perfect square, so √${n} is irrational`
        : `√${n} = ${Math.sqrt(n)}, a whole number, so it is rational`,
    };
  }

  // Terminating decimal test: denominator of the form 2^m·5^n.
  const den = pick([8, 20, 25, 40, 50, 3, 6, 7, 9, 11, 12]);
  const numr = rnd(1, den - 1);
  let stripped = den;
  while (stripped % 2 === 0) stripped /= 2;
  while (stripped % 5 === 0) stripped /= 5;
  const terminates = stripped === 1;
  const claimTerminates = coin();
  return {
    id: Math.random().toString(36).slice(2, 10),
    prompt: `The decimal expansion of ${numr}/${den} ${claimTerminates ? "terminates" : "is non-terminating"}`,
    isTrue: claimTerminates === terminates,
    topic: "realNumbers",
    explain: terminates
      ? `${den} factorises as 2ᵐ × 5ⁿ, so it terminates`
      : `${den} has a prime factor other than 2 or 5, so it does not terminate`,
  };
};

const genPolynomials = (): Question => {
  // Build from known roots so the coefficients are always consistent.
  const r1 = nonZero(-9, 9);
  const r2 = nonZero(-9, 9);
  const b = -(r1 + r2); // x² + bx + c
  const c = r1 * r2;
  const poly = quad(b, c);

  if (coin()) {
    const sum = r1 + r2;
    return statement(
      "polynomials",
      (s) => `For ${poly}, the sum of the zeroes is ${s}`,
      sum,
      // Forgetting the minus in -b/a is the usual error.
      [b, r1 * r2, sum + 1],
      `Sum of zeroes = −b/a = ${sum}`
    );
  }

  const product = r1 * r2;
  return statement(
    "polynomials",
    (s) => `For ${poly}, the product of the zeroes is ${s}`,
    product,
    [-product, r1 + r2, product + 1],
    `Product of zeroes = c/a = ${product}`
  );
};

const genSplitMiddleTerm = (): Question => {
  const p = rnd(1, 9);
  const q = rnd(1, 9);
  const b = p + q;
  const c = p * q;
  return statement(
    "splitMiddleTerm",
    (s) => `x² + ${b}x + ${c} = ${s}`,
    `(x + ${p})(x + ${q})`,
    [`(x + ${b})(x + ${c})`, `(x − ${p})(x − ${q})`, `(x + ${p + 1})(x + ${q})`],
    `${p} + ${q} = ${b} and ${p} × ${q} = ${c}, so it splits as (x + ${p})(x + ${q})`
  );
};

const genQuadratic = (): Question => {
  const a = 1;
  const r1 = nonZero(-8, 8);
  const r2 = rnd(1, 4) === 1 ? r1 : nonZero(-8, 8); // equal roots a quarter of the time
  const b = -(r1 + r2);
  const c = r1 * r2;
  const disc = b * b - 4 * a * c;
  const poly = `${quad(b, c)} = 0`;

  if (coin()) {
    return statement(
      "quadratic",
      (s) => `For ${poly}, the discriminant is ${s}`,
      disc,
      [b * b + 4 * a * c, disc + 4, -disc],
      `b² − 4ac = ${b * b} − ${4 * c} = ${disc}`
    );
  }

  const nature = disc > 0 ? "two distinct real roots" : disc === 0 ? "two equal real roots" : "no real roots";
  const claim = pick(["two distinct real roots", "two equal real roots", "no real roots"] as const);
  return {
    id: Math.random().toString(36).slice(2, 10),
    prompt: `${poly} has ${claim}`,
    isTrue: claim === nature,
    topic: "quadratic",
    explain: `Discriminant = ${disc}, so it has ${nature}`,
  };
};

const genLinearPair = (): Question => {
  const a1 = rnd(1, 6);
  const b1 = rnd(1, 6);
  const k = rnd(2, 4);
  const kind = rnd(0, 2);

  // kind 0: unique (ratios of a and b differ), 1: infinite (all three equal),
  // 2: no solution (a,b equal but c differs)
  const a2 = kind === 0 ? a1 + rnd(1, 3) : a1 * k;
  const b2 = kind === 0 ? b1 : b1 * k;
  const c1 = rnd(1, 9);
  const c2 = kind === 1 ? c1 * k : kind === 2 ? c1 * k + 1 : rnd(1, 9);

  const sameAB = a1 * b2 === a2 * b1;
  const sameBC = b1 * c2 === b2 * c1;
  const truth = !sameAB ? "a unique solution" : sameBC ? "infinitely many solutions" : "no solution";

  const claim = pick(["a unique solution", "infinitely many solutions", "no solution"] as const);
  return {
    id: Math.random().toString(36).slice(2, 10),
    prompt: `The pair ${a1}x + ${b1}y = ${c1} and ${a2}x + ${b2}y = ${c2} has ${claim}`,
    isTrue: claim === truth,
    topic: "linearPair",
    explain:
      truth === "a unique solution"
        ? `a₁/a₂ ≠ b₁/b₂, so the lines meet once`
        : truth === "infinitely many solutions"
          ? `a₁/a₂ = b₁/b₂ = c₁/c₂, so the lines coincide`
          : `a₁/a₂ = b₁/b₂ ≠ c₁/c₂, so the lines are parallel`,
  };
};

const genProgressions = (): Question => {
  const a = rnd(-10, 20);
  const d = rnd(-9, 9) || 3;
  const n = rnd(4, 20);

  if (coin()) {
    const term = a + (n - 1) * d;
    return statement(
      "progressions",
      (s) => `In the AP with first term ${a} and common difference ${d}, the ${n}th term is ${s}`,
      term,
      // a + nd is the classic off-by-one.
      [a + n * d, term + d, a * n],
      `aₙ = a + (n−1)d = ${a} + ${n - 1} × ${d} = ${term}`
    );
  }

  const sum = (n * (2 * a + (n - 1) * d)) / 2;
  return statement(
    "progressions",
    (s) => `The sum of the first ${n} terms of the AP ${a}, ${a + d}, ${a + 2 * d}, … is ${s}`,
    num(sum),
    // Using n instead of (n−1) is the usual error; keep it a whole number so
    // the wrong answer looks like a real attempt rather than a typo.
    [num(sum + d), num(Math.round((n * (2 * a + n * d)) / 2)), num(a + (n - 1) * d)],
    `Sₙ = n/2 [2a + (n−1)d] = ${num(sum)}`
  );
};

const TRIG: { fn: string; angle: number; value: string }[] = [
  { fn: "sin", angle: 0, value: "0" },
  { fn: "sin", angle: 30, value: "1/2" },
  { fn: "sin", angle: 45, value: "1/√2" },
  { fn: "sin", angle: 60, value: "√3/2" },
  { fn: "sin", angle: 90, value: "1" },
  { fn: "cos", angle: 0, value: "1" },
  { fn: "cos", angle: 30, value: "√3/2" },
  { fn: "cos", angle: 45, value: "1/√2" },
  { fn: "cos", angle: 60, value: "1/2" },
  { fn: "cos", angle: 90, value: "0" },
  { fn: "tan", angle: 0, value: "0" },
  { fn: "tan", angle: 30, value: "1/√3" },
  { fn: "tan", angle: 45, value: "1" },
  { fn: "tan", angle: 60, value: "√3" },
];

const IDENTITIES: { text: string; ok: boolean; why: string }[] = [
  { text: "sin²θ + cos²θ = 1", ok: true, why: "The fundamental identity." },
  { text: "1 + tan²θ = sec²θ", ok: true, why: "Divide sin²θ + cos²θ = 1 by cos²θ." },
  { text: "1 + cot²θ = cosec²θ", ok: true, why: "Divide sin²θ + cos²θ = 1 by sin²θ." },
  { text: "1 + tan²θ = cosec²θ", ok: false, why: "1 + tan²θ = sec²θ, not cosec²θ." },
  { text: "sin²θ − cos²θ = 1", ok: false, why: "The identity is a sum, not a difference." },
  { text: "sin(90° − θ) = cos θ", ok: true, why: "Complementary angles swap sin and cos." },
  { text: "cos(90° − θ) = sin θ", ok: true, why: "Complementary angles swap sin and cos." },
  { text: "tan(90° − θ) = tan θ", ok: false, why: "tan(90° − θ) = cot θ." },
  { text: "sec²θ − tan²θ = 1", ok: true, why: "Rearranged from 1 + tan²θ = sec²θ." },
];

const genTrigonometry = (): Question => {
  if (coin()) {
    const entry = pick(TRIG);
    const others = TRIG.filter((t) => t.fn === entry.fn && t.value !== entry.value).map((t) => t.value);
    return statement(
      "trigonometry",
      (s) => `${entry.fn} ${entry.angle}° = ${s}`,
      entry.value,
      others,
      `${entry.fn} ${entry.angle}° = ${entry.value}`
    );
  }
  const id = pick(IDENTITIES);
  return {
    id: Math.random().toString(36).slice(2, 10),
    prompt: id.text,
    isTrue: id.ok,
    topic: "trigonometry",
    explain: id.why,
  };
};

const genCircleAreas = (): Question => {
  // Radii that are multiples of 7 keep π = 22/7 exact.
  const r = pick([7, 14, 21, 28]);
  const kind = rnd(0, 2);

  if (kind === 0) {
    const area = (22 / 7) * r * r;
    return statement(
      "circleAreas",
      (s) => `The area of a circle of radius ${r} cm is ${s} cm² (π = 22/7)`,
      num(area),
      [num(2 * (22 / 7) * r), num(area / 2), num((22 / 7) * r)],
      `πr² = 22/7 × ${r}² = ${num(area)} cm²`
    );
  }

  if (kind === 1) {
    const angle = pick([30, 45, 60, 90, 120, 180]);
    const sector = (angle / 360) * (22 / 7) * r * r;
    return statement(
      "circleAreas",
      (s) => `A sector of angle ${angle}° in a circle of radius ${r} cm has area ${s} cm² (π = 22/7)`,
      num(sector),
      [num((angle / 360) * 2 * (22 / 7) * r), num(sector * 2), num((22 / 7) * r * r)],
      `(${angle}/360) × πr² = ${num(sector)} cm²`
    );
  }

  const angle = pick([30, 45, 60, 90, 120, 180]);
  const arc = (angle / 360) * 2 * (22 / 7) * r;
  return statement(
    "circleAreas",
    (s) => `The arc length for a ${angle}° angle in a circle of radius ${r} cm is ${s} cm (π = 22/7)`,
    num(arc),
    [num((angle / 360) * (22 / 7) * r * r), num(arc * 2), num(2 * (22 / 7) * r)],
    `(${angle}/360) × 2πr = ${num(arc)} cm`
  );
};

const genCoordinateGeometry = (): Question => {
  if (coin()) {
    // Pythagorean triples keep the distance whole.
    const [dx, dy, dist] = pick([
      [3, 4, 5],
      [6, 8, 10],
      [5, 12, 13],
      [8, 15, 17],
      [9, 12, 15],
    ] as const);
    const x1 = rnd(-6, 6);
    const y1 = rnd(-6, 6);
    return statement(
      "coordinateGeometry",
      (s) => `The distance between (${x1}, ${y1}) and (${x1 + dx}, ${y1 + dy}) is ${s}`,
      dist,
      [dx + dy, dist + 1, dx * dy],
      `√(${dx}² + ${dy}²) = √${dx * dx + dy * dy} = ${dist}`
    );
  }

  const x1 = rnd(-8, 8);
  const y1 = rnd(-8, 8);
  const x2 = x1 + 2 * rnd(1, 6);
  const y2 = y1 + 2 * rnd(1, 6);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return statement(
    "coordinateGeometry",
    (s) => `The midpoint of (${x1}, ${y1}) and (${x2}, ${y2}) is ${s}`,
    `(${mx}, ${my})`,
    [`(${x2 - x1}, ${y2 - y1})`, `(${mx + 1}, ${my})`, `(${my}, ${mx})`],
    `Midpoint = ((${x1}+${x2})/2, (${y1}+${y2})/2) = (${mx}, ${my})`
  );
};

const genStatistics = (): Question => {
  const count = rnd(5, 7);
  const values = Array.from({ length: count }, () => rnd(1, 40));

  if (coin()) {
    // Nudge the last value so the mean is a whole number. Comparing 23.86 with
    // 24.86 is a reading test, not a maths one.
    const partial = values.slice(0, -1).reduce((acc, v) => acc + v, 0);
    const remainder = partial % count;
    values[count - 1] = (remainder === 0 ? count : count - remainder) + count * rnd(1, 4);
    const total = values.reduce((s, v) => s + v, 0);
    const mean = total / count;
    return statement(
      "statistics",
      (s) => `The mean of ${values.join(", ")} is ${s}`,
      num(mean),
      [num(total), num(mean + 1), num(total / (count - 1))],
      `Sum ${total} ÷ ${count} = ${num(mean)}`
    );
  }

  const sorted = [...values].sort((a, b) => a - b);
  const median =
    count % 2 === 1
      ? sorted[(count - 1) / 2]
      : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;
  return statement(
    "statistics",
    (s) => `The median of ${values.join(", ")} is ${s}`,
    num(median),
    // Taking the middle of the unsorted list is the usual mistake.
    [num(values[Math.floor(count / 2)]), num(median + 1), num(sorted[0])],
    `Sorted: ${sorted.join(", ")} — the middle value is ${num(median)}`
  );
};

const genProbability = (): Question => {
  const kind = rnd(0, 2);

  if (kind === 0) {
    const favourable = pick([2, 3, 4, 5, 6]);
    return statement(
      "probability",
      (s) => `The probability of rolling a number less than ${favourable} on a fair die is ${s}`,
      frac(favourable - 1, 6),
      [frac(favourable, 6), frac(6 - favourable, 6), frac(1, 6)],
      `${favourable - 1} of the 6 faces qualify: ${frac(favourable - 1, 6)}`
    );
  }

  if (kind === 1) {
    const red = rnd(2, 9);
    const blue = rnd(2, 9);
    const total = red + blue;
    return statement(
      "probability",
      (s) => `A bag holds ${red} red and ${blue} blue balls. P(red) = ${s}`,
      frac(red, total),
      [frac(red, blue), frac(blue, total), frac(1, total)],
      `${red} favourable out of ${total}: ${frac(red, total)}`
    );
  }

  const p = pick([
    [1, 4],
    [1, 3],
    [2, 5],
    [3, 8],
    [1, 2],
  ] as const);
  return statement(
    "probability",
    (s) => `If P(E) = ${p[0]}/${p[1]}, then P(not E) = ${s}`,
    frac(p[1] - p[0], p[1]),
    [frac(p[0], p[1]), frac(p[1], p[0]), `1`],
    `P(not E) = 1 − ${p[0]}/${p[1]} = ${frac(p[1] - p[0], p[1])}`
  );
};

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const GENERATORS: Record<TopicId, (level: Level) => Question> = {
  arithmetic: genArithmetic,
  bodmas: genBodmas,
  integers: genIntegers,
  fractions: genFractions,
  percentages: genPercentages,
  ratio: genRatio,
  powersRoots: genPowersRoots,
  lcmHcf: genLcmHcf,
  simpleEquations: genSimpleEquations,
  wordProblems: genWordProblems,
  surds: genSurds,
  realNumbers: genRealNumbers,
  polynomials: genPolynomials,
  splitMiddleTerm: genSplitMiddleTerm,
  quadratic: genQuadratic,
  linearPair: genLinearPair,
  progressions: genProgressions,
  trigonometry: genTrigonometry,
  circleAreas: genCircleAreas,
  coordinateGeometry: genCoordinateGeometry,
  statistics: genStatistics,
  probability: genProbability,
};

/** Generates one question from the allowed topics, falling back to the level's own set. */
export function generateQuestion(level: Level, allowed?: TopicId[]): Question {
  const pool = allowed?.length ? allowed : topicsForLevel(level);
  const topic = pick(pool);
  return GENERATORS[topic](level);
}

/**
 * A round of exactly `count` questions.
 *
 * Two comfort rules, both conditional: no topic three times running, and no
 * repeated prompt. The first is impossible to honour when the player picks one
 * or two chapters, so it only applies once the pool is wide enough — otherwise
 * a single-chapter Legend round came back short while the UI had already
 * promised "/12". If a narrow pool still cannot fill the round with unique
 * prompts, repeats are preferable to a round that is quietly the wrong length.
 */
export function generateRound(level: Level, count: number, allowed?: TopicId[]): Question[] {
  const pool = allowed?.length ? allowed : topicsForLevel(level);
  const avoidRuns = pool.length >= 3;

  const out: Question[] = [];
  const usedPrompts = new Set<string>();
  let guard = 0;

  while (out.length < count && guard < count * 60) {
    guard++;
    const q = generateQuestion(level, pool);

    if (usedPrompts.has(q.prompt)) continue;
    if (avoidRuns) {
      const previousTwo = out.slice(-2);
      if (previousTwo.length === 2 && previousTwo.every((p) => p.topic === q.topic)) continue;
    }

    usedPrompts.add(q.prompt);
    out.push(q);
  }

  while (out.length < count) out.push(generateQuestion(level, pool));

  return out;
}

/** Seconds allowed per question. Legend is deliberately tight. */
export const secondsFor = (level: Level): number =>
  level === "easy" ? 15 : level === "medium" ? 20 : level === "hard" ? 25 : 20;

export const LEVEL_META: Record<Level, { label: string; blurb: string; accent: string }> = {
  easy: { label: "Easy", blurb: "Tables, basic operations, simple fractions", accent: "emerald" },
  medium: { label: "Medium", blurb: "BODMAS, integers, ratio, equations", accent: "sky" },
  hard: { label: "Hard", blurb: "Full Class 10 syllabus", accent: "violet" },
  legend: { label: "Legend", blurb: "Everything, timed — pick your chapters", accent: "amber" },
};
