// Vérifie que config.ts reste cohérent : c'est le fichier que tout le monde modifie.
import { describe, expect, it } from 'vitest';
import { ambiance, character, insideView, interactables, mainPosters } from '../../src/config';
import { demoCatalog } from '../../src/shop';
import { standPoint, zoneContains, zoneIsValid } from '../../src/zones';

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

describe('bonhomme', () => {
  const { walkArea, start } = character;

  it('a une zone de marche à l’endroit, dans la chambre, et y démarre', () => {
    walkArea.min.forEach((value, axis) => expect(value).toBeLessThan(walkArea.max[axis]));
    expect(walkArea.min[0]).toBeGreaterThanOrEqual(ROOM.min[0]);
    expect(walkArea.max[0]).toBeLessThanOrEqual(ROOM.max[0]);
    expect(walkArea.min[1]).toBeGreaterThanOrEqual(ROOM.min[2]);
    expect(walkArea.max[1]).toBeLessThanOrEqual(ROOM.max[2]);
    start.forEach((value, axis) => {
      expect(value).toBeGreaterThanOrEqual(walkArea.min[axis]);
      expect(value).toBeLessThanOrEqual(walkArea.max[axis]);
    });
  });

  it('a une taille et une vitesse raisonnables', () => {
    expect(character.height).toBeGreaterThan(0.3);
    expect(character.height).toBeLessThan(2);
    expect(character.speed).toBeGreaterThan(0);
  });

  it.each(interactables)('$id : ne s’arrête pas à l’intérieur de l’objet', ({ zone }) => {
    // S'il s'arrêtait dans la zone d'un meuble, il le traverserait.
    const [x, z] = standPoint(zone, walkArea);
    expect(zoneContains(zone, { x, y: 0.3, z })).toBe(false);
  });
});

describe('vue intérieure', () => {
  const inRoom = ([x, y, z]: [number, number, number]) => {
    expect(Math.abs(x)).toBeLessThan(2.5);
    expect(Math.abs(z)).toBeLessThan(2.5);
    expect(y).toBeGreaterThan(0.5);
    expect(y).toBeLessThan(2.5);
  };

  it('place le visiteur dans la pièce, à hauteur d’yeux', () => {
    inRoom(insideView.eye);
    expect(insideView.eye[1]).toBeGreaterThan(1.2);
    expect(insideView.eye[1]).toBeLessThan(1.9);
    expect(insideView.lookAt).not.toEqual(insideView.eye);
  });

  it('a des angles raisonnables', () => {
    for (const fov of [insideView.fov, insideView.fovPortrait]) {
      expect(fov).toBeGreaterThanOrEqual(40);
      expect(fov).toBeLessThanOrEqual(95);
    }
    expect(insideView.maxTurn).toBeGreaterThan(0);
    expect(insideView.maxTurn).toBeLessThanOrEqual(Math.PI);
    expect(insideView.maxTilt).toBeLessThan(Math.PI / 2);
  });

  it('fait attendre le bonhomme dans sa zone de marche', () => {
    insideView.characterStart.forEach((value, axis) => {
      expect(value).toBeGreaterThanOrEqual(character.walkArea.min[axis]);
      expect(value).toBeLessThanOrEqual(character.walkArea.max[axis]);
    });
  });

  it('les points de vue imposés sont dans la pièce', () => {
    for (const item of interactables) if (item.viewFrom) inRoom(item.viewFrom);
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
