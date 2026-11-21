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

Avant de pousser : `npm run check` dans `frontend/` (lint, types, tests
unitaires). Voir [tests-et-ci.md](tests-et-ci.md).

## Sommaire

1. [Objets cliquables](#1-objets-cliquables)
2. [Produits et catégories](#2-produits-et-catégories)
3. [Textes, menu et nom affiché](#3-textes-menu-et-nom-affiché)
4. [Couleurs, fond et mise en page](#4-couleurs-fond-et-mise-en-page)
5. [Animation d'arrivée et ambiance](#5-animation-darrivée-et-ambiance)
6. [Caméra et surbrillance](#6-caméra-et-surbrillance)
7. [La chambre : modèle Blender et textures](#7-la-chambre--modèle-blender-et-textures)
8. [Nouveau type de panneau](#8-nouveau-type-de-panneau)
9. [Données venant de PrestaShop](#9-données-venant-de-prestashop)
10. [Versions et dépendances](#10-versions-et-dépendances)
11. [En cas de problème](#11-en-cas-de-problème)

## 1. Objets cliquables

Fichier : `frontend/src/config.ts`, tableau `interactables`.

Chaque entrée décrit une **zone** de la chambre et ce qui s'ouvre quand on
clique dedans :

```ts
{
  id: 'cd-stack',
  label: 'CDs',
  zone: { min: [-1.78, 0, 1.62], max: [-0.95, 0.72, 2.47] },
  action: { type: 'shop', category: 'cds' },
},
```

| Champ | Rôle |
| --- | --- |
| `id` | Identifiant unique (minuscules, chiffres, tirets). Sert de lien direct : `https://…/#cd-stack`. |
| `label` | Texte de la bulle au-dessus de l'objet. **Sans `label`, pas de bulle : c'est un easter egg.** |
| `zone` | Boîte qui entoure l'objet : coin bas `min` et coin haut `max`, en mètres. |
| `action` | Ce qui s'ouvre (tableau ci-dessous). |

| Action | Exemple | Effet |
| --- | --- | --- |
| `shop` | `{ type: 'shop', category: 'cds' }` | Liste les produits de la catégorie PrestaShop dont le slug est `cds`. |
| `text` | `{ type: 'text', title: 'Actus', body: '…' }` | Affiche un texte. Une ligne vide dans `body` (`\n\n`) sépare deux paragraphes. |
| `video` | `{ type: 'video', title: '…', youtubeId: 'XXXX', body: '…' }` | Affiche une vidéo YouTube. `youtubeId` est la partie après `v=` dans l'adresse de la vidéo. |

### Pourquoi des zones, et comment les régler

Le modèle Blender est livré **fusionné en une seule pièce** (c'est ce qui
permet la texture pré-éclairée, voir section 7). On ne peut donc pas cliquer
« l'armoire » : on regarde dans quelle boîte tombe le point cliqué.

Repère de la chambre (le sol est en `y = 0`, le centre du sol en `x = 0, z = 0`) :

| Axe | Sens |
| --- | --- |
| `x` | De `-2.7` (côté bureau et clavier) à `+2.5` (mur des posters, lit). |
| `y` | Hauteur, de `0` (sol) à `3.1` (haut des murs). |
| `z` | De `-2.5` (mur des fenêtres et de l'armoire) à `+2.7` (côté ouvert, vers la caméra). |

Pour régler une zone à l'œil, ajouter `?debug` à l'adresse
(http://localhost:5173/?debug) : toutes les boîtes s'affichent en turquoise.
Modifier les nombres dans `config.ts`, la page se recharge.

À savoir :

- Les faces du modèle **entièrement contenues** dans la boîte s'éclairent au
  survol. Une boîte trop large éclaire aussi le voisin ; trop petite, elle
  n'éclaire qu'un morceau de l'objet.
- Si deux zones se chevauchent, la plus petite gagne (un objet posé sur un
  meuble reste cliquable).
- Un objet caché derrière un autre n'est pas cliquable : c'est le premier
  point touché par le clic qui compte.
- L'**ordre** des entrées `shop` dans le tableau est l'ordre des flèches en
  bas du panneau.
- `#panier` ouvre le panier : ne pas utiliser `panier` comme `id`.
- Les tests (`tests/unit/config.test.ts`) refusent une zone à l'envers, hors
  de la chambre, un `id` en double ou un rayon absent du catalogue de démo.

### Ajouter un easter egg

1. Ouvrir la page avec `?debug` et repérer l'objet.
2. Ajouter une entrée **sans `label`** avec sa `zone` et une action `text` ou
   `video`.

## 2. Produits et catégories

Les produits se gèrent dans le **back-office PrestaShop**
(http://localhost:8080/admin-dev), pas dans le code : nom, prix, image, stock.
La photo d'un produit devient sa « pochette » dans le panneau ; sans photo, une
pochette de couleur est dessinée.

Le lien entre une catégorie et un objet de la chambre est le **slug** de la
catégorie (champ « URL simplifiée » dans sa fiche), repris dans `config.ts`.
Seules les catégories actives placées directement sous « Accueil » sont
exposées au front.

Pour ajouter un rayon :

1. Créer la catégorie sous « Accueil » dans le back-office, noter son slug.
2. Y ranger des produits.
3. Ajouter dans `config.ts` une entrée `shop` avec ce slug et une zone.
4. Ajouter le même slug dans `demoCatalog` (`frontend/src/shop.ts`), sinon le
   test de cohérence échoue et la démo affiche un rayon vide.
5. Facultatif : choisir l'icône de sa pochette dans `CATEGORY_ICONS`
   (`frontend/src/main.ts`).

Deux jeux de produits fictifs existent, à tenir à jour ensemble si on veut que
la démo ressemble à la boutique :

| Où | Sert à |
| --- | --- |
| `demoCatalog` dans `frontend/src/shop.ts` | La démo GitHub Pages et le front seul (port 5173). |
| `installDemoCatalog()` dans `prestashop/modules/slimroom/slimroom.php` | Les catégories et produits créés à l'installation du module, pour avoir une boutique utilisable tout de suite. Ne s'exécute qu'à l'installation ; une catégorie déjà existante du même nom n'est pas recréée. |

## 3. Textes, menu et nom affiché

Tout est dans `frontend/src/main.ts`, sauf mention contraire.

| Élément | Où |
| --- | --- |
| Logo « SLIM » de la barre | `brand` |
| Menu (Accueil, Actus, Merch) et ce que fait chaque bouton | `navHome`, `navNews`, `navMerch` et la section « Événements » |
| Bouton panier | `cartButton`, `updateBadge` |
| Nom sur l'écran de chargement | `loader` |
| Indication « Clique sur les objets… » | `hint` |
| Petite ligne au-dessus des titres (« Playlist merch », « Ta sélection », « Easter egg ») | `overline` dans `showShop`, `renderCart`, `select` |
| Lignes d'articles d'un rayon | `productRow` |
| Lignes du panier, boutons − / + | `cartRow`, `renderCart` |
| Notification « Ajouté au panier » | `showToast` |
| Texte « Actus » et textes des easter eggs | `frontend/src/config.ts`, `interactables` |
| Titre de l'onglet du navigateur | `frontend/index.html` (démo) ; nom de la boutique dans le back-office (PrestaShop) |

« Actus » ouvre l'objet d'`id` `computer` et « Merch » le premier rayon du
tableau `interactables`.

Les icônes sont des tracés SVG rangés dans `ICON_PATHS`. Pour en ajouter une :
une ligne dans cet objet (tracé dessiné dans un carré de 24 × 24), puis
`icon('son-nom')`.

Règle à garder : tout texte venant de la boutique (nom de produit, de
catégorie…) passe par l'utilitaire `h()`, jamais par `innerHTML`. C'est ce qui
empêche un nom de produit piégé d'exécuter du code ; un test le vérifie
(`tests/e2e/prestashop.spec.ts`).

## 4. Couleurs, fond et mise en page

Fichier : `frontend/src/style.css`. La direction artistique est celle d'une
appli de streaming, de nuit : surfaces sombres translucides, un seul accent
orange repris des fenêtres de la chambre.

| Élément | Où |
| --- | --- |
| Palette (fond, surfaces, cartes, texte, accent) | Variables `--bg`, `--surface`, `--card`, `--text`, `--muted`, `--accent`… dans `:root`, tout en haut |
| Dégradé du fond de page | Règle `html, body`, propriété `background` |
| Largeur du panneau sur ordinateur | Variable `--panel` |
| Hauteur réservée à la barre du haut | Variable `--topbar` |
| Arrondi des cartes | Variable `--radius` |
| Barre du haut (logo, menu, panier) | `.topbar`, `.brand`, `.topbar nav`, `.cart-button` |
| Bulles au-dessus des objets | `.label` |
| En-tête du panneau (pochette, titre) | `.panel-head`, `.overline`, `.cover.large` |
| Carte d'un article | `.track`, `.cover`, `.round`, `.stepper` |
| Pied du panneau (changement de rayon, total) | `.panel-nav`, `.dots`, `.panel-total` |
| Notification | `.toast` |
| Écran de chargement et barres animées | `.loader`, `.bars` |
| Passage en mode téléphone (panneau en bas) | Bloc `@media (max-width: 760px)`, tout en bas |

Les pochettes sans photo prennent une teinte calculée à partir du numéro de
l'article (fonction `cover` dans `main.ts`, règle `.cover` dans le CSS).

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
| Déroulé de l'arrivée (descente, rotation, allumage) | Fonction `playIntro` |
| Hauteur de départ de la chambre | Constante `INTRO_HEIGHT` |
| Obscurité de la chambre au départ | Constante `INTRO_DARK` |
| Halo sous la chambre, couleur et taille des poussières | Fonction `buildAmbiance` |
| Ce qu'affiche l'écran de l'ordinateur | `createScreen` dans `frontend/src/room.ts` |

Dans `playIntro`, `t` va de 0 à 1 sur la durée de l'animation : la chambre
descend en tournant pendant les premiers 75 %, et sa lumière monte à partir de
35 %. L'animation est sautée automatiquement pour les personnes qui ont
activé « réduire les animations » sur leur appareil ; garder ce comportement
(les tests s'en servent aussi pour ne pas attendre).

## 6. Caméra et surbrillance

Fichier : `frontend/src/view.ts`, constantes en haut du fichier.

| Réglage | Effet |
| --- | --- |
| `FOV` | Angle de champ. Plus grand = perspective plus marquée. |
| `HOME_TARGET` | Point regardé par la caméra au repos. |
| `HOME_AZIMUTH`, `HOME_POLAR` | Angle de vue au repos (autour de la chambre, hauteur). |
| `FIT` | Place que prend la chambre à l'écran, sur ordinateur et en portrait (plus petit = chambre plus grande). |
| `FOCUS_RATIO` | Rapprochement quand un objet est sélectionné (plus petit = plus près). |
| `HIGHLIGHT_OPACITY` | Force de la surbrillance d'un objet survolé. Sa couleur est dans `createRoomView` (`glow`). |
| `controls.min…` / `controls.max…` | Jusqu'où l'utilisateur peut tourner et zoomer. |
| Glissement de la chambre quand le panneau s'ouvre | Dans `frame()`, le `0.12` de « La vue glisse… » (plus grand = plus rapide). La place du panneau est mesurée par `syncInset` dans `main.ts`. |

Il n'y a **aucune lumière** dans la scène : les ombres et les lumières sont
peintes dans les textures (section 7). Pour changer l'éclairage, il faut
refaire le rendu des textures dans Blender.

## 7. La chambre : modèle Blender et textures

Ce que le site charge (`frontend/src/assets/`) :

| Fichier | Contenu | Vient de |
| --- | --- | --- |
| `room.glb` | Le modèle 3D, sans textures (130 Ko). | `Ressources/bundle_001/models/room_assemble_no-textures_001.glb` |
| `room-base.png` | Texture de toute la chambre, lumières comprises. | `Ressources/bundle_001/textures/room_baseColor.png` |
| `posters-base.jpg` | Planche des petits posters du mur. | `Ressources/bundle_001/textures/posters_baseColor_002.png`, converti en JPEG |

Les fichiers sources (`.blend`, textures d'origine) sont dans
`Ressources/bundle_001/`. `room_assemble_v2.blend` est la scène d'assemblage, à
utiliser pour exporter ; `room_v_12.blend` est le fichier de travail aux objets
séparés, sans les textures pré-éclairées.

Le code qui assemble le tout : `frontend/src/room.ts`. Il associe une texture à
chaque **matériau** du modèle, d'après son nom dans Blender :

| Matériau Blender | Texture appliquée |
| --- | --- |
| `room_mat` | `room-base.png` |
| `posters_mat` | `posters-base.jpg` |
| `main_posters_mat` | Un morceau de `posters-base.jpg`, choisi dans `config.ts` (voir plus bas) |
| `screen_mat` | Une image animée dessinée par le code (`createScreen`) |

### Mettre à jour la chambre

1. Exporter depuis Blender en glTF binaire (`.glb`), **sans** les textures, en
   gardant les noms de matériaux ci-dessus.
2. Remplacer `frontend/src/assets/room.glb` et les textures qui ont changé.
3. Convertir la planche des posters en JPEG pour l'alléger (6,5 Mo → 1,5 Mo).
   Sur Mac :
   ```sh
   sips -s format jpeg -s formatOptions 85 posters_baseColor_002.png --out frontend/src/assets/posters-base.jpg
   ```
4. Ouvrir http://localhost:5173/?debug et vérifier que les zones entourent
   toujours leurs objets (section 1). Si un meuble a bougé, ajuster sa zone.
5. Si la taille de la pièce a changé : ajuster `FIT` et `HOME_TARGET`
   (section 6), et `ROOM` dans `frontend/tests/unit/config.test.ts`.

Un matériau dont le nom n'est pas dans le tableau reste sans texture et un
avertissement apparaît dans la console du navigateur : ajouter une ligne à
`maps` dans `room.ts`.

### Les deux grands posters

Leur image définitive n'est pas encore livrée. En attendant, chacun affiche un
morceau de la planche des petits posters, choisi dans `config.ts`
(`mainPosters`, valeurs `crop` = gauche, haut, droite, bas, entre 0 et 1).

Quand la vraie texture arrivera : l'ajouter dans `src/assets/`, la charger dans
`loadRoom` comme les deux autres, l'associer à `main_posters_mat` dans `maps`,
et supprimer `remapMainPosters` ainsi que `mainPosters`.

### L'écran de l'ordinateur

`createScreen` (dans `room.ts`) dessine un petit lecteur audio animé. Pour y
mettre une image fixe : charger la texture comme les autres et l'associer à
`screen_mat`. `Ressources/bundle_001/textures/uv_checker_1024.png` est une
mire de test, pratique pour vérifier l'orientation.

### Poids

Viser quelques Mo au total : tout est téléchargé avant que la chambre
n'apparaisse. Aujourd'hui : environ 2 Mo d'images et 0,6 Mo de code.

## 8. Nouveau type de panneau

Exemple : une galerie de photos.

1. `frontend/src/config.ts` : ajouter la forme au type `Action`, par exemple
   `| { type: 'gallery'; title: string; images: string[] }`.
2. `frontend/src/main.ts`, fonction `select` : ajouter le cas correspondant et
   construire le contenu avec
   `openPanel({ overline, title, art, body: [éléments] })`.
3. `frontend/src/style.css` : styles du nouveau contenu.
4. `frontend/tests/e2e/room.spec.ts` : un test qui ouvre ce panneau.

TypeScript signale à la compilation les endroits qui ne gèrent pas le nouveau
type.

## 9. Données venant de PrestaShop

Le front ne parle à la boutique que par `frontend/src/shop.ts` (interface
`Shop`). Pour afficher une information de plus sur un produit (description,
stock…) :

1. `prestashop/modules/slimroom/controllers/front/api.php` : ajouter le champ
   dans `categories()` (et dans `cart()` s'il doit apparaître dans le panier).
2. `frontend/src/shop.ts` : l'ajouter à l'interface `Product` (ou `CartItem`)
   et aux produits fictifs de `demoCatalog`.
3. `frontend/src/main.ts`, `productRow` (ou `cartRow`) : l'afficher.
4. `tests/integration/smoke.py` : ajouter le champ à la liste vérifiée.

Les changements de panier (ajout, quantité, suppression) n'ont **aucun code
côté module** : le front envoie les mêmes requêtes que les boutons du thème
PrestaShop (fonction `change` dans `shop.ts`). L'API du module ne fait que
lire.

Si le module doit réagir à un nouvel événement PrestaShop (un « hook »), il
faut l'enregistrer dans `install()` de `slimroom.php` puis réinstaller le
module :

```sh
docker compose exec -u www-data prestashop php bin/console prestashop:module reset slimroom
```

### Charger quelque chose depuis un autre site

La page de la chambre est servie avec une politique de sécurité (en-tête
`Content-Security-Policy`, dans `slimroom.php`) qui n'autorise que le site
lui-même et les vidéos YouTube. Pour intégrer un autre service (lecteur audio,
police de caractères, statistiques…), ajouter son domaine à la bonne ligne de
cette liste, sinon le navigateur le bloquera en silence (message dans la
console). Mettre à jour `tests/integration/smoke.py` si besoin.

## 10. Versions et dépendances

| Quoi | Où |
| --- | --- |
| Version de PrestaShop | Ligne `FROM prestashop/prestashop:…` du `Dockerfile` |
| Version de MySQL | `docker-compose.yml`, service `db` |
| Version de Node | `Dockerfile`, `docker-compose.yml` et les workflows de `.github/workflows/` |
| three.js, Vite, TypeScript, outils de test | `frontend/package.json`, puis régénérer `package-lock.json` avec `docker compose run --rm frontend-build npm install` |
| Version de Playwright | `frontend/package.json` ; l'image Docker utilisée pour lancer les tests en local doit porter le même numéro ([tests-et-ci.md](tests-et-ci.md)) |
| Actions GitHub et outils de sécurité | `.github/workflows/*.yml`, épinglés sur un commit ou une empreinte |

Dependabot (`.github/dependabot.yml`) ouvre chaque semaine des pull requests
de mise à jour pour npm, les actions GitHub et les images Docker. La CI les
teste ; il reste à les relire et à les fusionner.

Le `Dockerfile` contient un correctif pour un défaut de l'image PrestaShop
9.2.1 (expliqué en commentaire). Lors d'un changement de version, la
construction de l'image échoue volontairement si la ligne corrigée n'existe
plus : vérifier alors si le correctif est encore nécessaire et le retirer.

## 11. En cas de problème

| Symptôme | Piste |
| --- | --- |
| Page blanche sur http://localhost:8080 | Le front n'est pas compilé : `docker compose run --rm frontend-build`. |
| « La chambre en 3D n'a pas pu s'afficher » | Le navigateur n'a pas de 3D (WebGL), ou un fichier de `src/assets/` manque : l'erreur précise est dans la console. Le menu reste utilisable. |
| L'image clignote quand un panneau s'ouvre ou se ferme | Quelque chose redimensionne la zone 3D (`.stage` dans le CSS). Elle doit garder la taille de l'écran : voir `setInset` dans `view.ts`. |
| Un objet ne réagit pas au clic | Ouvrir avec `?debug` : sa zone ne l'entoure plus, ou un autre meuble passe devant lui. |
| La mauvaise chose s'éclaire au survol | Zone trop large : elle englobe les faces du voisin. |
| La boutique locale affiche les produits fictifs | La page ne reçoit pas sa configuration : vérifier que le code source de la page contient `data-slimroom="…"`. |
| Un contenu externe ne s'affiche pas | Bloqué par la politique de sécurité : voir la fin de la section 9. |
| « La boutique ne répond pas » dans le panneau | Ouvrir http://localhost:8080/module/slimroom/api : la réponse ou l'erreur PHP s'y lit directement. |
| Un rayon est vide | Vérifier que le slug de `config.ts` est bien celui de la catégorie, qu'elle est active et directement sous « Accueil ». |
| L'installation semble bloquée | `docker compose logs -f prestashop` ; la première installation prend quelques minutes. |
| Un job de la CI est rouge | [tests-et-ci.md](tests-et-ci.md), section « Quand un job est rouge ». |
| Tout est cassé | `docker compose down -v` puis `docker compose up --build` repart d'une installation neuve (les produits saisis à la main sont perdus). |
