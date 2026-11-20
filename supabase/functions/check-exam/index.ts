// Fluence — Exam Checker: the AI's part. STAFF ONLY.
//
// Two jobs, both started from the Exam Checker screens:
//   { action: "read_paper",  exam_id }   reads the question paper (and the answer
//       key, if one was given) and stores every question with its marks and the
//       expected answer in exams.paper.
//   { action: "check_sheet", sheet_id }  reads one student's answer sheet against
//       that list and stores marks per question in exam_sheets.ai / marks / total.
//
// The AI proposes; the teacher decides. Wherever it is not sure (handwriting it
// cannot read, a step it cannot see, marks that could go either way) it sets
// `check_yourself` with the reason, and the screen puts those questions first.
//
// WHO MAY CALL THIS: only a signed-in account for which public.can_teach() is
// true. A student's token is refused before anything is sent to Google, so
// nobody but staff can spend the API credit here.
//
// Secrets: GEMINI_API_KEY (required), GEMINI_EXAM_MODEL or GEMINI_MODEL (optional).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

// deno-lint-ignore no-explicit-any
type Admin = any;

async function fileParts(admin: Admin, paths: string[], max: number): Promise<unknown[]> {
  const parts: unknown[] = [];
  for (const path of paths.slice(0, max)) {
    const { data: blob } = await admin.storage.from("exams").download(path);
    if (!blob) continue;
    parts.push({
      inline_data: {
        mime_type: path.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
        data: toBase64(new Uint8Array(await blob.arrayBuffer())),
      },
    });
  }
  return parts;
}

async function modelsFor(key: string): Promise<string[]> {
  const named = Deno.env.get("GEMINI_EXAM_MODEL") ?? Deno.env.get("GEMINI_MODEL") ?? "";
  let models: string[] = [];
  try {
    const lr = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=300", {
      headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(10000),
    });
    models = (((await lr.json()).models ?? []) as { name: string; supportedGenerationMethods?: string[] }[])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace("models/", ""))
      .filter((x) => /^gemini-[\d.]+-flash$/.test(x))
      .sort((a, b) => parseFloat(b.split("-")[1]) - parseFloat(a.split("-")[1]))
      .slice(0, 2);
  } catch { /* use the fallback below */ }
  if (named) models = [named, ...models.filter((m) => m !== named)];
  return models.length ? models : ["gemini-2.5-flash"];
}

async function ask(key: string, parts: unknown[], schema: unknown, started: number) {
  const models = await modelsFor(key);
  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
  });
  const tried: string[] = [];
  for (const m of models.slice(0, 2)) {
    if (Date.now() - started > 80000) break;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body,
        signal: AbortSignal.timeout(60000),
      });
      tried.push(`${m}: ${res.status}`);
      if (res.ok) {
        const out = await res.json();
        return { ok: true as const, data: JSON.parse(out.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"), model: m, tried, usage: out.usageMetadata ?? null };
      }
      if (![429, 500, 503].includes(res.status)) {
        return { ok: false as const, error: `Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`, tried };
      }
    } catch {
      tried.push(`${m}: no answer in 60 s`);
    }
  }
  return { ok: false as const, error: "Google's model is busy just now. Try again in a minute.", tried };
}

const PAPER_SCHEMA = {
  type: "OBJECT",
  properties: {
    readable: { type: "BOOLEAN" },
    total: { type: "NUMBER" },
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          n: { type: "INTEGER" },
          label: { type: "STRING" },
          text: { type: "STRING" },
          marks: { type: "NUMBER" },
          answer: { type: "STRING" },
          answer_from: { type: "STRING", enum: ["key", "solved"] },
        },
        required: ["n", "label", "text", "marks", "answer", "answer_from"],
      },
    },
    note: { type: "STRING" },
  },
  required: ["readable", "total", "questions"],
};

const SHEET_SCHEMA = {
  type: "OBJECT",
  properties: {
    readable: { type: "BOOLEAN" },
    name_on_sheet: { type: "STRING" },
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          n: { type: "INTEGER" },
          attempted: { type: "BOOLEAN" },
          awarded: { type: "NUMBER" },
          reason: { type: "STRING" },
          mistake: { type: "STRING" },
          check_yourself: { type: "BOOLEAN" },
          why_check: { type: "STRING" },
        },
        required: ["n", "attempted", "awarded", "reason", "check_yourself"],
      },
    },
    for_teacher: { type: "STRING" },
  },
  required: ["readable", "questions"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    // Staff only. Checked with the caller's own token, before anything else.
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: staff } = await asUser.rpc("can_teach");
    if (staff !== true) return json({ error: "not_allowed", message: "Only teachers can use the Exam Checker." }, 403);

    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ error: "no_key", message: "GEMINI_API_KEY is not set." }, 503);

    const { action, exam_id, sheet_id } = await req.json();
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (action === "read_paper") {
      const { data: exam } = await admin.from("exams").select("*").eq("id", exam_id).single();
      if (!exam) return json({ error: "no_exam" }, 404);
      const paper = await fileParts(admin, exam.paper_files ?? [], 10);
      if (!paper.length) return json({ error: "no_paper", message: "Add the question paper first." }, 422);
      const keyParts = await fileParts(admin, exam.key_files ?? [], 10);
      const prompt = `You are helping a Class 10 (CBSE) maths teacher in India set up a test for checking.
First come the pages of the QUESTION PAPER${keyParts.length ? ", then the pages of the teacher's ANSWER KEY or marking scheme" : ""}.
List every question that carries marks, in the order printed. A question with parts (a), (b) that carry their own marks is listed part by part. For an "OR" choice list only the first option and say "or its alternative" in the text.
For each: n = running number from 1; label = the number as printed (for example "Q7" or "Q12(b)"); text = the question, shortened to at most 45 words but keeping every number; marks = marks it carries (if the paper does not print them, infer from the section headings, and say so in note); answer = the final answer and the key steps a checker needs, at most 50 words${keyParts.length ? ", taken from the answer key when it covers the question (answer_from \"key\"), otherwise solved by you (answer_from \"solved\")" : ", solved by you carefully (answer_from \"solved\")"}.
total = the sum of the marks. Set readable to false if the pages cannot be read.`;
      const parts: unknown[] = [{ text: prompt }, { text: "QUESTION PAPER:" }, ...paper];
      if (keyParts.length) parts.push({ text: "ANSWER KEY / MARKING SCHEME:" }, ...keyParts);
      const r = await ask(key, parts, PAPER_SCHEMA, started);
      if (!r.ok) {
        await admin.from("exams").update({ paper_error: r.error, updated_at: new Date().toISOString() }).eq("id", exam_id);
        return json({ error: "gemini", message: r.error, tried: r.tried }, 502);
      }
      const data = { ...r.data, model: r.model, usage: r.usage };
      const patch: Record<string, unknown> = { paper: data, paper_error: null, updated_at: new Date().toISOString() };
      if (!Number(exam.total_marks) && Number(r.data.total)) patch.total_marks = r.data.total;
      await admin.from("exams").update(patch).eq("id", exam_id);
      return json({ ok: true, paper: data });
    }

    if (action === "check_sheet") {
      const { data: sheet } = await admin.from("exam_sheets").select("*").eq("id", sheet_id).single();
      if (!sheet) return json({ error: "no_sheet" }, 404);
      const { data: exam } = await admin.from("exams").select("*").eq("id", sheet.exam_id).single();
      const questions = (exam?.paper?.questions ?? []) as { n: number; label: string; text: string; marks: number; answer: string }[];
      if (!questions.length) return json({ error: "no_paper", message: "The question paper has not been read yet." }, 422);
      const pages = await fileParts(admin, sheet.files ?? [], 16);
      if (!pages.length) return json({ error: "no_pages" }, 422);
      const list = questions
        .map((q) => `#${q.n} (${q.label}, ${q.marks} mark${q.marks === 1 ? "" : "s"}): ${q.text}\n   Expected: ${q.answer}`)
        .join("\n");
      const prompt = `You are checking one Class 10 (CBSE) student's maths test for their teacher in India. The pages after this text are photos of the student's handwritten answer sheet. The student may have answered in any order and may write the printed question number.

THE TEST (${questions.length} questions):
${list}

Mark it the way a CBSE examiner does: step marks for a correct method even when the final answer is wrong; full marks only when the method and the final answer are right (an equal value counts: 17.32 and 10√3 agree); 0 for a question not attempted. Use halves if needed. Never give more than the question's marks.
For each question (use its # as n): attempted; awarded; reason = one plain sentence on why these marks; mistake = for marks lost, the exact step that went wrong, at most 20 words.
BE HONEST ABOUT DOUBT. Set check_yourself to true, and say why in why_check (at most 15 words), whenever: you cannot read the handwriting clearly; a number could be read two ways; working is cut off or a page seems missing; you cannot find the answer; the method is unusual and you are not sure it is valid; or the marks could fairly be one step higher or lower. It is far better to ask the teacher to look than to guess. When you are sure, set it to false.
name_on_sheet = the student's name if written, else "". In for_teacher write two or three plain sentences on what this student should practise next. Set readable to false if the pages cannot be read at all.`;
      const r = await ask(key, [{ text: prompt }, ...pages], SHEET_SCHEMA, started);
      const runs = (sheet.ai_runs ?? 0) + 1;
      if (!r.ok) {
        await admin.from("exam_sheets").update({ ai: { error: r.error, tried: r.tried }, ai_runs: runs }).eq("id", sheet_id);
        return json({ error: "gemini", message: r.error, tried: r.tried }, 502);
      }
      const byN = new Map<number, { awarded: number }>((r.data.questions ?? []).map((q: { n: number; awarded: number }) => [q.n, q]));
      const marks: Record<string, number> = {};
      let total = 0;
      for (const q of questions) {
        const got = Math.max(0, Math.min(Number(q.marks) || 0, Number(byN.get(q.n)?.awarded) || 0));
        marks[String(q.n)] = got;
        total += got;
      }
      const ai = { ...r.data, model: r.model, usage: r.usage, tried: r.tried };
      await admin.from("exam_sheets")
        .update({ ai, marks, total, status: "checked", checked_at: new Date().toISOString(), ai_runs: runs })
        .eq("id", sheet_id);
      return json({ ok: true, ai, marks, total });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "failed", message: String(e).slice(0, 300) }, 500);
  }
});
