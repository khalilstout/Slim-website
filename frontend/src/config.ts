// Le contenu de la chambre : objets cliquables, posters affichés, ambiance.
// C'est le fichier qu'on modifie le plus. Voir docs/guide-modifications.md.

import type { Zone } from './zones';

export type Action =
  | { type: 'shop'; category: string } // slug de la catégorie PrestaShop
  | { type: 'text'; title: string; body: string }
  | { type: 'video'; title: string; youtubeId: string; body?: string };

export interface Interactable {
  /** Identifiant unique. Sert aussi de lien direct : https://…/#cd-stack */
  id: string;
  /** Texte de la bulle affichée au-dessus de l'objet. Absent = easter egg (pas de bulle). */
  label?: string;
  /**
   * Boîte qui entoure l'objet dans la chambre (mètres ; x vers le mur des
   * posters, y vers le haut, z vers la caméra). Pour la régler à l'œil :
   * ouvrir la page avec `?debug` à la fin de l'adresse, les boîtes s'affichent.
   */
  zone: Zone;
  action: Action;
}

export const interactables: Interactable[] = [
  {
    id: 'cd-stack',
    label: 'CDs',
    zone: { min: [-1.78, 0, 1.62], max: [-0.95, 0.72, 2.47] },
    action: { type: 'shop', category: 'cds' },
  },
  {
    id: 'wardrobe',
    label: 'Vêtements',
    zone: { min: [1.15, 0, -2.5], max: [2.32, 2.62, -1.82] },
    action: { type: 'shop', category: 'vetements' },
  },
  {
    id: 'posters',
    label: 'Posters',
    zone: { min: [2.4, 1.0, -0.7], max: [2.56, 2.8, 1.22] },
    action: { type: 'shop', category: 'posters' },
  },
  {
    id: 'computer',
    label: 'Actus',
    zone: { min: [-2.56, 0.72, -0.65], max: [-1.38, 1.56, 1.14] },
    action: {
      type: 'text',
      title: 'Actus',
      body: "Ici, les dernières nouvelles : dates de concert, sorties, coulisses…\n\nCe texte est un exemple, il sera remplacé par le vrai contenu.",
    },
  },
  // Easter eggs : pas de bulle, il faut les trouver.
  {
    id: 'keyboard',
    zone: { min: [-2.52, 0, -2.32], max: [-1.33, 1.03, -0.82] },
    action: {
      type: 'video',
      title: 'Tu as trouvé le clavier',
      youtubeId: 'dQw4w9WgXcQ', // à remplacer par la vraie vidéo
      body: 'Un petit bonus caché.',
    },
  },
  {
    id: 'mic',
    zone: { min: [-2.26, 0, 1.04], max: [-1.45, 1.7, 1.9] },
    action: {
      type: 'text',
      title: 'Micro ouvert',
      body: "C'est ici que tout s'enregistre.\n\nCe texte est un exemple, il sera remplacé par le vrai contenu.",
    },
  },
  {
    id: 'lamp',
    zone: { min: [1.73, 0, -0.84], max: [2.37, 0.83, -0.2] },
    action: {
      type: 'text',
      title: 'Psst…',
      body: "Bien vu. Il y a d'autres secrets cachés dans la chambre.",
    },
  },
];

/**
 * Les deux grands posters du mur. Leur image définitive n'est pas encore
 * livrée : en attendant, chacun affiche un morceau de la planche des petits
 * posters (src/assets/posters-base.jpg). `crop` = [gauche, haut, droite, bas],
 * en fraction de l'image (0 = bord gauche / haut, 1 = bord droit / bas).
 * L'ordre suit celui du modèle : d'abord le poster du bas, puis celui du haut.
 */
export const mainPosters: { crop: [number, number, number, number] }[] = [
  { crop: [0.0, 0.0, 0.238, 0.335] },
  { crop: [0.716, 0.0, 0.952, 0.335] },
];

/** Ambiance et animation d'arrivée de la scène. */
export const ambiance = {
  /** Jouer l'animation d'arrivée (la chambre descend en tournant et s'allume). */
  intro: true,
  /** Durée de cette animation, en secondes. */
  introDuration: 3,
  /** Nombre de poussières lumineuses autour de la chambre (0 pour les retirer). */
  particles: 260,
};
