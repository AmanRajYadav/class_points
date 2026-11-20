// Fluence — a student signs in with just their name.
//
// Aman, 20 Nov 2026: "a student could just put their name and login... it should
// be just like that only." So there is no student password. This function takes a
// username, checks that it belongs to a STUDENT who is still in the class, and
// hands back a one-time token the app exchanges for a normal session.
//
// What this means, said plainly: anyone who knows a classmate's username can sign
// in as them. That is accepted for students because all they can do is send their
// own homework and play the games; points are written only by staff and by the
// database. Staff accounts are never served here and keep their passwords.
//
// Deployed with verify_jwt OFF: the caller is not signed in yet. The body does its own checks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { username } = await req.json();
    const u = String(username ?? "").trim().toLowerCase().replace(/\s+/g, "");
    if (!/^[a-z0-9][a-z0-9._-]{2,19}$/.test(u)) return json({ error: "not_found" }, 404);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin
      .from("profiles").select("id, role, student_id").eq("username", u).maybeSingle();
    if (!profile || profile.role !== "student" || !profile.student_id) return json({ error: "not_found" }, 404);

    const { data: student } = await admin.from("students").select("left_on").eq("id", profile.student_id).maybeSingle();
    if (!student || student.left_on) return json({ error: "not_found" }, 404);

    const { data: user } = await admin.auth.admin.getUserById(profile.id);
    const email = user?.user?.email;
    if (!email || !email.endsWith("@students.fluence.local")) return json({ error: "not_found" }, 404);

    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !link?.properties?.hashed_token) return json({ error: "failed", message: error?.message ?? "no token" }, 500);
    return json({ token_hash: link.properties.hashed_token });
  } catch (e) {
    return json({ error: "failed", message: String(e).slice(0, 200) }, 500);
  }
});
