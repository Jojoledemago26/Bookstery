// Bookstery : confirmation automatique de réception après le délai prévu aux CGU.
// Pour chaque vente marquée « envoyée / remise » depuis plus de DELAI_CONFIRMATION_JOURS jours
// (14 par défaut), sans litige ni confirmation de l'acheteur, le vendeur reçoit automatiquement
// 100 % du prix de ses livres. Une vente jamais envoyée n'est jamais versée automatiquement.
//
// À appeler une fois par jour (Supabase > Database > Cron, ou tout planificateur), avec l'en-tête
//   x-cron-secret: <CRON_SECRET>
//   supabase secrets set CRON_SECRET=une-longue-valeur-aleatoire
//   supabase functions deploy liberer-paiements --no-verify-jwt

import { admin, verserVendeur } from "../_shared/paiement.ts";
import { json } from "../_shared/regles.ts";

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json(401, { erreur: "Non autorisé." });
  const jours = Number(Deno.env.get("DELAI_CONFIRMATION_JOURS") ?? "14");
  const limite = new Date(Date.now() - jours * 864e5).toISOString();

  const { data: lignes } = await admin.from("commande_vendeurs").select("commande_id, vendeur_id")
    .eq("statut", "expedie").lt("expedie_at", limite).limit(500);

  let verses = 0, attente = 0, erreurs = 0;
  for (const l of lignes ?? []) {
    try { (await verserVendeur(l.commande_id, l.vendeur_id)) === "paye" ? verses++ : attente++; }
    catch (e) { erreurs++; console.error("auto", l.commande_id, e); }
  }
  return json(200, { verses, en_attente_compte: attente, erreurs });
});
