import { describe, expect, it } from 'vitest';
import { standPoint, zoneAt, zoneCenter, zoneContains, zoneIsValid, zoneVolume, type Zone } from '../../src/zones';

const box: Zone = { min: [0, 0, 0], max: [2, 1, 4] };

describe('zoneContains', () => {
  it('accepte un point à l’intérieur et sur le bord', () => {
    expect(zoneContains(box, { x: 1, y: 0.5, z: 2 })).toBe(true);
    expect(zoneContains(box, { x: 2, y: 1, z: 4 })).toBe(true);
  });

  it('refuse un point dehors, sur chacun des axes', () => {
    expect(zoneContains(box, { x: 2.1, y: 0.5, z: 2 })).toBe(false);
    expect(zoneContains(box, { x: 1, y: -0.1, z: 2 })).toBe(false);
    expect(zoneContains(box, { x: 1, y: 0.5, z: 4.1 })).toBe(false);
  });

  it('tolère un petit écart quand on donne une marge', () => {
    expect(zoneContains(box, { x: 2.04, y: 0.5, z: 2 }, 0.05)).toBe(true);
    expect(zoneContains(box, { x: 2.06, y: 0.5, z: 2 }, 0.05)).toBe(false);
  });
});

describe('mesures', () => {
  it('calcule le volume et le centre', () => {
    expect(zoneVolume(box)).toBe(8);
    expect(zoneCenter(box)).toEqual([1, 0.5, 2]);
  });

  it('repère une boîte à l’envers, plate ou non numérique', () => {
    expect(zoneIsValid(box)).toBe(true);
    expect(zoneIsValid({ min: [1, 0, 0], max: [0, 1, 1] })).toBe(false);
    expect(zoneIsValid({ min: [0, 0, 0], max: [1, 0, 1] })).toBe(false);
    expect(zoneIsValid({ min: [NaN, 0, 0], max: [1, 1, 1] })).toBe(false);
  });
});

describe('standPoint (où le bonhomme se place)', () => {
  const area = { min: [-1, -1] as [number, number], max: [1, 2] as [number, number] };

  it('reste sur place si l’objet est au-dessus de la zone de marche', () => {
    expect(standPoint({ min: [0, 0, 0], max: [0.4, 1, 1] }, area)).toEqual([0.2, 0.5]);
  });

  it('s’arrête au bord le plus proche d’un objet situé hors de la zone', () => {
    expect(standPoint({ min: [2, 0, 0], max: [3, 2, 1] }, area)).toEqual([1, 0.5]);
    expect(standPoint({ min: [-3, 0, -4], max: [-2, 1, -3] }, area)).toEqual([-1, -1]);
  });
});

describe('zoneAt', () => {
  const desk = { id: 'desk', zone: { min: [0, 0, 0], max: [2, 1, 2] } as Zone };
  const mug = { id: 'mug', zone: { min: [0.5, 0.8, 0.5], max: [0.7, 1, 0.7] } as Zone };

  it('rend null hors de toute zone', () => {
    expect(zoneAt([desk, mug], { x: 5, y: 5, z: 5 })).toBeNull();
  });

  it('rend la zone qui contient le point', () => {
    expect(zoneAt([desk, mug], { x: 1.5, y: 0.2, z: 1.5 })?.id).toBe('desk');
  });

  it('préfère la plus petite zone quand deux se chevauchent, quel que soit l’ordre', () => {
    const point = { x: 0.6, y: 0.9, z: 0.6 };
    expect(zoneAt([desk, mug], point)?.id).toBe('mug');
    expect(zoneAt([mug, desk], point)?.id).toBe('mug');
  });
});
