// Ferme la chambre pour la vue intérieure. Le modèle Blender n'a que deux murs
// et pas de plafond (il est fait pour être regardé du dehors) : on ajoute ici,
// en attendant les vrais, les deux murs manquants, le plafond et une porte.
// Leurs teintes sont relevées sur la texture de la chambre pour s'y accorder.

import * as THREE from 'three';

// Limites intérieures de la pièce, en mètres (voir le repère dans docs/guide-modifications.md).
const ROOM = { minX: -2.5, maxX: 2.5, minZ: -2.5, maxZ: 2.5, height: 3.0 };

type Rgb = [number, number, number];

/** Couleur moyenne d'un petit carré de l'image, à la position (u, v) entre 0 et 1. */
function sample(image: CanvasImageSource, u: number, v: number): Rgb {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width, height } = image as HTMLImageElement;
  ctx.drawImage(image, u * width - 4, v * height - 4, 8, 8, 0, 0, 8, 8);
  const data = ctx.getImageData(0, 0, 8, 8).data;
  const sum: Rgb = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
  return sum.map((value) => value / 64) as Rgb;
}

const css = (color: Rgb, factor = 1) =>
  `rgb(${color.map((value) => Math.round(Math.min(255, value * factor))).join(' ')})`;

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Mur peint : la teinte donnée, un peu plus sombre vers les angles, avec sa plinthe. */
function paintWall(ctx: CanvasRenderingContext2D, color: Rgb, plinth: Rgb) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = css(color);
  ctx.fillRect(0, 0, width, height);
  // Ombres douces dans les angles et sous le plafond, comme sur les murs d'origine.
  const sides = ctx.createLinearGradient(0, 0, width, 0);
  sides.addColorStop(0, 'rgb(60 20 10 / 0.3)');
  sides.addColorStop(0.18, 'rgb(60 20 10 / 0)');
  sides.addColorStop(0.82, 'rgb(60 20 10 / 0)');
  sides.addColorStop(1, 'rgb(60 20 10 / 0.3)');
  ctx.fillStyle = sides;
  ctx.fillRect(0, 0, width, height);
  const vertical = ctx.createLinearGradient(0, 0, 0, height);
  vertical.addColorStop(0, 'rgb(60 20 10 / 0.26)');
  vertical.addColorStop(0.2, 'rgb(60 20 10 / 0)');
  vertical.addColorStop(0.8, 'rgb(60 20 10 / 0)');
  vertical.addColorStop(1, 'rgb(60 20 10 / 0.3)');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, width, height);
  const plinthHeight = height * 0.045;
  ctx.fillStyle = css(plinth);
  ctx.fillRect(0, height - plinthHeight, width, plinthHeight);
  ctx.fillStyle = 'rgb(60 20 10 / 0.25)';
  ctx.fillRect(0, height - plinthHeight - 3, width, 3);
}

/** Porte à panneaux, dessinée sur le mur. (x, largeur) en pixels ; elle descend jusqu'à la plinthe. */
function paintDoor(ctx: CanvasRenderingContext2D, x: number, doorWidth: number, frame: Rgb) {
  const { height } = ctx.canvas;
  const top = height * 0.3;
  const bottom = height * 0.985;
  ctx.fillStyle = css(frame, 0.82);
  ctx.fillRect(x - 14, top - 14, doorWidth + 28, bottom - top + 14);
  ctx.fillStyle = css(frame);
  ctx.fillRect(x, top, doorWidth, bottom - top);
  ctx.strokeStyle = 'rgb(90 50 30 / 0.35)';
  ctx.lineWidth = 5;
  const inset = doorWidth * 0.13;
  const middle = top + (bottom - top) * 0.48;
  ctx.strokeRect(x + inset, top + inset, doorWidth - inset * 2, middle - top - inset * 1.4);
  ctx.strokeRect(x + inset, middle + inset * 0.4, doorWidth - inset * 2, bottom - middle - inset * 1.4);
  // Poignée
  ctx.fillStyle = '#6d6257';
  ctx.beginPath();
  ctx.arc(x + doorWidth * 0.86, middle + 6, 11, 0, Math.PI * 2);
  ctx.fill();
  // Petit mot sur la porte : d'autres pièces sont prévues.
  ctx.fillStyle = '#fff7e8';
  ctx.fillRect(x + doorWidth * 0.3, top + (middle - top) * 0.42, doorWidth * 0.4, 58);
  ctx.fillStyle = '#3a2a22';
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BIENTÔT', x + doorWidth / 2, top + (middle - top) * 0.42 + 37);
}

/** Affiche encadrée, pour habiller le mur du bureau. */
function paintFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgb(60 20 10 / 0.3)';
  ctx.fillRect(x + 6, y + 8, w, h);
  ctx.fillStyle = '#2a2233';
  ctx.fillRect(x, y, w, h);
  const art = ctx.createLinearGradient(x, y, x + w, y + h);
  art.addColorStop(0, '#ff9d3c');
  art.addColorStop(1, '#7b2d6b');
  ctx.fillStyle = art;
  ctx.fillRect(x + 12, y + 12, w - 24, h - 24);
  ctx.fillStyle = '#fff3df';
  ctx.font = `900 ${Math.round(w * 0.24)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SLIM', x + w / 2, y + h / 2);
  ctx.textBaseline = 'alphabetic';
}

export interface Enclosure {
  object: THREE.Group;
  /** Le plafonnier : contrairement aux murs, il se verrait du dehors pendant l'arrivée. */
  lamp: THREE.Object3D;
  /** Matériaux à assombrir / éclairer avec le reste de la chambre pendant l'arrivée. */
  materials: THREE.MeshBasicMaterial[];
}

export function createEnclosure(roomTexture: THREE.Texture): Enclosure {
  const image = roomTexture.image as HTMLImageElement;
  // Relevés sur la texture d'origine : le mur clair (côté fenêtres) et le mur plus sombre (côté posters).
  const light = sample(image, 0.09, 0.8);
  const dark = sample(image, 0.58, 0.82);
  const plinth = sample(image, 0.04, 0.965);
  const cream: Rgb = [236, 222, 200];

  const width = ROOM.maxX - ROOM.minX;
  const depth = ROOM.maxZ - ROOM.minZ;
  const centerX = (ROOM.minX + ROOM.maxX) / 2;
  const centerZ = (ROOM.minZ + ROOM.maxZ) / 2;
  const object = new THREE.Group();
  object.name = 'enclosure';
  const materials: THREE.MeshBasicMaterial[] = [];

  // Les faces ne sont visibles que de l'intérieur.
  const surface = (w: number, h: number, map: THREE.Texture) => {
    const material = new THREE.MeshBasicMaterial({ map });
    materials.push(material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    object.add(mesh);
    return mesh;
  };

  // Mur du bureau (côté x négatif), tourné vers l'intérieur.
  const deskWall = surface(depth, ROOM.height, canvasTexture(1536, 920, (ctx) => {
    paintWall(ctx, light.map((value, i) => value * 0.8 + dark[i] * 0.2) as Rgb, plinth);
    paintFrame(ctx, 1010, 150, 230, 300);
  }));
  deskWall.position.set(ROOM.minX, ROOM.height / 2, centerZ);
  deskWall.rotation.y = Math.PI / 2;

  // Mur de la porte (côté z positif).
  const doorWall = surface(width, ROOM.height, canvasTexture(1536, 920, (ctx) => {
    paintWall(ctx, light, plinth);
    paintDoor(ctx, 620, 270, cream);
  }));
  doorWall.position.set(centerX, ROOM.height / 2, ROOM.maxZ);
  doorWall.rotation.y = Math.PI;

  const ceiling = surface(width, depth, canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = css(light, 1.04);
    ctx.fillRect(0, 0, 512, 512);
    const edges = ctx.createRadialGradient(256, 256, 120, 256, 256, 380);
    edges.addColorStop(0, 'rgb(60 20 10 / 0)');
    edges.addColorStop(1, 'rgb(60 20 10 / 0.3)');
    ctx.fillStyle = edges;
    ctx.fillRect(0, 0, 512, 512);
  }));
  ceiling.position.set(centerX, ROOM.height, centerZ);
  ceiling.rotation.x = Math.PI / 2;

  // Plafonnier.
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xffe6bd });
  materials.push(lampMaterial);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lampMaterial);
  lamp.position.set(centerX, ROOM.height - 0.02, centerZ);
  object.add(lamp);

  return { object, lamp, materials };
}
