// Bookstery : Pack Accélérateur Auteurs — ouverture du paiement Stripe et du portail client.
//
//   POST { action: "checkout" } → page de paiement Stripe Checkout (abonnement 15 €/mois)
//   POST { action: "portail" }  → portail client Stripe : gérer ou arrêter l'abonnement
//
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_PRICE_ACCELERATEUR=price_... SITE_URL=https://...
//   supabase functions deploy stripe-abonnement

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
const PRIX = Deno.env.get("STRIPE_PRICE_ACCELERATEUR") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { erreur: "Méthode non autorisée." });
  if (!Deno.env.get("STRIPE_SECRET_KEY") || !PRIX) return json(503, { erreur: "Le paiement par abonnement n’est pas encore configuré." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { erreur: "Connecte-toi pour gérer ton Pack Accélérateur." });

  let body: { action?: string };
  try { body = await req.json(); } catch { return json(400, { erreur: "Requête illisible." }); }
  const site = (Deno.env.get("SITE_URL") ?? req.headers.get("origin") ?? "").replace(/\/$/, "");
  if (!/^https:\/\//.test(site)) return json(503, { erreur: "SITE_URL n’est pas configurée." });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: abo } = await admin.from("abonnements_auteurs")
    .select("stripe_customer_id, statut").eq("auteur_id", user.id).maybeSingle();

  try {
    if (body.action === "portail") {
      if (!abo?.stripe_customer_id) return json(404, { erreur: "Aucun abonnement à gérer pour le moment." });
      const portail = await stripe.billingPortal.sessions.create({
        customer: abo.stripe_customer_id,
        return_url: `${site}/?pack=retour#auteur`,
        locale: "fr",
      });
      return json(200, { url: portail.url });
    }

    if (body.action === "checkout") {
      if (abo && ["active", "trialing"].includes(abo.statut)) return json(409, { erreur: "Ton Pack Accélérateur est déjà actif." });
      let customer = abo?.stripe_customer_id ?? null;
      if (!customer) {
        const c = await stripe.customers.create({ email: user.email ?? undefined, metadata: { auteur_id: user.id } });
        customer = c.id;
        await admin.from("abonnements_auteurs").upsert({ auteur_id: user.id, stripe_customer_id: customer, updated_at: new Date().toISOString() });
      }
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        client_reference_id: user.id,
        line_items: [{ price: PRIX, quantity: 1 }],
        subscription_data: { metadata: { auteur_id: user.id } },
        success_url: `${site}/?pack=ok#auteur`,
        cancel_url: `${site}/?pack=annule#auteur`,
        locale: "fr",
      });
      return json(200, { url: session.url });
    }

    return json(400, { erreur: "Action inconnue." });
  } catch (e) {
    console.error("stripe-abonnement", e);
    return json(502, { erreur: "Stripe est indisponible pour le moment. Réessaie dans un instant." });
  }
});
