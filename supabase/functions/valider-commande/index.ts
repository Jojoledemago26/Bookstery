// Bookstery : validation d'une commande et attribution des manuscrits mystères.
//
// Recalcule tout côté serveur (prix, Protection Acheteur, Mystery Drops : 1 par tranche de 10 €),
// réserve les livres, tire au sort les extraits offerts dans le genre choisi
// et renvoie les jetons d'accès à la liseuse (pour les QR codes).
//
// ⚠️ En production, cette fonction doit être appelée APRÈS confirmation du paiement
// (par exemple depuis le webhook Stripe), pas directement par le navigateur.
//
//   supabase functions deploy valider-commande

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const DROP_STEP = 10; // commande en cours : chaque tranche de 10 € de livres = 1 Mystery Drop (manuscrit mystère offert)
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const DROP_MAX = 5;   // 50 € = 5 Mystery Drops, le maximum par commande
const booksterbooks = (livres: number) => Math.min(DROP_MAX, Math.floor((livres + 1e-9) / DROP_STEP));
const protection = (livres: number) => (livres > 0 ? r2(livres * 0.05 + 0.7) : 0);

// Familles de genres (même liste que dans index.html) : si aucun texte n'existe
// dans le sous-genre demandé, on pioche dans sa famille (genre parent).
const FAMILLES: Record<string, string[]> = {
  "Imaginaire": ["Fantasy", "Fantastique", "Science-fiction", "Horreur"],
  "Polar & Thriller": ["Polar", "Thriller"],
  "Littérature": ["Romans", "Romance", "Roman historique", "Feel-good", "Aventure", "Humour", "Classiques", "Nouvelles", "Théâtre", "Poésie"],
  "Jeunesse": ["Jeunesse", "Young Adult", "Contes & Légendes"],
};
// Genres utilitaires et documentaires : exclus des Mystery Drops (même liste que dans index.html)
const UTILITAIRES = new Set(["Art & Photographie", "Biographies & Mémoires", "Cuisine", "Développement personnel", "Économie & Entreprise", "Essais", "Histoire", "Langues & Dictionnaires", "Loisirs créatifs", "Musique & Cinéma", "Nature & Animaux", "Philosophie", "Psychologie", "Religion & Spiritualité", "Santé & Bien-être", "Sciences", "Scolaire", "Société & Politique", "Sport", "Voyage"]);
const famille = (g: string | null) => (g ? Object.values(FAMILLES).find((f) => f.includes(g)) ?? [] : []);

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

  let body: { annonce_ids?: string[]; genre?: string | null; genre_secours?: string | null };
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

  // Montant des livres (par vendeur pour le contrôle, puis total)
  const parVendeur = new Map<string, number>();
  for (const a of annonces) parVendeur.set(a.vendeur_id, r2((parVendeur.get(a.vendeur_id) ?? 0) + Number(a.prix)));
  let nb = 0, livres = 0;
  for (const s of parVendeur.values()) livres = r2(livres + s);
  nb = booksterbooks(livres);
  const prot = protection(livres);

  // Genre du cadeau
  // Seuls les genres non utilitaires du panier peuvent donner le genre des Mystery Drops
  const genres = [...new Set(annonces.map((a) => a.genre).filter((g) => g && !UTILITAIRES.has(g)))];
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

  // Genre de secours choisi par le Bookster quand ni le genre ni sa famille n'ont de texte
  const secours = typeof body.genre_secours === "string" && body.genre_secours.length <= 60 && !UTILITAIRES.has(body.genre_secours) ? body.genre_secours : null;

  // Tirage des extraits : genre exact, puis même famille, puis genre de secours, puis le reste ;
  // jamais ses propres textes ni un texte déjà reçu
  const offerts: { token: string; titre: string; genre: string }[] = [];
  if (nb > 0) {
    const { data: deja } = await admin.from("booksterbooks").select("extrait_id").eq("lecteur_id", user.id);
    const exclus = new Set((deja ?? []).map((d) => d.extrait_id));
    const { data: pool } = await admin.from("extraits").select("id, titre, genre")
      .in("statut", ["depose", "publie"]).neq("auteur_id", user.id).limit(500);
    const dispo = (pool ?? []).filter((x) => !exclus.has(x.id) && !UTILITAIRES.has(x.genre)).sort(() => Math.random() - 0.5);
    const fam = famille(genre);
    const rang = (x: { genre: string }) => (x.genre === genre ? 0 : fam.includes(x.genre) ? 1 : secours && x.genre === secours ? 2 : 3);
    const choisis = [...dispo].sort((a, b) => rang(a) - rang(b)).slice(0, nb);
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

  // Fidélité : cumul des livres achetés → statut Bookster VIP (jury du Golden Book) à 50 €
  let vip: { total_spent_books: number; is_vip_jury: boolean } | null = null;
  const { data: v, error: e3 } = await admin.rpc("ajouter_achats_livres", { p_user: user.id, p_montant: livres });
  if (e3) console.error("vip", e3); else vip = Array.isArray(v) ? v[0] ?? null : v;

  return json(200, { commande, booksterbooks: offerts, manquants: nb - offerts.length, vip });
});
