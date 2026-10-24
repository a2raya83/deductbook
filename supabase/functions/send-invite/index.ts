// DeductBook: email a household invitation.
// Called by the app right after an invitation row is created (and from "Resend email").
// Runs as the signed-in user for the lookup (so row-level security decides what they may see), sends through
// Resend, and stamps invitations.sent_at with the service role. Secrets: RESEND_API_KEY (set in the dashboard).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user?.email) return json({ error: "Sign in first." }, 401);

  let body: { invitation_id?: string; app_url?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  if (!body.invitation_id) return json({ error: "invitation_id required" }, 400);

  // Only the household owner can read its invitations, so a non-owner gets "not found" here.
  const { data: inv, error } = await asUser
    .from("invitations")
    .select("id, email, role, token, accepted_at, expires_at, household_id, households(name)")
    .eq("id", body.invitation_id)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!inv) return json({ error: "Invitation not found." }, 404);
  if (inv.accepted_at) return json({ error: "That invitation was already accepted." }, 409);

  const appUrl = typeof body.app_url === "string" && /^(https:\/\/(www\.)?deductbook\.com|http:\/\/localhost:8765)\/[A-Za-z0-9_./-]*$/.test(body.app_url)
    ? body.app_url
    : "https://deductbook.com/app.html";
  const link = `${appUrl}#invite=${inv.token}`;
  const household = (inv as unknown as { households?: { name?: string } }).households?.name ?? "household";
  const roleText = inv.role === "viewer" ? "read-only access, so you can see and export the records" : "access to add and edit donations and receipts";
  const inviter = user.email;

  const subject = `${inviter} invited you to the ${household} ledger on DeductBook`;
  const text = [
    `${inviter} has invited you to "${household}", a shared charitable-donation ledger on DeductBook, with ${roleText}.`,
    ``,
    `Accept the invitation: ${link}`,
    ``,
    `Sign in with this email address (${inv.email}); DeductBook sends you a one-time code. The invitation expires in 14 days.`,
    ``,
    `DeductBook keeps charitable donations, receipts and the IRS record-keeping rules in one place. deductbook.com`,
  ].join("\n");
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#182b36;line-height:1.5;max-width:560px">
  <h2 style="font-family:Georgia,serif;font-weight:600">You're invited to a DeductBook ledger</h2>
  <p><b>${esc(inviter)}</b> has invited you to <b>${esc(household)}</b>, a shared charitable-donation ledger on DeductBook, with ${roleText}.</p>
  <p><a href="${esc(link)}" style="display:inline-block;background:#176b60;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Accept the invitation</a></p>
  <p style="color:#58656c;font-size:14px">Sign in with this email address (${esc(inv.email)}); DeductBook sends you a one-time code. The invitation expires in 14 days. If you weren't expecting this, you can ignore it.</p>
  <p style="color:#7a858b;font-size:13px">DeductBook keeps charitable donations, receipts and the IRS record-keeping rules in one place. <a href="https://deductbook.com/" style="color:#176b60">deductbook.com</a></p>
</div>`;

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "Email sending isn't configured yet (RESEND_API_KEY)." }, 503);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "DeductBook <no-reply@mail.deductbook.com>", to: [inv.email], reply_to: inviter, subject, text, html }),
  });
  if (!r.ok) return json({ error: `The email couldn't be sent (${r.status}).` }, 502);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await admin.from("invitations").update({ sent_at: new Date().toISOString() }).eq("id", inv.id);
  return json({ ok: true, to: inv.email });
});
