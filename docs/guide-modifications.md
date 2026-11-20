# Guide des modifications

Chaque section répond à « je veux changer X » : le fichier à ouvrir, quoi
modifier, et comment vérifier.

Pour voir un changement du front :

- le plus rapide : `docker compose --profile front up frontend`, puis
  http://localhost:5173 (la page se recharge toute seule, produits fictifs) ;
- dans la vraie boutique : `docker compose run --rm frontend-build`, puis
  recharger http://localhost:8080.

Un changement dans le module PrestaShop (`prestashop/modules/slimroom/`) est
pris en compte au rechargement de la page, sans rien relancer.

## Sommaire

1. [Objets cliquables](#1-objets-cliquables)
2. [Produits et catégories](#2-produits-et-catégories)
3. [Textes, menu et nom affiché](#3-textes-menu-et-nom-affiché)
4. [Couleurs, fond et mise en page](#4-couleurs-fond-et-mise-en-page)
5. [Animation d'arrivée et ambiance](#5-animation-darrivée-et-ambiance)
6. [Caméra et lumières](#6-caméra-et-lumières)
7. [La chambre elle-même](#7-la-chambre-elle-même)
8. [Nouveau type de panneau](#8-nouveau-type-de-panneau)
9. [Données venant de PrestaShop](#9-données-venant-de-prestashop)
10. [Versions et dépendances](#10-versions-et-dépendances)
11. [En cas de problème](#11-en-cas-de-problème)

## 1. Objets cliquables

Fichier : `frontend/src/config.ts`, tableau `interactables`.

Chaque entrée relie un objet 3D à ce qui s'ouvre quand on clique dessus :

```ts
{ id: 'cd-stack', label: 'CDs', action: { type: 'shop', category: 'cds' } },
```

| Champ | Rôle |
| --- | --- |
| `id` | Nom de l'objet dans la scène 3D (voir section 7). |
| `label` | Texte de la bulle au-dessus de l'objet. **Sans `label`, pas de bulle : c'est un easter egg.** |
| `action` | Ce qui s'ouvre (tableau ci-dessous). |

| Action | Exemple | Effet |
| --- | --- | --- |
| `shop` | `{ type: 'shop', category: 'cds' }` | Liste les produits de la catégorie PrestaShop dont le slug est `cds`. |
| `text` | `{ type: 'text', title: 'Actus', body: '…' }` | Affiche un texte. Une ligne vide dans `body` (`\n\n`) sépare deux paragraphes. |
| `video` | `{ type: 'video', title: '…', youtubeId: 'XXXX', body: '…' }` | Affiche une vidéo YouTube. `youtubeId` est la partie après `v=` dans l'adresse de la vidéo. |

À savoir :

- L'**ordre** des entrées `shop` dans le tableau est l'ordre des flèches
  ◁ ▷ en bas du panneau.
- Si l'`id` n'existe pas dans la scène, l'objet est ignoré et un avertissement
  apparaît dans la console du navigateur.
- Lien direct vers un objet : `https://…/#cd-stack`. `#panier` ouvre le panier.

### Ajouter un easter egg

1. Repérer ou créer l'objet 3D et noter son nom (section 7).
2. Ajouter une entrée **sans `label`** avec une action `text` ou `video`.

## 2. Produits et catégories

Les produits se gèrent dans le **back-office PrestaShop**
(http://localhost:8080/admin-dev), pas dans le code : nom, prix, image, stock.

Le lien entre une catégorie et un objet de la chambre est le **slug** de la
catégorie (champ « URL simplifiée » dans sa fiche), repris dans `config.ts`.
Seules les catégories actives placées directement sous « Accueil » sont
exposées au front.

Pour ajouter un rayon :

1. Créer la catégorie sous « Accueil » dans le back-office, noter son slug.
2. Y ranger des produits.
3. Ajouter dans `config.ts` une entrée `shop` avec ce slug, reliée à un objet.

Deux jeux de produits fictifs existent, à tenir à jour ensemble si on veut que
la démo ressemble à la boutique :

| Où | Sert à |
| --- | --- |
| `demoCatalog` dans `frontend/src/shop.ts` | La démo GitHub Pages et le front seul (port 5173). |
| `installDemoCatalog()` dans `prestashop/modules/slimroom/slimroom.php` | Les catégories et produits créés à l'installation du module, pour avoir une boutique utilisable tout de suite. Ne s'exécute qu'à l'installation ; une catégorie déjà existante du même nom n'est pas recréée. |

## 3. Textes, menu et nom affiché

| Élément | Fichier | Où |
| --- | --- | --- |
| Menu du haut (Accueil, Actus, Merch) et ce que fait chaque bouton | `frontend/src/main.ts` | `navHome`, `navNews`, `navMerch` et la section « Événements » |
| Nom sur l'écran de chargement (« SLIM ») | `frontend/src/main.ts` | `loader` |
| Indication « Clique sur les objets… » | `frontend/src/main.ts` | `hint` |
| Messages du panier et de la boutique | `frontend/src/main.ts` | `showShop`, `showCart`, `productRow` |
| Texte « Actus » et textes des easter eggs | `frontend/src/config.ts` | `interactables` |
| Titre de l'onglet du navigateur | `frontend/index.html` (démo) ; nom de la boutique dans le back-office (PrestaShop) | |

« Actus » ouvre l'objet d'`id` `computer` et « Merch » le premier rayon du
tableau `interactables`.

## 4. Couleurs, fond et mise en page

Fichier : `frontend/src/style.css`.

| Élément | Où |
| --- | --- |
| Palette (fond, panneau, accent jaune, texte) | Variables `--bg`, `--paper`, `--ink`, `--accent`… dans `:root`, tout en haut |
| Dégradé du fond de page | Règle `html, body`, propriété `background` |
| Largeur du panneau sur ordinateur | Variable `--panel` |
| Hauteur de la barre du haut | Variable `--topbar` |
| Bulles au-dessus des objets | `.label` |
| Passage en mode téléphone (panneau en bas) | Bloc `@media (max-width: 760px)`, tout en bas |
| Écran de chargement | `.loader`, `.loader-name`, `.loader-bar` |

Si la couleur de fond `--bg` change, reporter la même valeur dans la balise
`theme-color` de `frontend/index.html` et de
`prestashop/modules/slimroom/views/templates/front/room.tpl` (couleur de la
barre du navigateur sur téléphone).

## 5. Animation d'arrivée et ambiance

Réglages simples : `frontend/src/config.ts`, objet `ambiance`.

| Réglage | Effet |
| --- | --- |
| `intro` | `false` désactive l'animation d'arrivée. |
| `introDuration` | Durée en secondes. |
| `particles` | Nombre de poussières lumineuses ; `0` les retire. |

Pour aller plus loin : `frontend/src/view.ts`.

| Élément | Où |
| --- | --- |
| Déroulé de l'arrivée (descente, rotation, apparition des meubles) | Fonction `playIntro` |
| Hauteur de départ de la chambre | Constante `INTRO_HEIGHT` |
| Halo sous la chambre, couleur et taille des poussières | Fonction `buildAmbiance` |

Dans `playIntro`, `t` va de 0 à 1 sur la durée de l'animation : la chambre
descend et tourne pendant les premiers 70 %, puis les meubles apparaissent un
par un. L'animation est sautée automatiquement pour les personnes qui ont
activé « réduire les animations » sur leur appareil ; garder ce comportement.

## 6. Caméra et lumières

Fichier : `frontend/src/view.ts`.

| Réglage | Où | Effet |
| --- | --- | --- |
| `FOV` | constantes en haut | Angle de champ. Plus grand = perspective plus marquée. |
| `HOME_TARGET` | constantes | Point regardé par la caméra au repos. |
| `HOME_AZIMUTH`, `HOME_POLAR` | constantes | Angle de vue au repos (autour de la chambre, hauteur). |
| `FOCUS_RATIO` | constantes | Rapprochement quand un objet est sélectionné (plus petit = plus près). |
| Limites de rotation et de zoom | `controls.min…` / `controls.max…`, et `resize()` | Jusqu'où l'utilisateur peut tourner et zoomer. |
| Cadrage ordinateur / téléphone | `resize()`, `fitWidth` et le `7.3` | Place que prend la chambre à l'écran. |
| Lumières | `HemisphereLight`, `sun`, `windowGlow` | Ambiance générale, soleil et ombres, lueur des fenêtres. |
| Couleur de surbrillance d'un objet | `HIGHLIGHT` | |

## 7. La chambre elle-même

### Aujourd'hui : chambre provisoire

Fichier : `frontend/src/room.ts`. Chaque meuble a sa fonction (`buildBed`,
`buildWardrobe`, `buildCdStack`…), appelée dans `buildPlaceholderRoom`.

- `box(parent, [largeur, hauteur, profondeur], [x, y, z], couleur)` pose une
  boîte à bords arrondis ; `y` est le bas de la boîte.
- `cylinder(...)` et `panel(...)` (surface avec une image dessinée) complètent.
- Repère : le sol fait 6 × 6 et est centré sur l'origine ; le mur de gauche est
  en `x = -3`, celui de droite en `z = -3`, le sol en `y = 0`.
- Un objet devient cliquable s'il est dans un `group(room, 'son-nom')` et que
  ce nom figure dans `config.ts`.

Pour ajouter un meuble : écrire une fonction `buildMonMeuble(room)`, l'appeler
dans `buildPlaceholderRoom`, puis éventuellement le déclarer dans `config.ts`.

### Demain : le vrai modèle Blender

1. Dans Blender, nommer les objets cliquables comme les `id` de `config.ts`
   (ou adapter les `id`), puis exporter en glTF binaire (`.glb`).
2. Placer le fichier dans `frontend/src/assets/room.glb`.
3. Dans `config.ts`, suivre le commentaire au-dessus de `roomModel`
   (un `import` du fichier, puis `roomModel = model`).

Ce chargement est prévu mais **pas encore testé avec un vrai fichier**. Points
à vérifier le jour venu :

- l'échelle et la position : la caméra est réglée pour une chambre d'environ
  6 unités de côté, centrée sur l'origine, sol en `y = 0` (sinon ajuster la
  section 6) ;
- la surbrillance au survol suppose des matériaux standard de glTF ;
- l'animation d'arrivée fait apparaître un par un les groupes de premier
  niveau de la scène : selon la structure du fichier, adapter `furniture`
  dans `view.ts` ;
- le poids du fichier : viser quelques Mo, compresser les textures, pour que
  le chargement reste rapide sur téléphone.

## 8. Nouveau type de panneau

Exemple : une galerie de photos.

1. `frontend/src/config.ts` : ajouter la forme au type `Action`, par exemple
   `| { type: 'gallery'; title: string; images: string[] }`.
2. `frontend/src/main.ts`, fonction `select` : ajouter le cas correspondant et
   construire le contenu avec `openPanel(titre, [éléments])`.
3. `frontend/src/style.css` : styles du nouveau contenu.

TypeScript signale à la compilation les endroits qui ne gèrent pas le nouveau
type.

## 9. Données venant de PrestaShop

Le front ne parle à la boutique que par `frontend/src/shop.ts` (interface
`Shop`). Pour afficher une information de plus sur un produit (description,
stock…) :

1. `prestashop/modules/slimroom/controllers/front/api.php` : ajouter le champ
   dans `categories()`.
2. `frontend/src/shop.ts` : l'ajouter à l'interface `Product` et aux produits
   fictifs de `demoCatalog`.
3. `frontend/src/main.ts`, `productRow` : l'afficher.

Si le module doit réagir à un nouvel événement PrestaShop (un « hook »), il
faut l'enregistrer dans `install()` de `slimroom.php` puis réinstaller le
module :

```sh
docker compose exec -u www-data prestashop php bin/console prestashop:module reset slimroom
```

## 10. Versions et dépendances

| Quoi | Où |
| --- | --- |
| Version de PrestaShop | Première ligne `FROM prestashop/prestashop:…` du `Dockerfile` |
| Version de MySQL | `docker-compose.yml`, service `db` |
| Version de Node | `Dockerfile`, `docker-compose.yml` et `.github/workflows/pages.yml` (à garder identiques) |
| three.js, Vite, TypeScript | `frontend/package.json`, puis régénérer `package-lock.json` avec `docker compose run --rm frontend-build npm install` |

Le `Dockerfile` contient un correctif pour un défaut de l'image PrestaShop
9.2.1 (expliqué en commentaire). Lors d'un changement de version, la
construction de l'image échoue volontairement si la ligne corrigée n'existe
plus : vérifier alors si le correctif est encore nécessaire et le retirer.

## 11. En cas de problème

| Symptôme | Piste |
| --- | --- |
| Page blanche sur http://localhost:8080 | Le front n'est pas compilé : `docker compose run --rm frontend-build`. |
| Un objet ne réagit pas au clic | Son `id` dans `config.ts` ne correspond à aucun nom dans la scène (avertissement dans la console du navigateur), ou un autre meuble passe devant lui. |
| « La boutique ne répond pas » dans le panneau | Ouvrir http://localhost:8080/module/slimroom/api : la réponse ou l'erreur PHP s'y lit directement. |
| Un rayon est vide | Vérifier que le slug de `config.ts` est bien celui de la catégorie, qu'elle est active et directement sous « Accueil ». |
| L'installation semble bloquée | `docker compose logs -f prestashop` ; la première installation prend quelques minutes. |
| Tout est cassé | `docker compose down -v` puis `docker compose up --build` repart d'une installation neuve (les produits saisis à la main sont perdus). |
