// Bookstery : Bookster Thème — un thème par semestre pour les Mystery Drops et le Golden Book.
// Même calendrier que SAISONS dans index.html (à garder identique).
export type Saison = { id: string; nom: string; debut: string; fin: string; theme: string; format: string | null; genre: string | null; consigne: string };

export const SAISONS: Saison[] = [
  {
    id: "2027-S1", nom: "Saison 1", debut: "2027-01-01T00:00:00+01:00", fin: "2027-07-01T00:00:00+02:00",
    theme: "Spécial Nouvelles", format: "nouvelle", genre: "Nouvelles", // genre imposé à tous les dépôts de la saison
    consigne: "une nouvelle COMPLÈTE de 1 000 à 5 000 mots (un récit qui se suffit à lui-même, avec un début, un développement et une fin), pas un extrait ni un chapitre d'un texte plus long",
  },
  {
    id: "2027-S2", nom: "Saison 2", debut: "2027-07-01T00:00:00+02:00", fin: "2028-01-01T00:00:00+01:00",
    theme: "Thème bientôt dévoilé", format: null, genre: null, consigne: "",
  },
];

/** Saison en cours, ou la prochaine si aucune n'a commencé (avant-première : dépôts déjà ouverts). */
export function saisonCourante(maintenant = new Date()): Saison | null {
  return SAISONS.find((s) => maintenant < new Date(s.fin)) ?? null;
}
