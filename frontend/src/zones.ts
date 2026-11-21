// Zones cliquables : des boîtes posées autour des objets de la chambre.
// Le modèle Blender est livré fusionné en une seule pièce (c'est ce qui permet
// la texture pré-éclairée) : on ne peut donc pas cliquer « un objet 3D », on
// regarde dans quelle boîte tombe le point cliqué.

export type Vec3 = [number, number, number];

export interface Zone {
  /** Coin bas de la boîte (x, y, z), en mètres, dans le repère de la chambre. */
  min: Vec3;
  /** Coin haut de la boîte. */
  max: Vec3;
}

export interface Point {
  x: number;
  y: number;
  z: number;
}

export function zoneContains(zone: Zone, point: Point, margin = 0): boolean {
  return (
    point.x >= zone.min[0] - margin &&
    point.x <= zone.max[0] + margin &&
    point.y >= zone.min[1] - margin &&
    point.y <= zone.max[1] + margin &&
    point.z >= zone.min[2] - margin &&
    point.z <= zone.max[2] + margin
  );
}

export function zoneVolume(zone: Zone): number {
  return (zone.max[0] - zone.min[0]) * (zone.max[1] - zone.min[1]) * (zone.max[2] - zone.min[2]);
}

export function zoneCenter(zone: Zone): Vec3 {
  return [
    (zone.min[0] + zone.max[0]) / 2,
    (zone.min[1] + zone.max[1]) / 2,
    (zone.min[2] + zone.max[2]) / 2,
  ];
}

/** Une zone est valide si chaque coordonnée de `min` est strictement sous celle de `max`. */
export function zoneIsValid(zone: Zone): boolean {
  return zone.min.every((value, axis) => Number.isFinite(value) && value < zone.max[axis]);
}

/** Rectangle du sol : [x mini, z mini] et [x maxi, z maxi]. */
export interface FloorArea {
  min: [number, number];
  max: [number, number];
}

/**
 * Où se placer, dans un rectangle de sol, pour être au plus près d'une zone :
 * le point du rectangle le plus proche du centre de la zone.
 */
export function standPoint(zone: Zone, area: FloorArea): [number, number] {
  const [x, , z] = zoneCenter(zone);
  return [
    Math.min(area.max[0], Math.max(area.min[0], x)),
    Math.min(area.max[1], Math.max(area.min[1], z)),
  ];
}

/**
 * L'élément dont la zone contient le point. Si plusieurs zones se chevauchent,
 * la plus petite gagne : un objet posé sur un meuble reste cliquable.
 */
export function zoneAt<T extends { zone: Zone }>(items: readonly T[], point: Point, margin = 0.03): T | null {
  let best: T | null = null;
  for (const item of items) {
    if (!zoneContains(item.zone, point, margin)) continue;
    if (!best || zoneVolume(item.zone) < zoneVolume(best.zone)) best = item;
  }
  return best;
}
