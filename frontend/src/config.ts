// Configuration des objets cliquables de la chambre.
// Pour ajouter un objet : donner à `id` le nom de l'objet 3D (nom du groupe
// dans room.ts, ou nom du nœud dans le fichier .glb) et choisir une action.

export type Action =
  | { type: 'shop'; category: string } // slug de la catégorie PrestaShop
  | { type: 'text'; title: string; body: string }
  | { type: 'video'; title: string; youtubeId: string; body?: string };

export interface Interactable {
  id: string;
  /** Texte de la bulle affichée au-dessus de l'objet. Absent = easter egg (pas de bulle). */
  label?: string;
  action: Action;
}

/**
 * Modèle .glb qui remplace la chambre provisoire. Pour l'activer : placer le
 * fichier dans src/assets/, puis
 *   import model from './assets/room.glb?url';
 *   export const roomModel: string | null = model;
 * Les nœuds du modèle doivent porter les `id` ci-dessous.
 */
export const roomModel: string | null = null;

export const interactables: Interactable[] = [
  { id: 'cd-stack', label: 'CDs', action: { type: 'shop', category: 'cds' } },
  { id: 'wardrobe', label: 'Vêtements', action: { type: 'shop', category: 'vetements' } },
  { id: 'posters', label: 'Posters', action: { type: 'shop', category: 'posters' } },
  {
    id: 'computer',
    label: 'Actus',
    action: {
      type: 'text',
      title: 'Actus',
      body: "Ici, les dernières nouvelles : dates de concert, sorties, coulisses…\n\nCe texte est un exemple, il sera remplacé par le vrai contenu.",
    },
  },
  // Easter eggs : pas de bulle, il faut les trouver.
  {
    id: 'keyboard',
    action: {
      type: 'video',
      title: 'Tu as trouvé le clavier',
      youtubeId: 'dQw4w9WgXcQ', // à remplacer par la vraie vidéo
      body: 'Un petit bonus caché.',
    },
  },
  {
    id: 'lamp',
    action: {
      type: 'text',
      title: 'Psst…',
      body: "Bien vu. Il y a d'autres secrets cachés dans la chambre.",
    },
  },
];

/** Ambiance et animation d'arrivée de la scène. */
export const ambiance = {
  /** Jouer l'animation d'arrivée (la chambre descend en tournant). */
  intro: true,
  /** Durée de cette animation, en secondes. */
  introDuration: 2.8,
  /** Nombre de poussières lumineuses autour de la chambre (0 pour les retirer). */
  particles: 260,
};
