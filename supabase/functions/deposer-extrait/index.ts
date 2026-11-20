// Bookstery : dépôt d'un extrait par un auteur indépendant.
//
// 1. vérifie l'auteur connecté, le titre, le genre et le calibrage (1 000 à 5 000 mots) ;
// 2. calcule l'empreinte SHA-256 du texte ;
// 3. modération stricte par un modèle Claude léger (moderation.ts) : contenu interdit,
//    texte non littéraire, illisible ou bourré de fautes, ou pas en français → refus immédiat ;
// 4. fait analyser le texte par un détecteur d’IA (Pangram ou ZeroGPT) : au-delà de 50 % de texte IA, le dépôt est refusé ;
// 5. enregistre l'extrait ; la base fixe l'horodatage (created_at) ;
// 6. renvoie le certificat d'horodatage.
//
// Détecteur d'IA au choix (secret AI_DETECTOR) : "pangram" (par défaut) ou "zerogpt".
//
// Déploiement : modération (obligatoire) + détecteur d'IA
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// avec Pangram :
//   supabase secrets set PANGRAM_API_KEY=ta_cle_pangram
// ou avec ZeroGPT :
//   supabase secrets set AI_DETECTOR=zerogpt ZEROGPT_API_KEY=ta_cle_zerogpt
// puis :
//   supabase functions deploy deposer-extrait
// Facultatif : PANGRAM_API_URL / ZEROGPT_API_URL pour changer l'adresse des API.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { MESSAGES, moderer, type Moderation } from "./moderation.ts";

const MIN_MOTS = 1000;
const MAX_MOTS = 5000;
const SEUIL_IA = 0.5; // refus si le taux d'IA est strictement supérieur à 50 %
const GENRES = ["Aventure", "Contes & Légendes", "Fantastique", "Fantasy", "Feel-good", "Horreur", "Humour", "Jeunesse", "Nouvelles", "Polar", "Poésie", "Roman historique", "Romance", "Romans", "Science-fiction", "Thriller", "Théâtre", "Young Adult"];

// ⚠️ Adresses, en-têtes et champs de réponse à vérifier dans la documentation de ton compte.
const DETECTEUR = (Deno.env.get("AI_DETECTOR") ?? "pangram").toLowerCase();
const PANGRAM_URL = Deno.env.get("PANGRAM_API_URL") ?? "https://text.api.pangram.com/v3";
const ZEROGPT_URL = Deno.env.get("ZEROGPT_API_URL") ?? "https://api.zerogpt.com/api/detect/detectText";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const normaliser = (t: string) => t.normalize("NFC").replace(/\r\n?/g, "\n").trim();
export const compterMots = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

async function sha256(t: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Renvoie la part de texte généré par IA, entre 0 et 1.
// Accepte plusieurs formes de réponse connues de Pangram ; si aucune n'est reconnue, on refuse (sécurité).
export function scoreIA(r: Record<string, unknown>): number | null {
  const d = (r.data ?? {}) as Record<string, unknown>;
  const candidats = [
    r.fraction_ai, r.ai_likelihood, r.ai_fraction, (r.result as Record<string, unknown> | undefined)?.fraction_ai, // Pangram
    d.fakePercentage, r.fakePercentage, // ZeroGPT (pourcentage de 0 à 100)
  ];
  for (const c of candidats) {
    const n = typeof c === "string" ? parseFloat(c) : c;
    if (typeof n === "number" && isFinite(n)) return n > 1 ? n / 100 : n;
  }
  return null;
}

async function analyserIA(texte: string) {
  let r: Response;
  if (DETECTEUR === "zerogpt") {
    const cle = Deno.env.get("ZEROGPT_API_KEY");
    if (!cle) throw new Error("ZEROGPT_API_KEY manquante");
    r = await fetch(ZEROGPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ApiKey": cle },
      body: JSON.stringify({ input_text: texte }),
    });
  } else {
    const cle = Deno.env.get("PANGRAM_API_KEY");
    if (!cle) throw new Error("PANGRAM_API_KEY manquante");
    r = await fetch(PANGRAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": cle },
      body: JSON.stringify({ text: texte }),
    });
  }
  if (!r.ok) throw new Error(`${DETECTEUR} a répondu ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const score = scoreIA(data);
  if (score === null) throw new Error(`Réponse ${DETECTEUR} non reconnue : ` + JSON.stringify(data).slice(0, 300));
  return score;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { erreur: "Méthode non autorisée." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { erreur: "Connecte-toi pour déposer un extrait." });

  let body: { titre?: string; genre?: string; texte?: string; certifie?: boolean };
  try { body = await req.json(); } catch { return json(400, { erreur: "Requête illisible." }); }

  const titre = (body.titre ?? "").trim();
  const genre = body.genre ?? "";
  const texte = normaliser(body.texte ?? "");
  const nbMots = compterMots(texte);
  if (!titre || titre.length > 200) return json(400, { erreur: "Indique un titre (200 caractères maximum)." });
  if (!GENRES.includes(genre)) return json(400, { erreur: "Choisis un genre dans la liste." });
  if (!body.certifie) return json(400, { erreur: "Certifie que tu es l’auteur du texte." });
  if (nbMots < MIN_MOTS || nbMots > MAX_MOTS) return json(400, { erreur: `Ton extrait doit faire entre ${MIN_MOTS} et ${MAX_MOTS} mots (il en fait ${nbMots}).` });

  const empreinte = await sha256(texte);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: existant } = await admin.from("extraits").select("id, auteur_id").eq("sha256", empreinte).maybeSingle();
  if (existant) {
    return json(409, { erreur: existant.auteur_id === user.id
      ? "Tu as déjà déposé exactement ce texte : retrouve son certificat dans « Mes textes déposés »."
      : "Ce texte a déjà été déposé sur Bookstery." });
  }

  // Modération stricte AVANT tout enregistrement
  let mod: Moderation;
  try { mod = await moderer(titre, genre, texte); }
  catch (e) {
    console.error("modération", e);
    return json(503, { erreur: "La vérification du contenu est indisponible pour le moment. Ton texte n’a pas été déposé : réessaie dans quelques minutes." });
  }
  if (mod.decision === "refuse" && mod.motif !== "aucun") {
    await admin.from("depots_refuses").insert({ auteur_id: user.id, sha256: empreinte, nb_mots: nbMots, ai_score: null, motif: mod.motif, categories: mod.categories });
    return json(422, {
      refus: true, type: "moderation", motif: mod.motif,
      erreur: MESSAGES[mod.motif],
      // Le conseil personnalisé n'est renvoyé que pour les refus « à corriger », jamais pour un contenu interdit
      conseil: mod.motif === "illisible_ou_fautes" || mod.motif === "pas_litteraire" ? mod.explication : null,
    });
  }

  let score: number;
  try { score = await analyserIA(texte); }
  catch (e) {
    console.error(e);
    return json(503, { erreur: "L’analyse anti-IA est indisponible pour le moment. Ton texte n’a pas été déposé : réessaie dans quelques minutes." });
  }

  if (score > SEUIL_IA) {
    await admin.from("depots_refuses").insert({ auteur_id: user.id, sha256: empreinte, nb_mots: nbMots, ai_score: score, motif: "texte_ia" });
    return json(422, { refus: true, type: "ia", ai_score: score, seuil: SEUIL_IA,
      detecteur: DETECTEUR,
      erreur: `Dépôt refusé : le détecteur d’IA estime à ${Math.round(score * 100)} % la part de texte générée par IA (maximum autorisé : 50 %).` });
  }

  const { data: ex, error } = await admin.from("extraits")
    .insert({ auteur_id: user.id, auteur_nom: (user.user_metadata?.prenom as string | undefined) ?? null, titre, genre, texte, nb_mots: nbMots, sha256: empreinte, ai_score: score })
    .select("id, titre, genre, nb_mots, sha256, ai_score, created_at").single();
  if (error) { console.error(error); return json(500, { erreur: "Le dépôt n’a pas pu être enregistré. Réessaie." }); }

  return json(200, { certificat: { ...ex, detecteur: DETECTEUR, auteur_id: user.id, auteur_email: user.email } });
});
