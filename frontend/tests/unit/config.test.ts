// Vérifie que config.ts reste cohérent : c'est le fichier que tout le monde modifie.
import { describe, expect, it } from 'vitest';
import { ambiance, interactables, mainPosters } from '../../src/config';
import { demoCatalog } from '../../src/shop';
import { zoneIsValid } from '../../src/zones';

// Dimensions de la chambre (mètres), avec un peu de marge.
const ROOM = { min: [-2.8, -0.2, -2.8], max: [2.8, 3.2, 2.8] };

describe('objets cliquables', () => {
  it('ont des identifiants uniques, utilisables dans une adresse', () => {
    const ids = interactables.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(ids).not.toContain('panier'); // réservé au lien direct vers le panier
  });

  it.each(interactables)('$id : zone valide et dans la chambre', ({ zone }) => {
    expect(zoneIsValid(zone)).toBe(true);
    zone.min.forEach((value, axis) => expect(value).toBeGreaterThanOrEqual(ROOM.min[axis]));
    zone.max.forEach((value, axis) => expect(value).toBeLessThanOrEqual(ROOM.max[axis]));
  });

  it('chaque rayon existe dans le catalogue de démonstration', () => {
    const slugs = demoCatalog.map((category) => category.slug);
    for (const { action } of interactables) {
      if (action.type === 'shop') expect(slugs).toContain(action.category);
    }
  });

  it('les vidéos ont un identifiant YouTube bien formé', () => {
    for (const { action } of interactables) {
      if (action.type === 'video') expect(action.youtubeId).toMatch(/^[\w-]{11}$/);
    }
  });

  it('les textes et titres ne sont pas vides', () => {
    for (const { action, label } of interactables) {
      if (label !== undefined) expect(label.trim()).not.toBe('');
      if (action.type !== 'shop') expect(action.title.trim()).not.toBe('');
    }
  });

  it('le menu « Actus » a bien sa cible', () => {
    expect(interactables.some((item) => item.id === 'computer')).toBe(true);
  });
});

describe('décor', () => {
  it('les grands posters découpent une partie réelle de l’image', () => {
    for (const { crop } of mainPosters) {
      const [left, top, right, bottom] = crop;
      for (const value of crop) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(left).toBeLessThan(right);
      expect(top).toBeLessThan(bottom);
    }
  });

  it('les réglages d’ambiance sont raisonnables', () => {
    expect(ambiance.introDuration).toBeGreaterThan(0);
    expect(ambiance.introDuration).toBeLessThanOrEqual(8);
    expect(ambiance.particles).toBeGreaterThanOrEqual(0);
    expect(ambiance.particles).toBeLessThanOrEqual(2000); // au-delà, les téléphones peinent
  });
});
