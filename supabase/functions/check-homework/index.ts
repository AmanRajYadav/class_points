// Fluence — first review of an uploaded homework by Gemini.
//
// Called by the app right after homework is sent, and by staff with "check
// again". It reads the pages, compares them with that student's own questions
// and answers for the day (public.homework_days, which students can never
// read), and writes the verdict to homework_submissions.ai. It never changes a
// point; the only thing it decides is `needs_review`.
//
// 27 Nov 2026: the homework has two parts in one PDF, maths first, then science
// (Aman: "First they will write maths, then they will write science"). Science
// is the same for every child and is numbered on after the maths (Q7 onwards).
//
// WHO MAY SPEND THE API CREDIT HERE
//   Staff: any homework, as often as they like.
//   A student: only their own homework, only when it has no reading yet, and at
//   most 3 AI runs per homework (ai_runs). A finished reading is returned as it
//   is, without calling Google again. So a student cannot run up the bill.
//
// Secrets: GEMINI_API_KEY (required), GEMINI_MODEL (optional; tried first).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_PAGES = 12;
const STUDENT_RUNS = 3;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const toBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    readable: { type: "BOOLEAN" },
    blank_or_unrelated: { type: "BOOLEAN" },
    handwritten: { type: "BOOLEAN" },
    looks_machine_made: { type: "BOOLEAN" },
    other_homework: { type: "BOOLEAN" },
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          n: { type: "INTEGER" },
          attempted: { type: "BOOLEAN" },
          verdict: { type: "STRING", enum: ["right", "wrong", "unclear", "not_attempted", "different_question"] },
          note: { type: "STRING" },
          mistake: { type: "STRING" },
          cause: { type: "STRING", enum: ["none", "concept", "formula", "calculation", "diagram", "reading_the_question", "incomplete", "copied_answer_only", "cannot_tell"] },
        },
        required: ["n", "attempted", "verdict"],
      },
    },
    needs_review: { type: "BOOLEAN" },
    reason: { type: "STRING" },
    for_teacher: { type: "STRING" },
  },
  required: ["readable", "blank_or_unrelated", "handwritten", "looks_machine_made", "other_homework", "questions", "needs_review", "reason"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ error: "no_key", message: "GEMINI_API_KEY is not set yet." }, 503);

    const { submission_id } = await req.json();
    if (!submission_id) return json({ error: "submission_id is required" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    // Who is asking: staff, or the student who owns this homework. Nobody else.
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: visible } = await asUser.from("homework_submissions").select("id").eq("id", submission_id).maybeSingle();
    if (!visible) return json({ error: "not_allowed" }, 403);
    const { data: staff } = await asUser.rpc("can_teach");

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sub } = await admin.from("homework_submissions").select("*").eq("id", submission_id).single();
    const runs = Number(sub.ai_runs ?? 0);
    if (staff !== true) {
      // A student gets the reading that exists; Google is not called again.
      if (sub.ai && !sub.ai.error) return json({ ok: true, ai: sub.ai, cached: true });
      if (runs >= STUDENT_RUNS) return json({ error: "limit", message: "This homework has been checked the allowed number of times. Sir can run it again." }, 429);
    }
    await admin.from("homework_submissions").update({ ai_runs: runs + 1 }).eq("id", submission_id);

    const { data: student } = await admin.from("students").select("branch").eq("id", sub.student_id).single();
    const { data: day } = await admin
      .from("homework_days").select("data").eq("hw_date", sub.hw_date).eq("branch", student?.branch ?? "").maybeSingle();
    const questions: [string, string][] = [];
    const name = day?.data?.ids?.[sub.student_id] as string | undefined;
    if (day?.data?.common && name) {
      for (const qa of day.data.common as [string, string][]) questions.push([qa[0], qa[1]]);
      for (const k of [day.data.ranks?.[name], name]) {
        const swaps = (k && day.data.swap?.[k]) || {};
        for (const pos of Object.keys(swaps)) questions[Number(pos) - 1] = swaps[pos];
      }
    }
    // Science, the same for every child, written after the maths: numbered on from the maths.
    const nMaths = questions.length;
    if (name) for (const qa of (day?.data?.science ?? []) as [string, string][]) questions.push([qa[0], qa[1]]);
    const nSci = questions.length - nMaths;

    const parts: unknown[] = [];
    for (const path of (sub.files as string[]).slice(0, MAX_PAGES)) {
      const { data: blob } = await admin.storage.from("homework").download(path);
      if (!blob) continue;
      parts.push({
        inline_data: {
          mime_type: path.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
          data: toBase64(new Uint8Array(await blob.arrayBuffer())),
        },
      });
    }
    if (parts.length === 0) return json({ error: "no_pages" }, 422);

    const n = questions.length;
    const list = n
      ? questions
          .map(([q, a], i) =>
            (i === 0 && nSci ? "PART 1: MATHS\n" : "") +
            (i === nMaths && nSci ? "PART 2: SCIENCE (written after the maths; the student may number these 1, 2, 3 again)\n" : "") +
            `Q${i + 1}. ${q}\n   Teacher's answer: ${a}`)
          .join("\n")
      : "(The question list for this day is not available. Judge only whether real handwritten maths work is present, and return an empty questions array.)";
    const minAttempted = Math.ceil(Math.max(n, 1) * 0.7);
    const maxDoubt = Math.max(2, Math.ceil(n * 0.3));
    const sciRules = nSci
      ? `
The homework has two parts in one PDF: first the ${nMaths} maths questions under the heading Maths, then the ${nSci} science questions under the heading Science. The student usually numbers the science answers from 1 again; match them by the heading and the content, and report them with the numbers above (science starts at Q${nMaths + 1}).
For science, an answer is "right" when it has the key points of the teacher's answer (the balanced equation, the named term, the reason, the value with its unit); the wording may differ. Missing a key point that carries a mark makes it "wrong".`
      : "";

    const prompt = `You are the first reviewer of a Class 10 (CBSE) student's homework for a teacher in India.
The images are photos of the student's notebook pages. The student was given these ${n} questions for this date; a fraction written {a|b} means a over b.${sciRules}

${list}

For each question decide: was it attempted, and does the student's FINAL answer agree with the teacher's answer (equal value counts: 17.32 and 10√3 agree). Use "unclear" whenever you cannot read the work or cannot find that question. Never guess "right".
IMPORTANT: students often send an OLDER day's homework. If the work under a question number uses clearly different given numbers or is a different kind of question from the one listed above (for example the list says a 25.5 m building and the page says a 30 m tower, or the list asks for HCF and the page solves two linear equations), the student was answering another list: give that question the verdict "different_question", attempted true, and put what the student actually solved in "note". Do NOT call it "wrong" and do not blame "reading the question". If most of the attempted work is like this, set other_homework to true; otherwise false.
Also decide: are the pages readable; are they blank or unrelated to this homework altogether; is it handwritten; does it look machine-made (typed, printed, or copied text from an AI tool instead of the student's own handwriting and working).
Set needs_review to true if anything is unreadable, blank, unrelated, machine-made, if other_homework is true, if fewer than ${minAttempted} of the ${n} questions are attempted, or if ${maxDoubt} or more verdicts are "wrong" or "unclear". Otherwise false.
For every question that is wrong or left incomplete, fill "mistake" with the exact step where it went wrong, in at most 25 plain words (for example: "took tan 30 as root 3", "did not rationalise", "stopped after the diagram", "did not balance the equation"), and "cause" with the best single reason; for a right answer use cause "none". If only the final answer is written with no working, use "copied_answer_only". For a "different_question" you may still fill "mistake" if the working shown is clearly wrong in itself (for example "used sin where tan is needed").
In "for_teacher" write two or three plain sentences: what this student should be taught or made to practise next, naming the kind of question (and the subject, when there is science). In "reason" write one short plain sentence. Notes are at most 12 words each.`;

    // Which models to try, in order: the three newest Flash, then the two
    // newest Flash-Lite as a last resort. The model that answered is stored.
    let models: string[] = [];
    const named = Deno.env.get("GEMINI_MODEL") ?? "";
    try {
      const lr = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=300", {
        headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(10000),
      });
      const all = (((await lr.json()).models ?? []) as { name: string; supportedGenerationMethods?: string[] }[])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""));
      const byVersion = (a: string, b: string) => parseFloat(b.split("-")[1]) - parseFloat(a.split("-")[1]);
      const flash = all.filter((x) => /^gemini-[\d.]+-flash$/.test(x)).sort(byVersion).slice(0, 3);
      const lite = all.filter((x) => /^gemini-[\d.]+-flash-lite$/.test(x)).sort(byVersion).slice(0, 2);
      models = [...flash, ...lite];
    } catch { /* fall through to the default */ }
    if (named) models = [named, ...models.filter((m) => m !== named)];
    if (models.length === 0) models = [DEFAULT_MODEL];

    const body = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
    });
    // One try per model. The function is cut off at 150 seconds, so stop
    // starting new tries after 100 and never wait more than 40 for one.
    let res: Response | null = null;
    let model = models[0];
    const tried: string[] = [];
    for (const m of models) {
      if (Date.now() - started > 100000) break;
      model = m;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body,
          signal: AbortSignal.timeout(40000),
        });
        tried.push(`${m}: ${res.status}`);
        if (res.ok || ![429, 500, 503].includes(res.status)) break;
      } catch {
        res = null;
        tried.push(`${m}: no answer in 40 s`);
      }
    }
    if (!res || !res.ok) {
      const text = res ? (await res.text()).slice(0, 300) : "";
      await admin.from("homework_submissions")
        .update({ ai: { error: res ? `Gemini ${res.status}` : "Gemini timeout", detail: text, tried, needs_review: true, summary: "AI check failed" }, ai_checked_at: new Date().toISOString() })
        .eq("id", submission_id);
      return json({ error: "gemini", tried, detail: text }, 502);
    }
    const out = await res.json();
    const verdict = JSON.parse(out.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
    const qs = (verdict.questions ?? []) as { n?: number; attempted: boolean; verdict: string }[];
    const right = qs.filter((q) => q.verdict === "right").length;
    const attempted = qs.filter((q) => q.attempted).length;
    const total = n || qs.length;
    verdict.right = right;
    verdict.attempted = attempted;
    verdict.total = total;
    if (nSci) {
      const isSci = (q: { n?: number }) => typeof q.n === "number" && q.n > nMaths;
      verdict.maths = { total: nMaths, right: qs.filter((q) => !isSci(q) && q.verdict === "right").length };
      verdict.science = { total: nSci, right: qs.filter((q) => isSci(q) && q.verdict === "right").length };
    }
    verdict.model = model;
    verdict.tried = tried;
    // Token counts, so the real cost per homework can be worked out from the rows.
    verdict.usage = out.usageMetadata ?? null;
    verdict.summary = verdict.other_homework
      ? `Another day's homework · ${attempted} attempted`
      : n
        ? `${attempted}/${total} done, ${right} right${nSci ? ` (maths ${verdict.maths.right}/${nMaths}, science ${verdict.science.right}/${nSci})` : ""}${verdict.needs_review ? " · needs a look" : ""}`
        : verdict.needs_review ? "Needs a look" : "Pages look fine";

    await admin.from("homework_submissions")
      .update({ ai: verdict, ai_checked_at: new Date().toISOString() })
      .eq("id", submission_id);
    return json({ ok: true, ai: verdict });
  } catch (e) {
    return json({ error: "failed", message: String(e).slice(0, 300) }, 500);
  }
});
