// Bookstery : validation d'une commande et attribution des manuscrits mystères.
//
// Recalcule tout côté serveur (prix, Protection Acheteur, paliers par vendeur),
// réserve les livres, tire au sort les extraits offerts dans le genre choisi
// et renvoie les jetons d'accès à la liseuse (pour les QR codes).
//
// ⚠️ En production, cette fonction doit être appelée APRÈS confirmation du paiement
// (par exemple depuis le webhook Stripe), pas directement par le navigateur.
//
//   supabase functions deploy valider-commande

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const PALIERS = [10, 20, 35];
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const booksterbooks = (sous: number) => PALIERS.filter((p) => sous + 1e-9 >= p).length;
const protection = (livres: number) => (livres > 0 ? r2(livres * 0.05 + 0.7) : 0);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { erreur: "Connecte-toi pour valider ta commande." });

  let body: { annonce_ids?: string[]; genre?: string | null };
  try { body = await req.json(); } catch { return json(400, { erreur: "Requête illisible." }); }
  const ids = [...new Set(body.annonce_ids ?? [])];
  if (!ids.length || ids.length > 50) return json(400, { erreur: "Ton Bag est vide." });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: annonces, error } = await admin.from("annonces")
    .select("id, prix, genre, vendeur_id, statut").in("id", ids);
  if (error) return json(500, { erreur: "Commande impossible pour le moment." });
  if (!annonces || annonces.length !== ids.length || annonces.some((a) => a.statut !== "en_vente")) {
    return json(409, { erreur: "Un livre de ton Bag vient d’être vendu. Retire-le et réessaie." });
  }
  if (annonces.some((a) => a.vendeur_id === user.id)) return json(400, { erreur: "Tu ne peux pas acheter tes propres annonces." });

  // Paliers par vendeur
  const parVendeur = new Map<string, number>();
  for (const a of annonces) parVendeur.set(a.vendeur_id, r2((parVendeur.get(a.vendeur_id) ?? 0) + Number(a.prix)));
  let nb = 0, livres = 0;
  for (const s of parVendeur.values()) { nb += booksterbooks(s); livres = r2(livres + s); }
  const prot = protection(livres);

  // Genre du cadeau
  const genres = [...new Set(annonces.map((a) => a.genre).filter(Boolean))];
  let genre: string | null = null;
  if (nb > 0) {
    if (genres.length > 1) {
      if (!body.genre || !genres.includes(body.genre)) return json(400, { erreur: "Choisis le genre de ton cadeau mystère." });
      genre = body.genre;
    } else genre = genres[0] ?? null;
  }

  // Réserve les livres (seulement s'ils sont toujours en vente)
  const { data: reserves } = await admin.from("annonces").update({ statut: "reserve" })
    .in("id", ids).eq("statut", "en_vente").select("id");
  if (!reserves || reserves.length !== ids.length) {
    if (reserves?.length) await admin.from("annonces").update({ statut: "en_vente" }).in("id", reserves.map((r) => r.id));
    return json(409, { erreur: "Un livre de ton Bag vient d’être vendu. Retire-le et réessaie." });
  }

  const { data: commande, error: e2 } = await admin.from("commandes").insert({
    acheteur_id: user.id, annonce_ids: ids, montant_livres: livres, protection: prot,
    total: r2(livres + prot), genre_cadeau: genre, nb_booksterbooks: nb,
  }).select("id, total, created_at").single();
  if (e2) { await admin.from("annonces").update({ statut: "en_vente" }).in("id", ids); return json(500, { erreur: "Commande impossible pour le moment." }); }

  // Tirage des extraits : genre choisi d'abord, d'autres genres si besoin ; jamais ses propres textes ni un texte déjà reçu
  const offerts: { token: string; titre: string; genre: string }[] = [];
  if (nb > 0) {
    const { data: deja } = await admin.from("booksterbooks").select("extrait_id").eq("lecteur_id", user.id);
    const exclus = new Set((deja ?? []).map((d) => d.extrait_id));
    const { data: pool } = await admin.from("extraits").select("id, titre, genre")
      .in("statut", ["depose", "publie"]).neq("auteur_id", user.id).limit(500);
    const dispo = (pool ?? []).filter((x) => !exclus.has(x.id)).sort(() => Math.random() - 0.5);
    const choisis = [...dispo.filter((x) => x.genre === genre), ...dispo.filter((x) => x.genre !== genre)].slice(0, nb);
    if (choisis.length) {
      const { data: bb } = await admin.from("booksterbooks")
        .insert(choisis.map((x) => ({ commande_id: commande.id, lecteur_id: user.id, extrait_id: x.id })))
        .select("token, extrait_id");
      for (const b of bb ?? []) {
        const x = choisis.find((c) => c.id === b.extrait_id)!;
        offerts.push({ token: b.token, titre: x.titre, genre: x.genre });
      }
    }
  }

  return json(200, { commande, booksterbooks: offerts, manquants: nb - offerts.length });
});
