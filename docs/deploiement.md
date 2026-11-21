# Déploiement

## Démo publique : GitHub Pages

But : montrer le rendu à tout le monde, sur téléphone et ordinateur, sans
hébergement.

- Workflow : `.github/workflows/pages.yml`.
- Adresse : https://khalilstout.github.io/Slim-website/ (vue d'ensemble) et
  https://khalilstout.github.io/Slim-website/dedans.html (vue intérieure)
- Déclenchement : chaque push sur `main` qui touche `frontend/`, ou à la main
  depuis l'onglet « Actions » du dépôt (« Run workflow »).
- Garde-fou : le workflow relance lint, types et tests unitaires avant de
  publier ; s'ils échouent, la démo en ligne reste l'ancienne.
- Contenu : le front seul, avec les produits fictifs de `frontend/src/shop.ts`
  et un panier gardé dans le navigateur. **Pas de PrestaShop, donc pas de
  paiement** : GitHub Pages ne sert que des fichiers statiques.

Mise en route, une seule fois : dans les réglages du dépôt, « Pages » →
« Source » → « GitHub Actions ». L'adresse de la démo s'affiche ensuite dans
le résultat du workflow.

Si un run échoue, en lancer un nouveau (« Run workflow ») plutôt que
« Re-run all jobs » : un second passage dans le même run échoue sur un doublon
de fichier.

## Vraie boutique dans le cloud : à faire

Le choix du fournisseur n'est pas arrêté. Ce qui est prêt : le `Dockerfile`
produit une image complète (PrestaShop + module + front), configurée par
variables d'environnement.

Ce dont PrestaShop a besoin, quel que soit le fournisseur :

| Besoin | Pourquoi |
| --- | --- |
| Un service de conteneurs managé | Pour faire tourner l'image sans gérer de machine. |
| Une base MySQL managée | Catalogue, commandes, clients. |
| Un stockage de fichiers persistant | PrestaShop écrit sur disque (images produits, modules, cache). Sans lui, tout ce qui est envoyé depuis le back-office disparaît au redémarrage. C'est la contrainte qui écarte les offres purement « serverless ». |
| Un nom de domaine en HTTPS | Obligatoire pour le paiement. |

Ce qu'il restera à écrire :

1. Un workflow GitHub Actions qui construit l'image, la pousse dans un
   registre et déclenche le déploiement. Le faire dépendre de la CI
   (`ci.yml`) : le job « Intégration » construit et teste déjà cette image.
2. Les secrets (mot de passe de la base, compte administrateur) dans le
   gestionnaire de secrets du fournisseur ou de GitHub. Les valeurs de
   `docker-compose.yml` ne valent que pour le développement local.
3. Les réglages de production : `PS_DEV_MODE: 0`, `PS_ENABLE_SSL: 1`,
   `PS_DOMAIN` au vrai domaine, un nom de dossier d'administration non
   devinable (`PS_FOLDER_ADMIN`).
4. Le vrai prestataire de paiement, à installer et configurer comme module
   PrestaShop.
5. Les sauvegardes de la base et du stockage de fichiers.
6. La politique de sécurité de la page (`Content-Security-Policy` dans
   `slimroom.php`) : y ajouter les domaines du prestataire de paiement ou de
   tout service externe ajouté d'ici là.
7. Regarder le rapport « Trivy · image » du workflow de sécurité et monter la
   version de l'image PrestaShop si des failles critiques y sont corrigées.
8. Ajouter l'adresse de production au test d'intégration
   (`python3 tests/integration/smoke.py https://…`) : il ne crée ni compte ni
   commande, seulement un panier de visiteur anonyme qu'il vide.

Variables d'environnement lues par l'image (voir `docker-compose.yml` pour un
exemple complet) : `DB_SERVER`, `DB_USER`, `DB_PASSWD`, `DB_NAME`, `PS_DOMAIN`,
`PS_INSTALL_AUTO`, `PS_LANGUAGE`, `PS_COUNTRY`, `PS_DEV_MODE`,
`PS_ENABLE_SSL`, `PS_FOLDER_ADMIN`, `ADMIN_MAIL`, `ADMIN_PASSWD`.
