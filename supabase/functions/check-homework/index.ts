// Fluence — first review of an uploaded homework by Gemini.
//
// Called by the app right after a student sends homework (and by staff with
// "check again"). It reads the pages, compares them with that student's own
// ten questions and answers for the day (public.homework_days, which students
// can never read), and writes a short verdict to homework_submissions.ai.
//
// It never changes a point. Aman, 19 Nov 2026: the AI does the first stage;
// whatever it is unsure of comes to him. So the only thing it decides is
// `needs_review`.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   GEMINI_API_KEY   his own key from Google AI Studio (required)
//   GEMINI_MODEL     optional; defaults to the value below
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
// by the platform.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_PAGES = 12;
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
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          n: { type: "INTEGER" },
          attempted: { type: "BOOLEAN" },
          verdict: { type: "STRING", enum: ["right", "wrong", "unclear", "not_attempted"] },
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
  required: ["readable", "blank_or_unrelated", "handwritten", "looks_machine_made", "questions", "needs_review", "reason"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
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

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sub } = await admin.from("homework_submissions").select("*").eq("id", submission_id).single();
    // One row per class and day holds the common ten plus the swaps by rank or
    // by name; this is the same rule make_homework.py uses to print each page.
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
    const minAttempted = Math.ceil(Math.max(n, 1) * 0.7);
    const maxDoubt = Math.max(2, Math.ceil(n * 0.3));
    const list = questions.length
      ? questions.map(([q, a], i) => `Q${i + 1}. ${q}\n   Teacher's answer: ${a}`).join("\n")
      : "(The question list for this day is not available. Judge only whether real handwritten maths work is present, and return an empty questions array.)";

    const prompt = `You are the first reviewer of a Class 10 (CBSE) student's maths homework for a teacher in India.
The images are photos of the student's notebook pages. The student was given these questions; a fraction written {a|b} means a over b.

${list}

For each question decide: was it attempted, and does the student's FINAL answer agree with the teacher's answer (equal value counts: 17.32 and 10√3 agree). Use "unclear" whenever you cannot read the work or cannot find that question. Never guess "right".
Also decide: are the pages readable; are they blank or unrelated to this homework; is it handwritten; does it look machine-made (typed, printed, or copied text from an AI tool instead of the student's own handwriting and working).
Set needs_review to true if anything is unreadable, blank, unrelated, machine-made, if fewer than ${minAttempted} of the ${n} questions are attempted, or if ${maxDoubt} or more verdicts are "wrong" or "unclear". Otherwise false.
For every question that is wrong or left incomplete, fill "mistake" with the exact step where it went wrong, in at most 25 plain words (for example: "took tan 30 as root 3", "did not rationalise", "stopped after the diagram"), and "cause" with the best single reason; for a right answer use cause "none". If only the final answer is written with no working, use "copied_answer_only".
In "for_teacher" write two or three plain sentences: what this student should be taught or made to practise next, naming the kind of question. In "reason" write one short plain sentence. Notes are at most 12 words each.`;

    // Google renames its models every few months, so unless GEMINI_MODEL names
    // one, ask the key what it can use and take the newest plain Flash model
    // (the kind the free plan carries).
    let model = Deno.env.get("GEMINI_MODEL") ?? "";
    if (!model) {
      try {
        const lr = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
        const names = (((await lr.json()).models ?? []) as { name: string; supportedGenerationMethods?: string[] }[])
          .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
          .map((m) => m.name.replace("models/", ""))
          .filter((n) => /^gemini-[\d.]+-flash$/.test(n))
          .sort((a, b) => parseFloat(b.split("-")[1]) - parseFloat(a.split("-")[1]));
        model = names[0] ?? DEFAULT_MODEL;
      } catch {
        model = DEFAULT_MODEL;
      }
    }
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      await admin.from("homework_submissions")
        .update({ ai: { error: `Gemini ${res.status}`, needs_review: true, summary: "AI check nahi ho paya" }, ai_checked_at: new Date().toISOString() })
        .eq("id", submission_id);
      return json({ error: "gemini", status: res.status, detail: text }, 502);
    }
    const out = await res.json();
    const verdict = JSON.parse(out.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
    const qs = (verdict.questions ?? []) as { attempted: boolean; verdict: string }[];
    const right = qs.filter((q) => q.verdict === "right").length;
    const attempted = qs.filter((q) => q.attempted).length;
    const total = questions.length || qs.length;
    verdict.right = right;
    verdict.attempted = attempted;
    verdict.total = total;
    verdict.model = model;
    verdict.summary = questions.length
      ? `${attempted}/${total} kiye, ${right} sahi${verdict.needs_review ? " · dekhna hai" : ""}`
      : verdict.needs_review ? "dekhna hai" : "pages theek hain";

    await admin.from("homework_submissions")
      .update({ ai: verdict, ai_checked_at: new Date().toISOString() })
      .eq("id", submission_id);
    return json({ ok: true, ai: verdict });
  } catch (e) {
    return json({ error: "failed", message: String(e).slice(0, 300) }, 500);
  }
});
