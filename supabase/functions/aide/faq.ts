// Bookstery : base de connaissances de l'assistant d'aide.
// Garder ce texte en accord avec le site (index.html, liste AIDE_FAQ pour le mode démo).

export const FAQ = `# Bookstery en bref
Bookstery est une plateforme lyonnaise, éthique et circulaire, qui donne une seconde vie aux livres d'occasion et une première aux auteurs indépendants. Les membres s'appellent les Booksters.

# Acheter un livre
- Cherche un livre par titre, auteur ou ISBN, ou clique sur un genre (42 genres, par ordre alphabétique). Dans « Les derniers livres en vente », filtre par lieu (Lyon, ma ville, ma région, toute la France) et trie par nouveautés, titre ou prix.
- Clique sur un livre pour voir sa fiche : état, prix, vendeur, ville, résumé, photos réelles de l'exemplaire, et « Dans sa bibliothèque » (les autres livres du même vendeur, avec un bouton « Tout ajouter »).
- « Ajouter » met le livre dans ton Bookster Bag (le panier, en haut). « Passer au paiement » valide la commande.
- Protection Acheteur : 5 % du montant des livres + 0,70 €, payée par l'acheteur. Le vendeur ne paie aucun frais.
- Il faut un compte (« Deviens un Bookster ») pour commander.

# Bookstery Drop et manuscrits mystères
- Le Bookstery Drop glisse des manuscrits mystères (textes inédits d'auteurs indépendants) dans les Bookster Bags.
- Commande en cours : le montant des livres du panier (tous vendeurs confondus) débloque immédiatement des « Mystery Drop » (un manuscrit mystère offert) : paliers dégressifs : 10 € = 1 Mystery Drop, 18 € = 2, 25 € = 3, 28 € = 4, 30 € = 5 Mystery Drops (maximum par commande). Le panier indique le montant manquant pour le Drop suivant et suggère des livres.
- Fidélité, statut Bookster VIP : tous les achats de livres s'additionnent au fil des commandes (montant des livres, hors Protection Acheteur). Une barre de progression de 0 à 30 € s'affiche en bas du panier et dans « Mon espace ». Dès 30 € cumulés, le compte passe automatiquement Bookster VIP : badge doré sur le profil et droit de vote pour le prochain Golden Book (le texte d'auteur élu par les Bookster VIP, publié par une maison d'édition partenaire).
- Les Mystery Drops sont toujours des fictions. Les genres utilitaires et documentaires (scolaire, cuisine, dictionnaires, guides pratiques, essais, sciences, voyage, santé…) comptent dans la jauge mais sont exclus des Mystery Drops : personne n'a envie de recevoir une page de manuel scolaire en cadeau. Si le panier ne contient que ce type de livres, l'acheteur choisit le genre (fiction) de ses manuscrits mystères.
- Si le Bag mélange plusieurs genres de fiction, l'acheteur choisit le genre de son cadeau avant de payer.
- Genre de secours : s'il n'existe aucun texte dans ce genre, le manuscrit vient de la même famille (Imaginaire : Fantasy, Fantastique, Science-fiction, Horreur ; Polar & Thriller ; Littérature : Romans, Romance, Roman historique, Feel-good, Aventure, Humour, Classiques, Nouvelles, Théâtre, Poésie ; Jeunesse : Jeunesse, Young Adult, Contes & Légendes). Sinon, le Bookster choisit parmi ses genres préférés.

# Liseuse sécurisée
- Après la commande, chaque manuscrit mystère a un QR code : scanné avec un téléphone, il ouvre la liseuse. On le retrouve aussi dans « Mes manuscrits mystères » (espace client, ou raccourci dans le Bag).
- Fond papier crème, mode nuit, temps de lecture estimé. Copier-coller et clic droit bloqués, filigrane : le texte de l'auteur est protégé.
- À la fin : noter l'auteur (1 à 5 étoiles), lui laisser un mot (il arrive par e-mail à l'auteur) et le suivre.
- « Signaler un plagiat ou un problème » en bas de la liseuse : choisir une raison (haine, violence, contenu sexuel, contenu illégal, plagiat, texte généré par IA, illisible, autre). Le signalement est anonyme pour l'auteur. Un texte est retiré automatiquement après 3 signalements graves, en attendant la vérification de l'équipe.

# Vendre un livre
- Bouton « Vendre un livre » en haut. Trois façons : scanner le code-barres avec la caméra du téléphone (ou en photo), entrer l'ISBN (10 ou 13 chiffres), ou « Livre ancien sans code-barres ? Remplir manuellement ». Avec l'ISBN, titre, auteur, résumé, couverture et genre se remplissent tout seuls.
- Photos réelles obligatoires de ton exemplaire, recto et verso, prises chez toi : elles prouvent que tu as le livre et montrent son état. Images trouvées sur internet refusées. Une photo floue, trop sombre, surexposée, illisible ou qui ne montre pas le bon livre est refusée : le titre et l'état doivent bien se voir.
- Tu choisis l'état (Comme neuf, Très bon état, Bon état), la ville, et ton prix librement (entre 0,50 € et 999 €).
- Paiement sécurisé : tu reçois 100 % de ton prix dès que l'acheteur confirme la réception.

# Espace auteur (déposer un texte)
- « Envoyer mon texte » dans la section Auteurs. Extrait de roman, premier chapitre ou nouvelle, entre 1 000 et 5 000 mots, en français, dans un genre de fiction. C'est gratuit et le texte reste à son auteur.
- Il faut cocher : « Je certifie sur l'honneur être l'auteur unique de ce texte original et inédit ».
- Avant tout enregistrement, vérifications automatiques : contenu conforme à la charte (pas de haine, violence gratuite, contenu sexuel explicite, terrorisme, contenu illégal), anti-plagiat (un texte qui reprend une œuvre déjà publiée est bloqué), texte en français, œuvre littéraire, lisibilité (pas bourré de fautes), puis détecteur d'IA (au-delà de 50 % d'écriture générée par IA, refusé).
- Si tout est bon : certificat d'horodatage avec empreinte SHA-256, qui prouve la date du dépôt. Les certificats sont dans « Mes textes déposés ».
- Œuvres du fondateur : pour lancer la plateforme, le fondateur de Bookstery partage ses propres textes. Ils portent le badge « Fondateur Bookstery », sont tirés dans les Mystery Drops comme les autres, sans priorité, et ne peuvent pas gagner le Golden Book ni les prix des librairies partenaires.
- Pack Accélérateur Auteurs : abonnement optionnel à 15 €/mois, sans engagement, payé par carte via Stripe, renouvelé automatiquement chaque mois. Tant qu'il est actif, les textes de l'auteur ont 3 fois plus de chances d'être tirés dans les Mystery Drops de leur genre (statut prioritaire) et l'auteur voit ses statistiques de lecture (envois, lectures, avis, note moyenne, abonnés). Activation et arrêt : Espace auteur, onglet « Pack Accélérateur », bouton « Gérer / Arrêter mon abonnement » (portail Stripe, arrêt en 1 clic, le Pack reste actif jusqu'à la fin du mois payé). Droit de rétractation de 14 jours.
- Les textes partent ensuite en manuscrits mystères dans le Bookstery Drop ; les avis des lecteurs arrivent par e-mail ; les textes les plus plébiscités peuvent être édités chez des libraires partenaires.

# Compte
- « Deviens un Bookster » : prénom, ville, e-mail, mot de passe et 3 genres préférés. « Se connecter » en haut à droite ; « Mot de passe oublié ? » envoie un lien de réinitialisation.
`;
