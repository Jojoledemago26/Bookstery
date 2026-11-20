/*
 * Bookstery — configuration Supabase (fichier lu par le navigateur)
 *
 * Où trouver ces deux valeurs :
 *   Supabase > ton projet > Project Settings > API (ou "API Keys")
 *   - SUPABASE_URL      : "Project URL"  (ex. https://abcd1234.supabase.co)
 *   - SUPABASE_ANON_KEY : clé "anon public" (ou "publishable", commence par eyJ... ou sb_publishable_...)
 *
 * La clé anon/publishable est FAITE pour le navigateur : elle est visible par tous,
 * c'est la sécurité RLS de la base qui protège les données.
 *
 * ⚠️ Ne mets JAMAIS ici la clé "service_role" / "secret" : elle donne tous les droits
 *    sur ta base et ne doit vivre que sur un serveur.
 *
 * Laisse les deux champs vides pour garder le site en mode démo.
 */
window.BOOKSTERY_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  /* Facultatif : clé API Google Books (console.cloud.google.com > APIs > Books API).
   * Sans clé, la recherche par ISBN marche quand même, avec une limite d'usage partagée ;
   * en cas d'échec, le site essaie automatiquement Open Library. Restreins la clé à ton domaine. */
  GOOGLE_BOOKS_API_KEY: "",

  /* Adresse publique du site (ex. https://jojoledemago26.github.io/Bookstery/) :
   * utilisée dans les QR codes de la liseuse. Vide = adresse de la page en cours. */
  SITE_URL: "",

  /* Facultatif : adresse e-mail de l’équipe, proposée par l’assistant d’aide (bulle « ? » en bas à droite). */
  SUPPORT_EMAIL: ""
};
