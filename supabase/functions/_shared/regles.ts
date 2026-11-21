// Bookstery : règles communes aux fonctions (mêmes valeurs que dans index.html).

// Mystery Drops : paliers dégressifs sur le montant des livres seul (hors Protection Acheteur et frais de port)
export const PALIERS = [10, 18, 25, 28, 30];
export const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
export const cents = (x: number) => Math.round(x * 100);
export const mysteryDrops = (livres: number) => PALIERS.filter((p) => livres + 1e-9 >= p).length;
// Protection Acheteur : 5 % du prix des livres + 0,70 €, payée par l'acheteur, revient intégralement à Bookstery
export const protection = (livres: number) => (livres > 0 ? r2(livres * 0.05 + 0.7) : 0);

export const FAMILLES: Record<string, string[]> = {
  "Imaginaire": ["Fantasy", "Fantastique", "Science-fiction", "Horreur"],
  "Polar & Thriller": ["Polar", "Thriller"],
  "Littérature": ["Romans", "Romance", "Roman historique", "Feel-good", "Aventure", "Humour", "Classiques", "Nouvelles", "Théâtre", "Poésie"],
  "Jeunesse": ["Jeunesse", "Young Adult", "Contes & Légendes"],
};
export const UTILITAIRES = new Set(["Art & Photographie", "Biographies & Mémoires", "Cuisine", "Développement personnel", "Économie & Entreprise", "Essais", "Histoire", "Langues & Dictionnaires", "Loisirs créatifs", "Musique & Cinéma", "Nature & Animaux", "Philosophie", "Psychologie", "Religion & Spiritualité", "Santé & Bien-être", "Sciences", "Scolaire", "Société & Politique", "Sport", "Voyage"]);
export const famille = (g: string | null) => (g ? Object.values(FAMILLES).find((f) => f.includes(g)) ?? [] : []);

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
