# Tests, CI et sécurité

Trois niveaux de tests, du plus rapide au plus complet, puis les contrôles de
sécurité. Tout tourne automatiquement sur GitHub à chaque pull request et à
chaque push sur `main` ; tout peut aussi se lancer en local avec Docker.

## Vue d'ensemble

| Niveau | Ce qu'il vérifie | Où | Durée |
| --- | --- | --- | --- |
| Lint et types | Fautes de code, règles de sécurité de base (`eval` interdit…), cohérence des types. | `frontend/eslint.config.js`, `frontend/tsconfig.json` | secondes |
| Tests unitaires | Les zones cliquables, la cohérence de `config.ts`, le panier de démo, les requêtes envoyées à PrestaShop. | `frontend/tests/unit/` | secondes |
| Tests navigateur | Le site compilé, dans de vrais navigateurs : affichage 3D, rayons, panier, menu, liens directs, téléphone. | `frontend/tests/e2e/` | ~1 min |
| Test d'intégration | Une vraie boutique PrestaShop : page d'accueil, en-têtes de sécurité, API, parcours panier. | `tests/integration/smoke.py` | ~10 min (installation comprise) |

## Lancer en local

Dans `frontend/` (ou dans le conteneur : `docker compose exec frontend sh`,
après `docker compose --profile front up -d frontend`) :

| Commande | Effet |
| --- | --- |
| `npm run check` | Lint + types + tests unitaires. **À lancer avant de pousser.** |
| `npm run lint` | Lint seul. |
| `npm run typecheck` | Types seuls. |
| `npm test` | Tests unitaires. |
| `npm run test:coverage` | Tests unitaires avec la couverture (rapport dans `frontend/coverage/`). Échoue sous 85 % de lignes couvertes sur `shop.ts`, `zones.ts`, `config.ts`. |

Tests navigateur, avec les mêmes navigateurs que la CI (depuis la racine du
dépôt ; le numéro de l'image doit être celui de `@playwright/test` dans
`frontend/package.json`) :

```sh
docker compose run --rm frontend-build
docker run --rm --ipc=host -v "$PWD/frontend":/app -w /app \
  mcr.microsoft.com/playwright:v1.65.1-noble npx playwright test
```

Ajouter `--project=firefox` pour un seul navigateur, ou le nom d'un test entre
guillemets pour n'en lancer qu'un.

Test d'intégration, contre la boutique locale :

```sh
docker compose up -d --build
python3 tests/integration/smoke.py            # attend que la boutique réponde
```

## Ce que couvrent les tests navigateur

Chaque test tourne sur cinq configurations (`frontend/playwright.config.ts`) :
Chrome, Firefox et Safari sur ordinateur, Chrome sur Pixel 7, Safari sur
iPhone 14. Pour en ajouter une, une ligne dans `projects` et une dans la
matrice du job `e2e` de `.github/workflows/ci.yml`.

- `room.spec.ts` : le site en mode démonstration. La chambre s'affiche et
  dessine vraiment quelque chose, les bulles ouvrent les rayons, le panier
  (ajout, quantité, retrait, rechargement), le menu, Échap, les liens directs,
  les adresses mal formées, la page ne déborde pas de l'écran.
- `prestashop.spec.ts` : le mode PrestaShop **sans PrestaShop**. La page reçoit
  la configuration qu'écrirait le module et une fausse API. Sert surtout à
  vérifier qu'un nom de produit piégé (`<img onerror=…>`) s'affiche comme du
  texte et n'exécute rien, et que les pannes de la boutique donnent un message
  lisible.

Sur une machine sans carte graphique, Firefox peut refuser la 3D. Le site doit
alors rester utilisable par le menu : dans ce cas, et pour Firefox seulement,
les tests 3D vérifient ce mode de secours au lieu d'échouer.

### Écrire un test

- Unitaire : un fichier `quelquechose.test.ts` dans `frontend/tests/unit/`.
  Les fichiers existants servent de modèle (`shop.demo.test.ts` pour du code
  qui utilise le navigateur, `zones.test.ts` pour du calcul pur).
- Navigateur : ajouter un `test(...)` dans `frontend/tests/e2e/room.spec.ts`.
  Commencer par `await open(page, './#cd-stack')`, puis chercher les éléments
  par leur rôle et leur nom (`getByRole('button', { name: … })`) plutôt que
  par leur classe CSS : le test survit ainsi aux changements de style.

## La CI (GitHub Actions)

Trois workflows dans `.github/workflows/`.

### `ci.yml` — à chaque pull request et push sur `main`

| Job | Contenu |
| --- | --- |
| Front | Lint, types, tests unitaires avec couverture, build ; sur Node 24 et 26. |
| Navigateur | Les tests `e2e`, un job par configuration (5 en parallèle). En cas d'échec, captures d'écran et traces sont jointes au run (« Artifacts »). |
| PHP | Syntaxe du module sur PHP 8.1 à 8.5. |
| Dockerfile et workflows | `hadolint` (Dockerfile), `actionlint` (workflows), validité de `docker-compose.yml`. |
| Intégration | Construit l'image, démarre MySQL + PrestaShop, lance `smoke.py`. |

### `security.yml` — pull requests, `main`, et chaque lundi

| Job | Ce qu'il cherche | Bloquant |
| --- | --- | --- |
| Dépendances npm | Failles connues (`npm audit`) : dès « modéré » pour ce qui part chez les visiteurs, dès « élevé » pour les outils. | oui |
| Nouvelles dépendances | Une pull request qui ajoute une dépendance vulnérable. | oui |
| CodeQL | Failles dans le TypeScript et dans les workflows. Résultats dans l'onglet « Security » du dépôt. | oui |
| Semgrep | Failles dans le PHP du module (que CodeQL n'analyse pas), le TypeScript, le Dockerfile, les workflows ; secrets. | oui |
| Trivy · dépôt | Dépendances vulnérables, secrets, mauvaise configuration Docker. | oui |
| Trivy · image | Failles critiques de l'image Docker complète (PrestaShop et son système). Rapport dans le résumé du run. | non |
| Gitleaks | Mots de passe ou clés oubliés, dans tout l'historique git. | oui |

Le passage du lundi sert à être prévenu d'une faille publiée entre-temps, même
si personne n'a touché au code.

Deux réglages du dépôt sont activés (« Settings » → « Advanced Security ») :
« Dependency graph » et « Dependabot alerts ». GitHub prévient par e-mail dès
qu'une faille touche une dépendance, et le job « Nouvelles dépendances » en a
besoin : s'il échoue avec « Forbidden », c'est que ce réglage a été coupé.

### `pages.yml` — push sur `main` qui touche `frontend/`

Relance lint, types et tests unitaires, compile et publie la démo. Voir
[deploiement.md](deploiement.md).

### Quand un job est rouge

| Job | Que faire |
| --- | --- |
| Front | Lancer `npm run check` en local : l'erreur y est la même. |
| Navigateur | Ouvrir le run, télécharger l'artefact `playwright-…`, puis `npx playwright show-trace` sur le fichier `trace.zip` : on y voit la page pas à pas. Relancer en local avec `--project=<nom>`. |
| PHP | Erreur de syntaxe, avec le fichier et la ligne. |
| Intégration | Lire l'étape « Journaux en cas d'échec ». Reproduire avec `docker compose down -v && docker compose up -d --build` puis `smoke.py`. |
| Dépendances npm | `npm audit` en local indique le paquet ; `npm audit fix`, ou attendre la pull request Dependabot. |
| Semgrep, CodeQL | Lire le message : il cite la ligne. Corriger le code plutôt que masquer l'alerte ; si c'est un faux positif, le justifier en commentaire à côté de l'exclusion. |
| Trivy · dépôt | Idem. Les alertes acceptées sont dans `.trivyignore`, chacune avec sa raison. |
| Gitleaks | Un secret est dans l'historique : **le changer immédiatement** là où il sert (le retirer du code ne suffit pas, il reste lisible dans les anciens commits). |

Pour relancer un workflow à la main : onglet « Actions » → le workflow →
« Run workflow ». Préférer cela à « Re-run all jobs » pour la démo Pages
(un second passage dans le même run échoue sur un doublon de fichier).

### Chaîne d'approvisionnement

- Les actions GitHub sont épinglées sur un **commit** (la version est en
  commentaire) et les images des scanners sur une **empreinte** : une
  étiquette comme `v4` peut être déplacée par son auteur, pas un commit.
- Les workflows n'ont que le droit de lire le dépôt, sauf les deux jobs qui
  ont besoin de plus (publication Pages, envoi des résultats CodeQL).
- Dependabot propose les mises à jour chaque semaine.

Pour mettre à jour un scanner épinglé par empreinte (hadolint, Semgrep,
Gitleaks) : `docker pull <image>:latest`, copier la ligne `Digest:` dans le
workflow.

## Mesures de sécurité dans le code

| Mesure | Où |
| --- | --- |
| Les textes venant de la boutique sont insérés comme du texte, jamais comme du HTML. | `h()` dans `frontend/src/main.ts` |
| Politique de sécurité de contenu : aucun script en ligne, rien d'extérieur sauf les vidéos YouTube (sans cookies de suivi). | En-têtes dans `prestashop/modules/slimroom/slimroom.php` |
| En-têtes `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. | Idem |
| La configuration passe à la page par un attribut, pas par un script en ligne. | `room.tpl`, `readPrestaConfig` dans `shop.ts` |
| L'API du module est en lecture seule ; le panier ne change que par le contrôleur natif de PrestaShop, avec son jeton. | `controllers/front/api.php`, `shop.ts` |
| Le panier de démonstration ne fait pas confiance au stockage du navigateur (quantités bornées, produits inconnus ignorés). | `demoShop` dans `shop.ts` |
| Aucun secret dans le dépôt : les mots de passe de `docker-compose.yml` sont des valeurs de développement, à surcharger par `.env`. | `.env.example` |

Ce qui reste à faire au moment de la mise en production est listé dans
[deploiement.md](deploiement.md) (HTTPS, mots de passe, dossier
d'administration, sauvegardes).
