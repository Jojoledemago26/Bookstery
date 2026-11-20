// Bookstery : avis d'un lecteur sur un manuscrit mystère, envoyé par e-mail à l'auteur.
//
// L'adresse de l'auteur reste privée : elle est lue côté serveur et jamais renvoyée au lecteur.
// Envoi des e-mails avec Resend (https://resend.com) :
//   supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="Bookstery <avis@ton-domaine.fr>"
//   supabase functions deploy envoyer-avis

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { erreur: "Connecte-toi pour noter l’auteur." });

  let body: { token?: string; note?: number; commentaire?: string; suivre?: boolean };
  try { body = await req.json(); } catch { return json(400, { erreur: "Requête illisible." }); }
  const note = Math.round(Number(body.note));
  const commentaire = (body.commentaire ?? "").trim().slice(0, 2000);
  if (!(note >= 1 && note <= 5)) return json(400, { erreur: "Choisis une note de 1 à 5 étoiles." });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: bb } = await admin.from("booksterbooks")
    .select("id, lecteur_id, extrait_id, extraits(titre, auteur_id)")
    .eq("token", body.token ?? "").maybeSingle();
  // deno-lint-ignore no-explicit-any
  const ex = (bb as any)?.extraits as { titre: string; auteur_id: string } | undefined;
  if (!bb || bb.lecteur_id !== user.id || !ex) return json(404, { erreur: "Ce manuscrit mystère est introuvable dans ton espace." });

  const { error } = await admin.from("avis").insert({
    booksterbook_id: bb.id, extrait_id: bb.extrait_id, auteur_id: ex.auteur_id, lecteur_id: user.id, note, commentaire: commentaire || null,
  });
  if (error) {
    if (error.code === "23505") return json(409, { erreur: "Tu as déjà noté ce texte. Merci !" });
    return json(500, { erreur: "Ton avis n’a pas pu être enregistré. Réessaie." });
  }
  if (body.suivre && ex.auteur_id !== user.id) {
    await admin.from("abonnements").upsert({ lecteur_id: user.id, auteur_id: ex.auteur_id }, { onConflict: "lecteur_id,auteur_id", ignoreDuplicates: true });
  }

  // E-mail à l'auteur
  let emailEnvoye = false;
  const cle = Deno.env.get("RESEND_API_KEY");
  const { data: auteur } = await admin.auth.admin.getUserById(ex.auteur_id);
  const to = auteur?.user?.email;
  if (cle && to) {
    const prenom = (user.user_metadata?.prenom as string | undefined) || "Un Bookster";
    const etoiles = "★".repeat(note) + "☆".repeat(5 - note);
    const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#111">
      <h2 style="margin:0 0 8px">Nouvel avis sur « ${esc(ex.titre)} »</h2>
      <p style="font-size:22px;color:#6050DC;margin:0 0 12px">${etoiles}</p>
      ${commentaire ? `<blockquote style="margin:0 0 16px;padding:12px 16px;background:#F7F6FE;border-radius:10px">${esc(commentaire).replace(/\n/g, "<br>")}</blockquote>` : ""}
      <p style="margin:0 0 4px">— ${esc(prenom)}, lecteur Bookstery${body.suivre ? ", qui te suit désormais" : ""}.</p>
      <p style="color:#666;font-size:13px">Ton texte a été lu grâce au Bookstery Drop. Merci d’écrire pour la communauté !</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("MAIL_FROM") ?? "Bookstery <onboarding@resend.dev>", to: [to], subject: `${etoiles} Nouvel avis sur « ${ex.titre} »`, html }),
    });
    emailEnvoye = r.ok;
    if (!r.ok) console.error("Resend", r.status, await r.text());
  }

  return json(200, { ok: true, email_envoye: emailEnvoye, suivi: !!body.suivre });
});
