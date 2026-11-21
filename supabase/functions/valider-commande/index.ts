// Bookstery : création d'une commande et ouverture du paiement Stripe.
//
// Stripe Connect, « paiements et virements séparés » :
//   • l'acheteur paie en une fois, sur le compte Stripe de Bookstery, le prix des livres
//     + la Protection Acheteur (ligne séparée : 5 % du prix des livres + 0,70 €) ;
//   • chaque vendeur reçoit ensuite 100 % du prix de SES livres, par virement Stripe,
//     à la confirmation de réception (fonction suivi-commande) ou automatiquement après le délai
//     (fonction liberer-paiements) ;
//   • la Protection Acheteur reste à Bookstery.
// Les Mystery Drops et le cumul VIP sont calculés sur le montant des livres seul, et attribués
// quand Stripe confirme le paiement (fonction stripe-webhook).
//
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_... SITE_URL=https://ton-site.fr
//   supabase functions deploy valider-commande

import { admin, finaliserCommande, siteUrl, stripe, utilisateur } from "../_shared/paiement.ts";
import { cents, cors, json, mysteryDrops, protection, r2, UTILITAIRES } from "../_shared/regles.ts";

const DUREE_PAIEMENT_MIN = 30; // les livres restent réservés 30 minutes pendant le paiement

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await utilisateur(req);
  if (!user) return json(401, { erreur: "Connecte-toi pour valider ta commande." });

  let body: { annonce_ids?: string[]; genre?: string | null; genre_secours?: string | null };
  try { body = await req.json(); } catch { return json(400, { erreur: "Requête illisible." }); }
  const ids = [...new Set(body.annonce_ids ?? [])];
  if (!ids.length || ids.length > 50) return json(400, { erreur: "Ton Bag est vide." });

  const sansPaiement = Deno.env.get("ALLOW_ORDERS_WITHOUT_PAYMENT") === "true"; // tests uniquement
  if (!Deno.env.get("STRIPE_SECRET_KEY") && !sansPaiement) return json(503, { erreur: "Le paiement en ligne n’est pas encore activé." });
  const site = siteUrl(req);
  if (!sansPaiement && !/^https:\/\//.test(site)) return json(503, { erreur: "SITE_URL n’est pas configurée." });

  const { data: annonces, error } = await admin.from("annonces")
    .select("id, titre, prix, genre, vendeur_id, statut").in("id", ids);
  if (error) return json(500, { erreur: "Commande impossible pour le moment." });
  if (!annonces || annonces.length !== ids.length || annonces.some((a) => a.statut !== "en_vente")) {
    return json(409, { erreur: "Un livre de ton Bag vient d’être vendu. Retire-le et réessaie." });
  }
  if (annonces.some((a) => a.vendeur_id === user.id)) return json(400, { erreur: "Tu ne peux pas acheter tes propres annonces." });

  // Montants : 100 % du prix des livres par vendeur ; Protection Acheteur sur le total des livres
  const parVendeur = new Map<string, { montant: number; ids: string[]; titres: string[] }>();
  for (const a of annonces) {
    const v = parVendeur.get(a.vendeur_id) ?? { montant: 0, ids: [], titres: [] };
    v.montant = r2(v.montant + Number(a.prix)); v.ids.push(a.id); v.titres.push(a.titre);
    parVendeur.set(a.vendeur_id, v);
  }
  let livres = 0;
  for (const v of parVendeur.values()) livres = r2(livres + v.montant);
  const prot = protection(livres), total = r2(livres + prot), nb = mysteryDrops(livres);

  // Genre du cadeau (genres non utilitaires du panier uniquement)
  const genres = [...new Set(annonces.map((a) => a.genre).filter((g) => g && !UTILITAIRES.has(g)))];
  let genre: string | null = null;
  if (nb > 0) {
    if (genres.length > 1) {
      if (!body.genre || !genres.includes(body.genre)) return json(400, { erreur: "Choisis le genre de ton cadeau mystère." });
      genre = body.genre;
    } else genre = genres[0] ?? null;
  }
  const secours = typeof body.genre_secours === "string" && body.genre_secours.length <= 60 && !UTILITAIRES.has(body.genre_secours) ? body.genre_secours : null;

  // Réserve les livres (seulement s'ils sont toujours en vente)
  const { data: reserves } = await admin.from("annonces").update({ statut: "reserve" })
    .in("id", ids).eq("statut", "en_vente").select("id");
  if (!reserves || reserves.length !== ids.length) {
    if (reserves?.length) await admin.from("annonces").update({ statut: "en_vente" }).in("id", reserves.map((r) => r.id));
    return json(409, { erreur: "Un livre de ton Bag vient d’être vendu. Retire-le et réessaie." });
  }
  const liberer = () => admin.from("annonces").update({ statut: "en_vente" }).in("id", ids).eq("statut", "reserve");

  const { data: commande, error: e2 } = await admin.from("commandes").insert({
    acheteur_id: user.id, annonce_ids: ids, montant_livres: livres, protection: prot, total,
    genre_cadeau: genre, genre_secours: secours, nb_booksterbooks: nb, statut: "en_attente",
  }).select("id, total, created_at").single();
  if (e2) { await liberer(); console.error("commande", e2); return json(500, { erreur: "Commande impossible pour le moment." }); }

  const { error: e3 } = await admin.from("commande_vendeurs").insert([...parVendeur].map(([vid, v]) => ({
    commande_id: commande.id, vendeur_id: vid, acheteur_id: user.id, annonce_ids: v.ids, titres: v.titres, montant: v.montant,
  })));
  if (e3) { await liberer(); await admin.from("commandes").update({ statut: "annulee" }).eq("id", commande.id); console.error("lignes", e3); return json(500, { erreur: "Commande impossible pour le moment." }); }

  // Mode test sans paiement (jamais en production)
  if (sansPaiement) {
    await finaliserCommande(commande.id, null);
    return json(200, { commande_id: commande.id, sans_paiement: true });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "fr",
      customer_email: user.email ?? undefined,
      client_reference_id: user.id,
      line_items: [
        // Une ligne par livre : 100 % de ce prix ira au vendeur
        ...annonces.map((a) => ({
          quantity: 1,
          price_data: { currency: "eur", unit_amount: cents(Number(a.prix)), product_data: { name: a.titre, metadata: { annonce_id: a.id } } },
        })),
        // Ligne séparée : la Protection Acheteur, qui revient à Bookstery
        {
          quantity: 1,
          price_data: { currency: "eur", unit_amount: cents(prot), product_data: { name: "Protection Acheteur Bookstery (5 % + 0,70 €)" } },
        },
      ],
      payment_intent_data: { transfer_group: commande.id, metadata: { commande_id: commande.id } },
      metadata: { commande_id: commande.id, type: "commande" },
      expires_at: Math.floor(Date.now() / 1000) + DUREE_PAIEMENT_MIN * 60,
      success_url: `${site}/?commande=ok&id=${commande.id}`,
      cancel_url: `${site}/?commande=annule&id=${commande.id}`,
    }, { idempotencyKey: `commande-${commande.id}` });
    await admin.from("commandes").update({ stripe_session_id: session.id }).eq("id", commande.id);
    return json(200, { commande_id: commande.id, url: session.url });
  } catch (e) {
    console.error("stripe checkout", e);
    await liberer();
    await admin.from("commandes").update({ statut: "annulee" }).eq("id", commande.id);
    await admin.from("commande_vendeurs").update({ statut: "annule" }).eq("commande_id", commande.id);
    return json(502, { erreur: "Le paiement est indisponible pour le moment. Réessaie dans un instant." });
  }
});
