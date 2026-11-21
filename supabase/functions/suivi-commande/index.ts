// Bookstery : suivi d'une commande, vendeur par vendeur.
//   POST { action: "expedie", commande_id }               → le vendeur indique qu'il a remis / envoyé le livre
//   POST { action: "recu", commande_id, vendeur_id }      → l'acheteur confirme la réception :
//                                                           virement immédiat au vendeur de 100 % du prix de ses livres
//   POST { action: "abandon", commande_id }               → l'acheteur a quitté la page de paiement : livres remis en vente
//   POST { action: "litige", commande_id, vendeur_id }    → l'acheteur signale un problème : le virement est bloqué
//                                                           jusqu'à la décision de l'équipe
//
//   supabase functions deploy suivi-commande

import { admin, annulerCommande, stripe, utilisateur, verserVendeur } from "../_shared/paiement.ts";
import { cors, json } from "../_shared/regles.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await utilisateur(req);
  if (!user) return json(401, { erreur: "Connecte-toi pour suivre ta commande." });
  let body: { action?: string; commande_id?: string; vendeur_id?: string };
  try { body = await req.json(); } catch { return json(400, { erreur: "Requête illisible." }); }
  if (!body.commande_id) return json(400, { erreur: "Commande inconnue." });

  if (body.action === "expedie") {
    const { data } = await admin.from("commande_vendeurs").update({ statut: "expedie", expedie_at: new Date().toISOString() })
      .eq("commande_id", body.commande_id).eq("vendeur_id", user.id).eq("statut", "a_expedier").select("commande_id");
    return data?.length ? json(200, { ok: true }) : json(409, { erreur: "Cette vente ne peut pas être marquée comme envoyée." });
  }

  if (body.action === "abandon") {
    const { data: cmd } = await admin.from("commandes").select("acheteur_id, statut, stripe_session_id").eq("id", body.commande_id).maybeSingle();
    if (!cmd || cmd.acheteur_id !== user.id) return json(404, { erreur: "Commande introuvable." });
    if (cmd.statut !== "en_attente") return json(200, { ok: true });
    try { if (cmd.stripe_session_id) await stripe.checkout.sessions.expire(cmd.stripe_session_id); } catch (_) { /* déjà expirée ou payée */ }
    const { data: apres } = await admin.from("commandes").select("statut").eq("id", body.commande_id).maybeSingle();
    if (apres?.statut === "en_attente") await annulerCommande(body.commande_id);
    return json(200, { ok: true });
  }

  if (!body.vendeur_id) return json(400, { erreur: "Vendeur inconnu." });
  const { data: ligne } = await admin.from("commande_vendeurs").select("acheteur_id, statut")
    .eq("commande_id", body.commande_id).eq("vendeur_id", body.vendeur_id).maybeSingle();
  if (!ligne || ligne.acheteur_id !== user.id) return json(404, { erreur: "Commande introuvable." });

  if (body.action === "litige") {
    if (!["a_expedier", "expedie"].includes(ligne.statut)) return json(409, { erreur: "Cette commande ne peut plus être contestée ici : écris à l’équipe Bookstery." });
    await admin.from("commande_vendeurs").update({ statut: "litige" }).eq("commande_id", body.commande_id).eq("vendeur_id", body.vendeur_id);
    return json(200, { ok: true });
  }

  if (body.action === "recu") {
    if (!["a_expedier", "expedie"].includes(ligne.statut)) return json(409, { erreur: "Cette réception est déjà enregistrée." });
    try {
      const r = await verserVendeur(body.commande_id, body.vendeur_id);
      return json(200, { ok: true, versement: r });
    } catch (e) {
      console.error("virement", e);
      return json(502, { erreur: "La confirmation n’a pas pu être enregistrée. Réessaie dans un instant." });
    }
  }
  return json(400, { erreur: "Action inconnue." });
});
