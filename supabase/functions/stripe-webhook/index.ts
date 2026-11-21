// Bookstery : webhook Stripe du Pack Accélérateur Auteurs.
// Tient à jour la table abonnements_auteurs ; un déclencheur SQL répercute le statut
// sur les textes de l'auteur (is_boosted) : actif = prioritaire 3× dans les Mystery Drops.
//
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
//   supabase functions deploy stripe-webhook --no-verify-jwt
// Dans Stripe > Développeurs > Webhooks, point de terminaison :
//   https://<projet>.supabase.co/functions/v1/stripe-webhook
// Événements : checkout.session.completed, customer.subscription.created,
//              customer.subscription.updated, customer.subscription.deleted

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function enregistrer(sub: Stripe.Subscription) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  let auteur = (sub.metadata?.auteur_id as string | undefined) ?? null;
  if (!auteur) {
    const { data } = await admin.from("abonnements_auteurs").select("auteur_id").eq("stripe_customer_id", customer).maybeSingle();
    auteur = data?.auteur_id ?? null;
  }
  if (!auteur) { console.warn("abonnement sans auteur", sub.id); return; }
  // Selon la version de l'API, la fin de période est sur l'abonnement ou sur sa ligne
  // deno-lint-ignore no-explicit-any
  const fin = (sub as any).current_period_end ?? (sub.items?.data?.[0] as any)?.current_period_end ?? null;
  const { error } = await admin.from("abonnements_auteurs").upsert({
    auteur_id: auteur,
    stripe_customer_id: customer,
    stripe_subscription_id: sub.id,
    statut: sub.status,
    current_period_end: fin ? new Date(fin * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const corps = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(corps, sig ?? "", Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "", undefined, crypto);
  } catch (e) {
    console.error("signature Stripe invalide", e);
    return new Response("Signature invalide", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
          if (!sub.metadata?.auteur_id && s.client_reference_id) sub.metadata = { ...sub.metadata, auteur_id: s.client_reference_id };
          await enregistrer(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await enregistrer(event.data.object as Stripe.Subscription);
        break;
    }
  } catch (e) {
    console.error("webhook", event.type, e);
    return new Response("Erreur de traitement", { status: 500 }); // Stripe renverra l'événement
  }
  return new Response(JSON.stringify({ recu: true }), { headers: { "Content-Type": "application/json" } });
});
