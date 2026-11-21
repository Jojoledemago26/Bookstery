// Bookstery : comptes Stripe Connect des vendeurs (Express).
//   POST { action: "onboarding" } → lien d'inscription Stripe (identité + IBAN) pour recevoir ses ventes
//   POST { action: "tableau" }    → lien vers le tableau de bord Stripe Express du vendeur
//
//   supabase functions deploy stripe-connect

import { admin, siteUrl, stripe, utilisateur } from "../_shared/paiement.ts";
import { cors, json } from "../_shared/regles.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return json(503, { erreur: "Les paiements ne sont pas encore activés." });
  const user = await utilisateur(req);
  if (!user) return json(401, { erreur: "Connecte-toi pour gérer tes paiements." });
  let body: { action?: string };
  try { body = await req.json(); } catch { return json(400, { erreur: "Requête illisible." }); }
  const site = siteUrl(req);
  if (!/^https:\/\//.test(site)) return json(503, { erreur: "SITE_URL n’est pas configurée." });

  const { data: compte } = await admin.from("vendeurs_stripe").select("*").eq("vendeur_id", user.id).maybeSingle();
  try {
    if (body.action === "tableau") {
      if (!compte) return json(404, { erreur: "Active d’abord tes paiements." });
      const lien = await stripe.accounts.createLoginLink(compte.stripe_account_id);
      return json(200, { url: lien.url });
    }
    if (body.action === "onboarding") {
      let id = compte?.stripe_account_id;
      if (!id) {
        const acc = await stripe.accounts.create({
          type: "express",
          country: "FR",
          email: user.email ?? undefined,
          capabilities: { transfers: { requested: true } }, // le vendeur reçoit des virements de Bookstery
          business_profile: { product_description: "Vente de livres d’occasion sur Bookstery", mcc: "5942" },
          metadata: { vendeur_id: user.id },
        });
        id = acc.id;
        await admin.from("vendeurs_stripe").insert({ vendeur_id: user.id, stripe_account_id: id });
      }
      const lien = await stripe.accountLinks.create({
        account: id,
        type: "account_onboarding",
        refresh_url: `${site}/?paiements=relance`,
        return_url: `${site}/?paiements=retour`,
      });
      return json(200, { url: lien.url });
    }
    return json(400, { erreur: "Action inconnue." });
  } catch (e) {
    console.error("stripe-connect", e);
    return json(502, { erreur: "Stripe est indisponible pour le moment. Réessaie dans un instant." });
  }
});
