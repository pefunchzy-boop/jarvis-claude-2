# JARVIS Gratuit

Version 100% gratuite de l'assistant JARVIS (orbe HUD, cartes, rapports),
sans API payante :

- **Voix** : Web Speech API du navigateur (reconnaissance + synthèse) — gratuit, aucun serveur vocal
- **Cerveau** : API Gemini (tier gratuit) avec function calling
- **App** : PWA installable sur téléphone, hébergée sur Render

La clé Gemini reste **côté serveur uniquement** — jamais exposée au navigateur.

## 1. Créer une clé Gemini gratuite

1. Va sur https://aistudio.google.com/apikey
2. Crée une clé API (gratuite)
3. Garde-la de côté, tu en auras besoin à l'étape 3

## 2. Déployer sur Render

1. Pousse ce dossier sur un dépôt GitHub (privé de préférence)
2. Sur https://dashboard.render.com → **New** → **Web Service**
3. Connecte le dépôt GitHub
4. Render détecte `render.yaml` automatiquement (Node, plan gratuit)
5. Dans les **Environment Variables**, ajoute :
   - `GEMINI_API_KEY` = ta clé de l'étape 1
6. Déploie. Ton app sera dispo sur `https://<ton-nom>.onrender.com`

## 3. Utiliser l'app

- Ouvre l'URL Render sur ton téléphone (Safari/Chrome)
- "Ajouter à l'écran d'accueil" pour l'installer comme une app (PWA)
- Appuie sur l'orbe pour parler, elle répond à voix haute

⚠️ Le micro (Web Speech API) nécessite HTTPS — Render fournit ça automatiquement.

## Fonctionnalités actuelles

- Conversation vocale en français avec JARVIS (Gemini)
- `display_card` : JARVIS peut afficher des cartes d'info à l'écran
- `display_report` : tableaux de bord (KPIs, graphique, tableau)
- `generate_linkedin_post` : génère un texte + une image de post LinkedIn, prêts à copier (jamais publiés automatiquement)

## Limites connues (plan gratuit)

- Render gratuit met le service en veille après inactivité → premier appel un peu lent après une pause (~30-50s de "réveil")
- Le tier gratuit Gemini a un quota de requêtes/jour — largement suffisant pour un usage perso
- La reconnaissance vocale (Web Speech API) fonctionne mieux sur Chrome ; sur iPhone, utilise Safari

## Ajouter d'autres actions plus tard

Chaque nouvelle capacité (comme demandé : une seule au départ) s'ajoute en 2 endroits dans `server.js` :
1. Sa déclaration dans `TOOLS` (nom, description, paramètres)
2. Son exécution dans la boucle `runTurn()` (le `if (name === "...")`)
