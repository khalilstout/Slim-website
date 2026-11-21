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
| `src/config.ts` | **Le contenu** : objets cliquables (zones et actions), posters, réglages d'ambiance. Le fichier qu'on modifie le plus. |
| `src/main.ts` | L'interface : barre du haut, panneau (rayon, texte, vidéo, panier), notification, écran de chargement. |
| `src/view.ts` | La vue 3D : rendu, caméra, clic et survol des objets, bulles, animation d'arrivée, décor autour de la chambre. |
| `src/room.ts` | La chambre : charge le modèle Blender et lui applique ses textures. |
| `src/zones.ts` | Les calculs sur les zones cliquables (un point est-il dans une boîte ?). Sans dépendance, donc facile à tester. |
| `src/shop.ts` | L'accès à la boutique, derrière l'interface `Shop`. |
| `src/style.css` | Tous les styles. |
| `src/assets/` | Le modèle `.glb` et ses textures. |
| `tests/` | Tests unitaires et tests navigateur ([tests-et-ci.md](tests-et-ci.md)). |

### La chambre : une seule pièce, des textures pré-éclairées

Le modèle Blender arrive fusionné en un seul maillage, avec des textures où les
ombres et les lumières sont déjà peintes (« baking »). Conséquences :

- la scène n'a **aucune lumière** ni ombre à calculer : le rendu est très
  léger, y compris sur téléphone, et fidèle à l'image faite dans Blender ;
- on ne peut pas désigner « l'armoire » comme objet 3D. Les objets cliquables
  sont donc des **zones** (boîtes) décrites dans `config.ts`. Au chargement,
  `view.ts` range dans chaque zone les faces du modèle qui s'y trouvent ; ce
  sont elles qu'on éclaire au survol.

### Un seul build, deux usages

`shop.ts` choisit son mode au démarrage :

- si l'élément `#app` de la page porte un attribut `data-slimroom` (c'est ce
  qu'écrit `room.tpl`), le front parle à **PrestaShop** ;
- sinon il utilise un **catalogue fictif** et un panier gardé dans le
  navigateur. C'est le mode de la démo GitHub Pages et du serveur de
  développement.

Le reste du code ne connaît que l'interface `Shop` et ignore dans quel mode il
tourne. Les deux fichiers d'entrée portent des noms fixes (`assets/room.js`,
`assets/room.css`) pour que le module puisse les référencer ; le modèle et les
textures portent une empreinte dans leur nom (`room-base-BwCe….png`) : quand
ils changent, leur adresse change, et le navigateur ne ressert pas l'ancien.

### Parcours d'un clic

1. `view.ts` lance un rayon depuis le pointeur et prend le premier point touché
   sur la chambre ; `zones.ts` cherche la zone de `config.ts` qui contient ce
   point. Un glissement (rotation de la caméra) n'est pas un clic.
2. `main.ts`, `select(id)` : la caméra se rapproche (`view.focus`) et le
   panneau s'ouvre selon le type d'action.
3. Pour une action `shop`, `shop.getCategories()` est appelé une fois puis
   gardé en mémoire ; le bouton « + » appelle `shop.add(produit)`. Dans le
   panier, les boutons − / + appellent `shop.setQuantity(ligne, quantité)`.

Les bulles sont des boutons HTML repositionnés à chaque image au-dessus de
leur objet : elles restent nettes, cliquables et accessibles au clavier.

Si la 3D ne peut pas s'afficher (navigateur sans WebGL), l'interface reste
utilisable : le menu ouvre les mêmes panneaux.

## Le module PrestaShop (`prestashop/modules/slimroom/`)

| Fichier | Rôle |
| --- | --- |
| `slimroom.php` | Déclaration du module. À l'installation : s'accroche à `actionFrontControllerInitAfter` et crée le catalogue de démonstration. Sur la page d'accueil, ce hook affiche `room.tpl` à la place du thème, avec ses en-têtes de sécurité. |
| `views/templates/front/room.tpl` | La page HTML de la chambre. Transmet au front, dans l'attribut `data-slimroom`, l'adresse de l'API, celle du panier et le jeton de sécurité. |
| `controllers/front/api.php` | L'API JSON, en lecture seule. |
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
  "cart": {
    "count": 2,
    "items": [
      {
        "id": 20, "attributeId": 0, "name": "J'rentre dedans", "detail": "",
        "quantity": 2, "price": "12,00 €", "total": "24,00 €", "image": null
      }
    ],
    "total": "24,00 €",
    "checkoutUrl": "http://…/panier?action=show"
  }
}
```

`detail` est la déclinaison choisie (« Taille : M »), vide pour un produit
simple. `image` est l'adresse de la photo, ou `null`.

`GET /module/slimroom/api?only=cart` renvoie seulement l'objet `cart`.

Les prix sont déjà formatés par PrestaShop (devise, taxes, langue du
visiteur) : le front les affiche tels quels.

### Modifier le panier

Le front envoie les mêmes requêtes que les boutons d'un thème PrestaShop : un
`POST` sur le contrôleur natif du panier, avec le jeton fourni par `room.tpl`.
Le module n'a donc aucune logique de panier à maintenir.

| Geste | Champs envoyés (en plus du produit et du jeton) |
| --- | --- |
| Ajouter un article | `add=1`, `qty=1` |
| Augmenter / diminuer une ligne | `update=1`, `op=up` ou `op=down`, `qty=` l'écart |
| Retirer une ligne | `delete=1` |

### Sécurité de la page

`slimroom.php` envoie avec la page une politique de sécurité de contenu
(`Content-Security-Policy`) : seuls les fichiers du site se chargent, aucun
script en ligne n'est accepté, et la seule source extérieure autorisée est le
lecteur YouTube sans cookies. C'est pour cela que la configuration passe par un
attribut et non par une balise `<script>`. Détail des mesures :
[tests-et-ci.md](tests-et-ci.md).

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
