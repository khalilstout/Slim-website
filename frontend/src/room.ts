// Chambre provisoire construite à la main (formes arrondies + textures
// dessinées), en attendant le vrai modèle 3D. Chaque objet cliquable est un
// groupe nommé (voir config.ts).
// Repère : sol centré sur l'origine, mur gauche en x = -3, mur droit en z = -3.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

type Vec3 = [number, number, number];
type Draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

interface BoxOptions {
  emissive?: number;
  /** Rayon des arêtes ; 0 pour une boîte à angles vifs. */
  radius?: number;
  roughness?: number;
  shadow?: boolean;
}

/** Boîte posée sur `y` (bas de la boîte), centrée en x et z. */
function box(parent: THREE.Object3D, size: Vec3, pos: Vec3, color: number, options: BoxOptions = {}): THREE.Mesh {
  const smallest = Math.min(...size);
  const radius = Math.min(options.radius ?? 0.025, smallest * 0.45);
  const geometry =
    radius > 0.004 ? new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius) : new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, emissive: options.emissive ?? 0, roughness: options.roughness ?? 0.85 }),
  );
  mesh.position.set(pos[0], pos[1] + size[1] / 2, pos[2]);
  mesh.castShadow = options.shadow ?? true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent: THREE.Object3D, radius: number, height: number, pos: Vec3, color: number, emissive = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 28),
    new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.7 }),
  );
  mesh.position.set(pos[0], pos[1] + height / 2, pos[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function group(parent: THREE.Object3D, name: string, pos: Vec3 = [0, 0, 0]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...pos);
  parent.add(g);
  return g;
}

function texture(width: number, height: number, draw: Draw): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!, width, height);
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = THREE.SRGBColorSpace;
  result.anisotropy = 8;
  return result;
}

/** Surface plate texturée. `facing` : direction vers laquelle elle regarde. */
function panel(
  parent: THREE.Object3D,
  size: [number, number],
  center: Vec3,
  facing: 'x' | 'y' | 'z',
  map: THREE.Texture,
  emissive = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(...size),
    new THREE.MeshStandardMaterial({ map, roughness: 0.9, emissive, emissiveMap: emissive ? map : null }),
  );
  mesh.position.set(...center);
  if (facing === 'x') mesh.rotation.y = Math.PI / 2;
  if (facing === 'y') mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Générateur pseudo-aléatoire déterministe : la chambre est identique à chaque chargement. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const ART_COLORS = ['#e8c53a', '#4f9d69', '#d9534f', '#5b7fd1', '#e58fb1', '#2f3a56', '#f0a04b', '#7c5cbf', '#9ad1c9', '#f4ead2', '#1c1a19'];

/** Petite affiche abstraite : fond uni + quelques formes. */
function artTexture(rand: () => number, border = 0): THREE.CanvasTexture {
  const pick = () => ART_COLORS[Math.floor(rand() * ART_COLORS.length)];
  return texture(160, 200, (ctx, w, h) => {
    ctx.fillStyle = '#fbfaf6';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(border, border, w - 2 * border, h - 2 * border);
    ctx.clip();
    ctx.fillStyle = pick();
    ctx.fillRect(0, 0, w, h);
    const shapes = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < shapes; i++) {
      ctx.fillStyle = pick();
      const x = rand() * w;
      const y = rand() * h;
      const size = 20 + rand() * 70;
      const kind = rand();
      ctx.beginPath();
      if (kind < 0.45) {
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      } else if (kind < 0.75) {
        ctx.rect(x - size / 2, y - size / 2, size, size * (0.4 + rand()));
      } else {
        ctx.moveTo(x, y - size / 2);
        ctx.lineTo(x + size / 2, y + size / 2);
        ctx.lineTo(x - size / 2, y + size / 2);
      }
      ctx.fill();
    }
    ctx.restore();
  });
}

function buildShell(room: THREE.Object3D) {
  const rand = seeded(3);
  box(room, [6.15, 0.25, 6.15], [-0.075, -0.25, -0.075], 0x9c3a14, { radius: 0 });
  const planks = texture(1024, 1024, (ctx, w, h) => {
    const count = 12;
    const plank = w / count;
    for (let i = 0; i < count; i++) {
      let y = -rand() * 300;
      while (y < h) {
        const length = 260 + rand() * 260;
        const light = 44 + rand() * 9;
        ctx.fillStyle = `hsl(${17 + rand() * 5} 76% ${light}%)`;
        ctx.fillRect(i * plank, y, plank, length);
        ctx.strokeStyle = 'rgb(90 30 8 / 0.16)';
        ctx.lineWidth = 1;
        for (let g = 0; g < 5; g++) {
          const gx = i * plank + 6 + rand() * (plank - 12);
          ctx.beginPath();
          ctx.moveTo(gx, y + 8);
          ctx.lineTo(gx + (rand() - 0.5) * 6, y + length - 8);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgb(70 22 6 / 0.55)';
        ctx.fillRect(i * plank, y + length - 2, plank, 3);
        y += length;
      }
      ctx.fillStyle = 'rgb(70 22 6 / 0.55)';
      ctx.fillRect(i * plank - 1.5, 0, 3, h);
    }
  });
  panel(room, [6, 6], [0, 0.001, 0], 'y', planks);

  box(room, [0.15, 3.4, 6.15], [-3.075, 0, -0.075], 0xecd3a6, { radius: 0 });
  box(room, [6, 3.4, 0.15], [0, 0, -3.075], 0xb08f7c, { radius: 0 });
  box(room, [0.05, 0.2, 6], [-2.975, 0, 0], 0xf6eedd, { radius: 0.015 });
  box(room, [6, 0.2, 0.05], [0, 0, -2.975], 0xf6eedd, { radius: 0.015 });
}

function buildWindows(room: THREE.Object3D) {
  for (const z of [1.55, -0.45]) {
    box(room, [0.07, 2.15, 1.25], [-2.985, 0.45, z], 0xf7f1e4);
    for (const side of [-0.28, 0.28]) {
      box(room, [0.03, 1.95, 0.5], [-2.95, 0.55, z + side], 0xf5a32a, { emissive: 0x8a4a00, radius: 0, shadow: false });
      box(room, [0.04, 0.03, 0.5], [-2.945, 1.2, z + side], 0xf7f1e4, { shadow: false });
      box(room, [0.04, 0.03, 0.5], [-2.945, 1.85, z + side], 0xf7f1e4, { shadow: false });
    }
    box(room, [0.05, 0.16, 0.04], [-2.92, 1.4, z - 0.04], 0xdedad0);
    // Rideau : lames arrondies de deux gris, pour suggérer les plis.
    for (let i = 0; i < 5; i++) {
      box(room, [0.07, 2.25, 0.075], [-2.9, 0.4, z + 0.66 + i * 0.07], i % 2 ? 0xb6b2a9 : 0x9c9890, { radius: 0.03 });
    }
    box(room, [0.08, 0.07, 1.85], [-2.9, 2.66, z + 0.12], 0xc79a6b);
  }
}

function buildWardrobe(room: THREE.Object3D) {
  const g = group(room, 'wardrobe', [-2.5, 0, -2.25]);
  box(g, [0.9, 2.6, 1.3], [0, 0, 0], 0xf2ece2, { radius: 0.04 });
  for (const z of [-0.31, 0.31]) {
    box(g, [0.05, 0.5, 0.56], [0.455, 2.0, z], 0x5e554c);
    box(g, [0.05, 1.15, 0.56], [0.455, 0.78, z], 0x5e554c);
    box(g, [0.05, 0.09, 0.09], [0.5, 2.08, z * 0.4], 0x1c1a19);
    box(g, [0.05, 0.09, 0.09], [0.5, 1.3, z * 0.4], 0x1c1a19);
  }
  for (const y of [0.42, 0.1]) {
    box(g, [0.05, 0.26, 1.18], [0.455, y, 0], 0x5e554c);
    for (const z of [-0.3, 0.3]) box(g, [0.05, 0.07, 0.09], [0.5, y + 0.1, z], 0x1c1a19);
  }
  // Sur l'armoire : une boîte et une paire de chaussures.
  box(g, [0.5, 0.2, 0.62], [-0.05, 2.6, 0.25], 0x8a5a3c);
  box(g, [0.52, 0.04, 0.64], [-0.05, 2.8, 0.25], 0x6f4630);
  for (const z of [-0.42, -0.26]) {
    box(g, [0.34, 0.1, 0.13], [0.1, 2.6, z], 0x23211f, { radius: 0.05 });
    box(g, [0.34, 0.03, 0.13], [0.1, 2.6, z], 0xf2ece2, { radius: 0.01 });
  }
  // Au pied : chaussons et baskets.
  const pairs: [number, number][] = [[0xf2ece2, 0.95], [0x2a2826, 1.35]];
  for (const [color, z] of pairs) {
    for (const dz of [0, 0.17]) {
      box(g, [0.36, 0.11, 0.14], [0.75, 0, z + dz], color, { radius: 0.05 });
      box(g, [0.36, 0.03, 0.14], [0.75, 0, z + dz], 0xdedad0, { radius: 0.01 });
    }
  }
}

function buildShelf(room: THREE.Object3D) {
  const g = group(room, 'shelf', [-2.72, 0, 0.55]);
  for (const z of [-0.3, 0.3]) box(g, [0.45, 1.6, 0.04], [0, 0, z], 0xf4eee3);
  box(g, [0.03, 1.6, 0.6], [-0.2, 0, 0], 0xf4eee3);
  for (let level = 0; level < 5; level++) {
    const y = level * 0.39;
    box(g, [0.45, 0.04, 0.62], [0, y, 0], 0xf4eee3);
    if (level === 4) break;
    for (let i = 0; i < 4; i++) {
      cylinder(g, 0.058, 0.2, [0.08, y + 0.04, -0.2 + i * 0.133], 0xe0661a);
      cylinder(g, 0.06, 0.03, [0.08, y + 0.24, -0.2 + i * 0.133], 0x2a2826);
    }
  }
  // Figurine posée dessus.
  box(g, [0.16, 0.2, 0.16], [0, 1.6, 0], 0xe9e5dc, { radius: 0.04 });
  box(g, [0.2, 0.16, 0.2], [0, 1.8, 0], 0xf4f1ea, { radius: 0.07 });
}

function buildKeyboard(room: THREE.Object3D) {
  const g = group(room, 'keyboard', [-2.45, 0, 2.3]);
  for (const z of [-0.42, 0.42]) {
    for (const tilt of [-0.5, 0.5]) {
      const leg = box(g, [0.045, 0.95, 0.045], [0, 0, z], 0x1c1a19, { radius: 0.015 });
      leg.rotation.z = tilt;
      leg.position.y = 0.42;
    }
  }
  box(g, [0.5, 0.12, 1.3], [0, 0.8, 0], 0x2b40a6, { radius: 0.035 });
  box(g, [0.16, 0.02, 1.2], [-0.15, 0.92, 0], 0x1d2c78, { radius: 0 });
  for (let i = 0; i < 6; i++) cylinder(g, 0.018, 0.02, [-0.15, 0.94, -0.5 + i * 0.09], 0xd9d9d9);
  for (let i = 0; i < 22; i++) {
    const z = -0.577 + i * 0.055;
    box(g, [0.24, 0.025, 0.048], [0.1, 0.92, z], 0xfaf9f5, { radius: 0.006, shadow: false });
    if (i % 7 !== 2 && i % 7 !== 6 && i < 21) {
      box(g, [0.14, 0.02, 0.03], [0.05, 0.945, z + 0.0275], 0x15151a, { radius: 0.004, shadow: false });
    }
  }
}

function buildDesk(room: THREE.Object3D) {
  const desk = group(room, 'desk', [-1.15, 0, 1.6]);
  box(desk, [1.5, 0.08, 0.85], [0, 0.7, 0], 0xcf9040, { radius: 0.03, roughness: 0.6 });
  for (const x of [-0.62, 0.62]) {
    for (const z of [-0.32, 0.32]) {
      const leg = box(desk, [0.09, 0.72, 0.09], [x, 0, z], 0xb67b31, { radius: 0.02 });
      leg.rotation.z = x > 0 ? -0.06 : 0.06;
    }
  }
  const computer = group(desk, 'computer', [0, 0.78, 0]);
  box(computer, [0.34, 0.025, 0.22], [-0.1, 0, -0.22], 0x1c1a19);
  box(computer, [0.07, 0.18, 0.05], [-0.1, 0.02, -0.25], 0x1c1a19);
  box(computer, [0.95, 0.56, 0.045], [-0.1, 0.16, -0.22], 0x1c1a19, { radius: 0.02 });
  const screen = texture(256, 144, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, w, h);
    sky.addColorStop(0, '#31507a');
    sky.addColorStop(1, '#6f8fb8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgb(255 255 255 / 0.9)';
    ctx.fillRect(18, 18, 120, 10);
    ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
    for (let i = 0; i < 5; i++) ctx.fillRect(18, 42 + i * 16, 90 + ((i * 37) % 70), 6);
    ctx.fillStyle = '#e2a81f';
    ctx.fillRect(176, 40, 62, 62);
  });
  panel(computer, [0.88, 0.49], [-0.1, 0.44, -0.196], 'z', screen, 0x8a8a8a);
  box(computer, [0.6, 0.025, 0.2], [-0.1, 0, 0.15], 0x2a2826, { radius: 0.01 });
  box(computer, [0.09, 0.03, 0.13], [0.36, 0, 0.16], 0x2a2826, { radius: 0.015 });
  box(computer, [0.2, 0.34, 0.2], [0.58, 0, -0.15], 0x2a2826, { radius: 0.03 });
  const cone = cylinder(computer, 0.06, 0.02, [0.58, 0.2, -0.045], 0x4a4744);
  cone.rotation.x = Math.PI / 2;
}

function buildMic(room: THREE.Object3D) {
  const g = group(room, 'mic', [0.15, 0, 1.75]);
  for (let i = 0; i < 3; i++) {
    const foot = box(g, [0.5, 0.03, 0.035], [0, 0, 0], 0x1c1a19, { radius: 0.012 });
    foot.rotation.y = (i * Math.PI) / 3;
  }
  cylinder(g, 0.02, 1.45, [0, 0, 0], 0x1c1a19);
  cylinder(g, 0.035, 0.1, [0, 1.42, 0], 0x3a3836);
  box(g, [0.14, 0.24, 0.14], [0, 1.5, 0], 0xa4a4a4, { radius: 0.06, roughness: 0.4 });
}

function buildRug(room: THREE.Object3D) {
  const map = texture(768, 560, (ctx, w, h) => {
    ctx.fillStyle = '#d9b877';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d1b3a';
    ctx.fillRect(28, 28, w - 56, h - 56);
    ctx.strokeStyle = '#d9b877';
    ctx.lineWidth = 6;
    ctx.strokeRect(58, 58, w - 116, h - 116);
    ctx.fillStyle = '#5c1830';
    ctx.fillRect(84, 84, w - 168, h - 168);
    const diamond = (x: number, y: number, size: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.fill();
    };
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 7; col++) {
        const x = 130 + col * 85 + (row % 2) * 42;
        const y = 130 + row * 100;
        if (x > w - 120) continue;
        diamond(x, y, 30, '#1d1b3a');
        diamond(x, y, 18, row % 2 ? '#d9534f' : '#d9b877');
      }
    }
    // Petits motifs dans la bordure.
    ctx.fillStyle = '#d9534f';
    for (let x = 44; x < w - 30; x += 28) {
      ctx.fillRect(x, 39, 8, 8);
      ctx.fillRect(x, h - 47, 8, 8);
    }
  });
  box(room, [2.9, 0.025, 2.1], [0.35, 0, 0.1], 0xd9b877, { radius: 0.012, shadow: false });
  panel(room, [2.88, 2.08], [0.35, 0.027, 0.1], 'y', map);
}

function buildBed(room: THREE.Object3D) {
  const g = group(room, 'bed', [1.6, 0, -2.15]);
  for (const x of [-1.2, 1.2]) {
    for (const z of [-0.65, 0.65]) box(g, [0.1, 0.16, 0.1], [x, 0, z], 0x2a1d17);
  }
  box(g, [2.62, 0.22, 1.52], [0, 0.14, 0], 0xd8c9a5, { radius: 0.04 });
  box(g, [2.56, 0.2, 1.48], [0, 0.34, 0], 0xf4ecd8, { radius: 0.07 });
  // Couette jaune, avec ses rayures claires.
  box(g, [2.0, 0.16, 1.56], [-0.32, 0.46, 0], 0xe5aa1c, { radius: 0.07 });
  for (let i = 0; i < 5; i++) {
    box(g, [0.035, 0.165, 1.565], [-1.15 + i * 0.4, 0.46, 0], 0xf1c955, { radius: 0.015, shadow: false });
  }
  // Oreillers et plaid plié.
  for (const z of [-0.36, 0.36]) {
    const pillow = box(g, [0.5, 0.15, 0.62], [1.0, 0.52, z], 0xfbf7ec, { radius: 0.07 });
    pillow.rotation.z = -0.12;
  }
  box(g, [0.34, 0.09, 1.0], [0.52, 0.6, 0], 0x5fb3a8, { radius: 0.04 });
  for (let i = 0; i < 4; i++) {
    box(g, [0.345, 0.095, 0.05], [0.52, 0.6, -0.36 + i * 0.24], 0x2f3a56, { radius: 0.02, shadow: false });
  }
}

function buildLamp(room: THREE.Object3D) {
  const g = group(room, 'lamp', [-0.25, 0, -2.65]);
  box(g, [0.52, 0.5, 0.52], [0, 0, 0], 0x7a5138, { radius: 0.03 });
  box(g, [0.03, 0.14, 0.4], [0.262, 0.24, 0], 0x68432e, { radius: 0.008, shadow: false });
  cylinder(g, 0.022, 0.03, [0.285, 0.3, 0], 0x1c1a19);
  cylinder(g, 0.07, 0.03, [0, 0.5, 0], 0x3a3836);
  cylinder(g, 0.115, 0.38, [0, 0.53, 0], 0xf6ecd4, 0xa57f33).castShadow = false;
  const glow = new THREE.PointLight(0xffc878, 3, 3.2, 1.6);
  glow.position.set(0, 0.85, 0.1);
  g.add(glow);
}

function buildPosters(room: THREE.Object3D) {
  const rand = seeded(7);
  const wallZ = -2.994;

  // Les deux grandes affiches : ce sont elles qui ouvrent la boutique.
  const big = group(room, 'posters');
  for (const x of [0.85, 1.9]) {
    box(big, [0.86, 1.11, 0.03], [x, 1.52, -2.985], 0xfbfaf6, { radius: 0.008 });
    panel(big, [0.8, 1.05], [x, 2.075, -2.968], 'z', artTexture(rand, 10));
  }

  const arts = Array.from({ length: 14 }, () => artTexture(rand));
  const placed: { x: number; y: number; w: number; h: number }[] = [
    { x: 0.85, y: 2.075, w: 0.95, h: 1.2 },
    { x: 1.9, y: 2.075, w: 0.95, h: 1.2 },
  ];
  for (let attempt = 0; attempt < 400 && placed.length < 46; attempt++) {
    const w = 0.24 + rand() * 0.3;
    const h = w * (1 + rand() * 0.45);
    const x = -1.9 + rand() * 4.7;
    const y = 1.2 + rand() * 1.95;
    // Pas de chevauchement : le mur reste lisible.
    if (placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 0.03 && Math.abs(p.y - y) < (p.h + h) / 2 + 0.03)) continue;
    if (y + h / 2 > 3.3) continue;
    placed.push({ x, y, w, h });
    panel(room, [w, h], [x, y, wallZ + rand() * 0.004], 'z', arts[Math.floor(rand() * arts.length)]);
  }
  // Frise en haut du mur gauche.
  for (let i = 0; i < 15; i++) {
    const size = 0.2 + rand() * 0.1;
    panel(room, [0.26, size], [-2.994, 3.05, 2.65 - i * 0.37], 'x', arts[Math.floor(rand() * arts.length)]);
  }
}

function buildCdStack(room: THREE.Object3D) {
  const rand = seeded(21);
  const g = group(room, 'cd-stack', [1.55, 0, 2.05]);
  const count = 9;
  for (let i = 0; i < count; i++) {
    const holder = new THREE.Group();
    holder.position.set((rand() - 0.5) * 0.12, i * 0.062, (rand() - 0.5) * 0.12);
    holder.rotation.y = (rand() - 0.5) * 0.9;
    g.add(holder);
    box(holder, [0.56, 0.055, 0.56], [0, 0, 0], 0x23211f, { radius: 0.012 });
    box(holder, [0.5, 0.045, 0.565], [0.02, 0.005, 0], 0xe9e5dc, { radius: 0.008, shadow: false });
    if (i === count - 1) {
      panel(holder, [0.5, 0.5], [0, 0.057, 0], 'y', artTexture(rand));
      const disc = cylinder(holder, 0.21, 0.012, [0.12, 0.058, 0.1], 0xdfe6ea, 0x394246);
      (disc.material as THREE.MeshStandardMaterial).roughness = 0.25;
      (disc.material as THREE.MeshStandardMaterial).metalness = 0.6;
      cylinder(holder, 0.04, 0.014, [0.12, 0.058, 0.1], 0x23211f);
    }
  }
}

function buildPlaceholderRoom(): THREE.Group {
  const room = new THREE.Group();
  buildShell(room);
  buildWindows(room);
  buildWardrobe(room);
  buildShelf(room);
  buildKeyboard(room);
  buildDesk(room);
  buildMic(room);
  buildRug(room);
  buildBed(room);
  buildLamp(room);
  buildPosters(room);
  buildCdStack(room);
  return room;
}

/** Charge le modèle .glb si un chemin est donné, sinon construit la chambre provisoire. */
export async function loadRoom(modelUrl: string | null): Promise<THREE.Object3D> {
  if (!modelUrl) return buildPlaceholderRoom();
  const gltf = await new GLTFLoader().loadAsync(modelUrl);
  gltf.scene.traverse((node) => {
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return gltf.scene;
}
