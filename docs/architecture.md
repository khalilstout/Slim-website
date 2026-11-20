# Architecture

## Vue d'ensemble

```
Navigateur
  │  GET /                              page d'accueil
  ▼
PrestaShop (conteneur Apache + PHP)
  ├─ module slimroom
  │    ├─ remplace la page d'accueil par room.tpl  ──► charge room.js / room.css (front compilé)
  │    └─ /module/slimroom/api                     ──► JSON : catégories, produits, panier
  ├─ /panier (contrôleur natif)                    ──► ajout au panier
  └─ tunnel de commande natif                      ──► paiement
  ▼
MySQL
```

Le choix structurant : **le front 3D est servi par PrestaShop, sur le même
domaine**. Il réutilise ainsi la session, le panier et le tunnel de commande
natifs, sans avoir à réécrire un panier ni à gérer d'authentification entre
deux sites. Toutes les pages autres que l'accueil (panier, commande, compte)
restent celles du thème PrestaShop.

## Le front (`frontend/`)

Vite + TypeScript + three.js, sans framework d'interface.

| Fichier | Rôle |
| --- | --- |
| `src/config.ts` | **Le contenu** : objets cliquables, actions, réglages d'ambiance. Le fichier qu'on modifie le plus. |
| `src/main.ts` | L'interface : barre du haut, panneau (boutique, texte, vidéo, panier), notifications, écran de chargement. |
| `src/view.ts` | La vue 3D : rendu, caméra, lumières, clic et survol des objets, bulles, animation d'arrivée, décor autour de la chambre. |
| `src/room.ts` | La chambre : version provisoire construite à la main, ou chargement d'un modèle `.glb`. |
| `src/shop.ts` | L'accès à la boutique, derrière l'interface `Shop`. |
| `src/style.css` | Tous les styles. |

### Un seul build, deux usages

`shop.ts` choisit son mode au démarrage :

- si la page définit `window.SLIMROOM` (c'est ce que fait `room.tpl`), le front
  parle à **PrestaShop** ;
- sinon il utilise un **catalogue fictif** et un panier gardé dans le
  navigateur. C'est le mode de la démo GitHub Pages et du serveur de
  développement.

Le reste du code ne connaît que l'interface `Shop` et ignore dans quel mode il
tourne. Les fichiers compilés portent des noms fixes (`assets/room.js`,
`assets/room.css`) pour que le module puisse les référencer.

### Parcours d'un clic

1. `view.ts` lance un rayon depuis le pointeur ; le premier objet touché est
   remonté jusqu'à un groupe déclaré dans `config.ts`. Un glissement (rotation
   de la caméra) n'est pas un clic.
2. `main.ts`, `select(id)` : la caméra se rapproche (`view.focus`) et le
   panneau s'ouvre selon le type d'action.
3. Pour une action `shop`, `shop.getCategories()` est appelé une fois puis
   gardé en mémoire ; le bouton « + » appelle `shop.add(produit)`.

Les bulles sont des boutons HTML repositionnés à chaque image au-dessus de
leur objet : elles restent nettes, cliquables et accessibles au clavier.

## Le module PrestaShop (`prestashop/modules/slimroom/`)

| Fichier | Rôle |
| --- | --- |
| `slimroom.php` | Déclaration du module. À l'installation : s'accroche à `actionFrontControllerInitAfter` et crée le catalogue de démonstration. Sur la page d'accueil, ce hook affiche `room.tpl` à la place du thème. |
| `views/templates/front/room.tpl` | La page HTML de la chambre. Transmet au front, via `window.SLIMROOM`, l'adresse de l'API, celle du panier et le jeton de sécurité. |
| `controllers/front/api.php` | L'API JSON. |
| `views/dist/` | Le front compilé (généré, jamais commité). |

### API

`GET /module/slimroom/api`

```json
{
  "categories": [
    {
      "slug": "cds",
      "name": "CDs",
      "products": [
        { "id": 20, "attributeId": 0, "name": "J'rentre dedans", "price": "12,00 €", "image": null }
      ]
    }
  ],
  "cart": { "count": 0, "items": [], "total": "0,00 €", "checkoutUrl": "http://…/panier?action=show" }
}
```

`GET /module/slimroom/api?only=cart` renvoie seulement l'objet `cart`.

Les prix sont déjà formatés par PrestaShop (devise, taxes, langue du
visiteur) : le front les affiche tels quels.

### Ajout au panier

Le front envoie la même requête que le bouton « Ajouter au panier » d'un thème
PrestaShop : un `POST` sur le contrôleur natif du panier, avec le jeton fourni
par `room.tpl`. Le module n'a donc aucune logique de panier à maintenir.

## Docker

| Élément | Rôle |
| --- | --- |
| `Dockerfile` | Compile le front, puis part de l'image officielle PrestaShop et y ajoute le module, le front compilé et le script post-installation. C'est l'image destinée au cloud. |
| `docker-compose.yml` | Environnement local. Pour le confort, le module et le front compilé y sont **montés depuis le dépôt** par-dessus ceux de l'image : une modification est visible sans reconstruire. |
| `prestashop/post-install/` | Exécuté une seule fois, après l'installation automatique de PrestaShop : installe le module. |

Services de `docker-compose.yml` :

| Service | Rôle |
| --- | --- |
| `db` | MySQL. Données dans le volume `db-data`. |
| `frontend-build` | Compile le front puis s'arrête. Lancé avant `prestashop`. |
| `prestashop` | La boutique, port 8080. Fichiers dans le volume `ps-data`. |
| `frontend` | Serveur de développement du front seul (profil `front`, port 5173). |

PrestaShop s'installe au premier démarrage, quand le volume `ps-data` est vide.
Les démarrages suivants réutilisent l'installation existante.
