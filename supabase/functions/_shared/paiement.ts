// Bookstery : étapes du paiement Stripe Connect partagées entre les fonctions.
//   finaliserCommande : appelée par le webhook quand le paiement est confirmé
//   verserVendeur     : virement au vendeur de 100 % du prix de ses livres
import Stripe from "npm:stripe@17.7.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { cents, famille, mysteryDrops, UTILITAIRES } from "./regles.ts";
import { saisonCourante } from "./saisons.ts";

export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
export const admin: SupabaseClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** Paiement confirmé : commande payée, livres vendus, Mystery Drops tirés, cumul VIP mis à jour. Idempotent. */
export async function finaliserCommande(commandeId: string, paymentIntentId: string | null) {
  const { data: cmd } = await admin.from("commandes").select("*").eq("id", commandeId).maybeSingle();
  if (!cmd || cmd.statut === "payee") return;

  let charge: string | null = null;
  if (paymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    charge = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
  }
  // Passage en « payée » une seule fois (protège contre les webhooks reçus en double)
  const { data: maj } = await admin.from("commandes")
    .update({ statut: "payee", stripe_payment_intent: paymentIntentId, stripe_charge_id: charge, payee_at: new Date().toISOString() })
    .eq("id", commandeId).neq("statut", "payee").select("id");
  if (!maj?.length) return;

  await admin.from("annonces").update({ statut: "vendu" }).in("id", cmd.annonce_ids);
  await admin.from("commande_vendeurs").update({ statut: "a_expedier" }).eq("commande_id", commandeId).eq("statut", "en_attente_paiement");

  // Mystery Drops : calculés sur le montant des livres seul
  const livres = Number(cmd.montant_livres), nb = mysteryDrops(livres);
  if (nb > 0) {
    const params = {
      p_lecteur: cmd.acheteur_id, p_genre: cmd.genre_cadeau, p_famille: famille(cmd.genre_cadeau),
      p_secours: cmd.genre_secours, p_genres_exclus: [...UTILITAIRES], p_nb: nb,
    };
    // Bookster Thème : textes de la saison en cours d’abord (saisons.sql) ; sinon tirage classique
    let { data: tires, error } = await admin.rpc("tirer_manuscrits", { ...params, p_saison: saisonCourante()?.id ?? null });
    if (error) ({ data: tires, error } = await admin.rpc("tirer_manuscrits", params));
    if (error) console.error("tirer_manuscrits", error);
    const choisis = (tires ?? []) as { id: string }[];
    if (choisis.length) {
      await admin.from("booksterbooks").insert(choisis.map((x) => ({ commande_id: commandeId, lecteur_id: cmd.acheteur_id, extrait_id: x.id })));
    }
  }
  // Fidélité Bookster VIP : cumul du montant des livres seul
  const { error: eVip } = await admin.rpc("ajouter_achats_livres", { p_user: cmd.acheteur_id, p_montant: livres });
  if (eVip) console.error("vip", eVip);
}

/** Paiement abandonné ou expiré : les livres sont remis en vente. */
export async function annulerCommande(commandeId: string) {
  const { data: cmd } = await admin.from("commandes").select("annonce_ids, statut").eq("id", commandeId).maybeSingle();
  if (!cmd || cmd.statut !== "en_attente") return;
  await admin.from("commandes").update({ statut: "annulee" }).eq("id", commandeId).eq("statut", "en_attente");
  await admin.from("annonces").update({ statut: "en_vente" }).in("id", cmd.annonce_ids).eq("statut", "reserve");
  await admin.from("commande_vendeurs").update({ statut: "annule" }).eq("commande_id", commandeId);
}

/** Virement au vendeur de 100 % du prix de ses livres. Si son compte Stripe n'est pas prêt,
 *  la ligne reste « recu » et sera versée dès que le compte sera activé (webhook account.updated). */
export async function verserVendeur(commandeId: string, vendeurId: string): Promise<"paye" | "en_attente_compte" | "deja"> {
  const { data: ligne } = await admin.from("commande_vendeurs").select("*").eq("commande_id", commandeId).eq("vendeur_id", vendeurId).maybeSingle();
  if (!ligne || ligne.statut === "paye") return "deja";
  const { data: cmd } = await admin.from("commandes").select("stripe_charge_id, statut").eq("id", commandeId).maybeSingle();
  if (!cmd || cmd.statut !== "payee") throw new Error("commande non payée");
  const { data: compte } = await admin.from("vendeurs_stripe").select("stripe_account_id, payouts_enabled").eq("vendeur_id", vendeurId).maybeSingle();
  if (!compte?.payouts_enabled) {
    await admin.from("commande_vendeurs").update({ statut: "recu", recu_at: ligne.recu_at ?? new Date().toISOString() })
      .eq("commande_id", commandeId).eq("vendeur_id", vendeurId).in("statut", ["a_expedier", "expedie", "recu"]);
    return "en_attente_compte";
  }
  const transfer = await stripe.transfers.create({
    amount: cents(Number(ligne.montant)),           // 100 % du prix des livres du vendeur
    currency: "eur",
    destination: compte.stripe_account_id,
    transfer_group: commandeId,
    ...(cmd.stripe_charge_id ? { source_transaction: cmd.stripe_charge_id } : {}),
    metadata: { commande_id: commandeId, vendeur_id: vendeurId },
  }, { idempotencyKey: `virement-${commandeId}-${vendeurId}` });
  const now = new Date().toISOString();
  await admin.from("commande_vendeurs").update({ statut: "paye", stripe_transfer_id: transfer.id, paye_at: now, recu_at: ligne.recu_at ?? now })
    .eq("commande_id", commandeId).eq("vendeur_id", vendeurId);
  return "paye";
}

export async function utilisateur(req: Request) {
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  return user;
}

export function siteUrl(req: Request) {
  return (Deno.env.get("SITE_URL") ?? req.headers.get("origin") ?? "").replace(/\/$/, "");
}
