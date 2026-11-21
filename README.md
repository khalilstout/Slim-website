# Slim-website

Une boutique dont la page d'accueil est une chambre en 3D : on clique sur les
objets pour ouvrir les rayons (CDs, vêtements, posters…) ou découvrir des
easter eggs. La 3D est faite avec three.js, le panier et le paiement avec
PrestaShop 9.

## Documentation

| Document | Pour quoi faire |
| --- | --- |
| [docs/guide-modifications.md](docs/guide-modifications.md) | « Je veux changer X » : quel fichier ouvrir et quoi y modifier. **À lire en premier.** |
| [docs/architecture.md](docs/architecture.md) | Comment les morceaux s'emboîtent : front, module PrestaShop, API, Docker. |
| [docs/tests-et-ci.md](docs/tests-et-ci.md) | Les tests, la CI GitHub Actions, les contrôles de sécurité, et quoi faire quand un job est rouge. |
| [docs/deploiement.md](docs/deploiement.md) | Démo publique GitHub Pages, et ce qu'il reste à faire pour le cloud. |

Démo en ligne (produits fictifs, sans paiement) : https://khalilstout.github.io/Slim-website/

## Lancer en local

Il faut seulement Docker.

```sh
docker compose up --build
```

La première fois, PrestaShop s'installe tout seul (quelques minutes). Ensuite :

- boutique : http://localhost:8080
- back-office : http://localhost:8080/admin-dev — identifiants dans `docker-compose.yml`
  (valeurs de développement, à surcharger via `.env`, voir `.env.example`)

Commandes utiles :

| Commande | Effet |
| --- | --- |
| `docker compose run --rm frontend-build` | Recompile le front ; recharger la page suffit ensuite. |
| `docker compose --profile front up frontend` | Front seul sur http://localhost:5173, rechargement à chaud, produits fictifs. Le plus confortable pour travailler la 3D et l'interface. |
| `docker compose exec frontend npm run check` | Lint, types et tests unitaires (le service `frontend` doit tourner). À lancer avant de pousser. |
| `python3 tests/integration/smoke.py` | Vérifie la boutique locale de bout en bout (page, API, panier). |
| `docker compose down -v` | Efface tout (base comprise) pour repartir d'une installation neuve. |

## Organisation du dépôt

| Chemin | Contenu |
| --- | --- |
| `frontend/` | Front three.js (Vite + TypeScript). Un seul build sert à la démo et à PrestaShop. |
| `frontend/src/assets/` | Le modèle 3D de la chambre et ses textures, prêts pour le web. |
| `frontend/tests/` | Tests unitaires (`unit/`) et tests navigateur (`e2e/`). |
| `Ressources/bundle_001/` | Sources Blender et textures d'origine de la chambre. |
| `tests/integration/` | Test d'une vraie boutique PrestaShop en fonctionnement. |
| `prestashop/modules/slimroom/` | Module PrestaShop : affiche la chambre en page d'accueil et fournit l'API catalogue / panier. |
| `prestashop/post-install/` | Script lancé une fois après l'installation de PrestaShop (installe le module). |
| `Dockerfile` | Image de la boutique : PrestaShop + module + front compilé. |
| `docker-compose.yml` | Environnement local : MySQL, PrestaShop, compilation du front. |
| `.github/workflows/ci.yml` | Intégration continue : lint, tests, navigateurs, PHP, intégration. |
| `.github/workflows/security.yml` | Contrôles de sécurité : dépendances, analyse du code, secrets. |
| `.github/workflows/pages.yml` | Publication de la démo sur GitHub Pages. |
| `.github/dependabot.yml` | Mises à jour automatiques des dépendances. |

## État actuel et limites connues

- La chambre est le modèle Blender (`bundle_001`). Il est fusionné en une seule
  pièce : les objets cliquables sont des zones réglées à la main dans
  `config.ts`, à réajuster si un meuble bouge dans une prochaine version.
- Les deux grands posters et l'écran de l'ordinateur n'ont pas encore leur
  image définitive : ils affichent un contenu provisoire (voir le guide,
  section 7).
- Le toucher et la fluidité n'ont pas été vérifiés sur un vrai téléphone, seulement
  en émulation dans les tests.
- La catégorie « Vêtements » affiche les produits de démonstration de
  PrestaShop, qui crée déjà une catégorie de ce nom à l'installation.
- Pour un produit à déclinaisons (tailles, couleurs), le bouton « + » ajoute la
  déclinaison par défaut.
- Les textes de l'interface sont en français, écrits dans le code.
- Paiement : modes de test installés par défaut avec PrestaShop.
