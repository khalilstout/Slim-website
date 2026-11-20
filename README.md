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
| [docs/deploiement.md](docs/deploiement.md) | Démo publique GitHub Pages, et ce qu'il reste à faire pour le cloud. |

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
| `docker compose down -v` | Efface tout (base comprise) pour repartir d'une installation neuve. |

## Organisation du dépôt

| Chemin | Contenu |
| --- | --- |
| `frontend/` | Front three.js (Vite + TypeScript). Un seul build sert à la démo et à PrestaShop. |
| `prestashop/modules/slimroom/` | Module PrestaShop : affiche la chambre en page d'accueil et fournit l'API catalogue / panier. |
| `prestashop/post-install/` | Script lancé une fois après l'installation de PrestaShop (installe le module). |
| `Dockerfile` | Image de la boutique : PrestaShop + module + front compilé. |
| `docker-compose.yml` | Environnement local : MySQL, PrestaShop, compilation du front. |
| `.github/workflows/pages.yml` | Publication de la démo sur GitHub Pages. |

## État actuel et limites connues

- La chambre est **provisoire**, construite à la main dans le code. Le vrai
  modèle Blender se branche en `.glb` (voir le guide) ; ce chargement n'a pas
  encore été testé avec un vrai fichier.
- La catégorie « Vêtements » affiche les produits de démonstration de
  PrestaShop, qui crée déjà une catégorie de ce nom à l'installation.
- Le panneau panier liste les articles mais ne permet pas d'en retirer : ça se
  fait sur la page panier de PrestaShop (bouton « Commander »).
- Pour un produit à déclinaisons (tailles, couleurs), le bouton « + » ajoute la
  déclinaison par défaut.
- Les textes de l'interface sont en français, écrits dans le code.
- Paiement : modes de test installés par défaut avec PrestaShop.
