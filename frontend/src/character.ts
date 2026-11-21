// Le bonhomme qui se promène dans la chambre. Il est construit ici, en formes
// lisses, à taille adulte : pas de fichier 3D à charger, donc aucun coût pour
// la fluidité. Réglages (taille, vitesse, zone de marche) : objet `character`
// de config.ts. Apparence : `COLORS` ci-dessous et la fonction `createCharacter`.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { character as settings } from './config';

const COLORS = {
  skin: 0xf2c6a8,
  hair: 0x5a3a26,
  shirt: 0xf3d23e,
  shorts: 0xc9342e,
  sock: 0xe68aa2,
  shoe: 0xf5f2ea,
  shoeStrap: 0xe9c53a,
  capYellow: 0xf2c530,
  capRed: 0xd63b35,
  capGreen: 0x3f9a4d,
  glasses: 0x2b2a31,
};

/** Hauteur du modèle tel qu'il est construit ci-dessous (du sol au sommet de la casquette). */
const MODEL_HEIGHT = 1.76;

export interface Character {
  object: THREE.Group;
  /** Marche en ligne droite jusqu'au point (x, z) du sol, puis se tourne vers (lookX, lookZ). */
  walkTo(x: number, z: number, lookX: number, lookZ: number): void;
  /** À appeler à chaque image. `dt` = secondes écoulées depuis l'image précédente. */
  update(dt: number): void;
}

// Un matériau par couleur, partagé entre toutes les formes de cette couleur.
const materials = new Map<number, THREE.MeshLambertMaterial>();
function material(color: number): THREE.MeshLambertMaterial {
  let result = materials.get(color);
  if (!result) {
    result = new THREE.MeshLambertMaterial({ color });
    materials.set(color, result);
  }
  return result;
}

type Position = [number, number, number];

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: number, position: Position): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material(color));
  result.position.set(...position);
  parent.add(result);
  return result;
}

function group(parent: THREE.Object3D, position: Position): THREE.Group {
  const result = new THREE.Group();
  result.position.set(...position);
  parent.add(result);
  return result;
}

/** Segment arrondi vertical (membre) : rayon, longueur de la partie droite. */
const limb = (radius: number, length: number) => new THREE.CapsuleGeometry(radius, length, 8, 20);
const ball = (radius: number) => new THREE.SphereGeometry(radius, 28, 20);

/** Petit dessin transparent (visage, motif du t-shirt) posé sur une forme. */
function drawing(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false });
}

function drawFace(ctx: CanvasRenderingContext2D) {
  ctx.lineCap = 'round';
  // Sourcils
  ctx.strokeStyle = '#4a2f20';
  ctx.lineWidth = 9;
  for (const x of [123, 389]) {
    ctx.beginPath();
    ctx.moveTo(x - 30, 128);
    ctx.quadraticCurveTo(x, 112, x + 30, 128);
    ctx.stroke();
  }
  // Yeux
  ctx.fillStyle = '#2c2019';
  for (const x of [123, 389]) {
    ctx.beginPath();
    ctx.ellipse(x, 176, 11, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  for (const x of [127, 393]) {
    ctx.beginPath();
    ctx.arc(x, 171, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Joues
  ctx.fillStyle = 'rgb(235 130 120 / 0.28)';
  for (const x of [100, 412]) {
    ctx.beginPath();
    ctx.ellipse(x, 262, 36, 24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Bouche entrouverte, souriante
  ctx.fillStyle = '#7a2b33';
  ctx.beginPath();
  ctx.moveTo(206, 330);
  ctx.quadraticCurveTo(256, 344, 306, 330);
  ctx.quadraticCurveTo(292, 384, 256, 384);
  ctx.quadraticCurveTo(220, 384, 206, 330);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(218, 334);
  ctx.quadraticCurveTo(256, 344, 294, 334);
  ctx.quadraticCurveTo(256, 356, 218, 334);
  ctx.fill();
}

/** Motif du t-shirt : le nom en grosses lettres. À remplacer par le vrai visuel si besoin. */
function drawShirtPrint(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#27407f';
  ctx.font = '900 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SLIM', 128, 104);
  ctx.fillStyle = '#c9342e';
  ctx.fillRect(34, 160, 188, 14);
  ctx.fillStyle = '#27407f';
  ctx.fillRect(74, 186, 108, 10);
}

/** Angle le plus court pour aller de `from` à `to` (radians). */
function shortestTurn(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function createCharacter(start: [number, number] = settings.start, facing = settings.startFacing): Character {
  // Le personnage regarde vers +z ; l'origine est entre ses pieds, au sol. Mesures en mètres.
  const root = new THREE.Group();
  root.name = 'character';
  const body = group(root, [0, 0, 0]); // tout sauf l'ombre : c'est lui qui se soulève à chaque pas

  // Ombre : simple disque sombre au sol.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 32),
    new THREE.MeshBasicMaterial({ color: 0x2a0d05, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  root.add(shadow);

  // ----- Jambes : cuisse articulée à la hanche, mollet articulé au genou -----
  const legs = [-1, 1].map((side) => {
    const thigh = group(body, [side * 0.095, 0.86, 0]);
    mesh(thigh, limb(0.066, 0.28), COLORS.skin, [0, -0.2, 0]);
    mesh(thigh, new THREE.CylinderGeometry(0.09, 0.096, 0.27, 24), COLORS.shorts, [0, -0.12, 0]); // jambe du short
    const knee = group(thigh, [0, -0.42, 0]);
    mesh(knee, limb(0.057, 0.25), COLORS.skin, [0, -0.165, 0]);
    mesh(knee, new THREE.CylinderGeometry(0.06, 0.058, 0.15, 20), COLORS.sock, [0, -0.275, 0]);
    // Sabot : une forme arrondie allongée vers l'avant, avec sa bride.
    const shoe = mesh(knee, limb(0.058, 0.15), COLORS.shoe, [0, -0.385, 0.055]);
    shoe.rotation.x = Math.PI / 2;
    shoe.scale.set(1.08, 1, 0.82);
    const strap = mesh(knee, new THREE.TorusGeometry(0.058, 0.012, 8, 20, Math.PI), COLORS.shoeStrap, [0, -0.375, -0.02]);
    strap.rotation.set(Math.PI / 2, 0, Math.PI);
    return { thigh, knee };
  });

  // ----- Tronc -----
  mesh(body, new RoundedBoxGeometry(0.35, 0.22, 0.21, 6, 0.08), COLORS.shorts, [0, 0.9, 0]);
  mesh(body, new RoundedBoxGeometry(0.38, 0.5, 0.21, 6, 0.085), COLORS.shirt, [0, 1.2, 0]);
  const print = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), drawing(256, 256, drawShirtPrint));
  print.position.set(0, 1.23, 0.107);
  body.add(print);

  // ----- Bras : épaule et coude articulés -----
  const arms = [-1, 1].map((side) => {
    const shoulder = group(body, [side * 0.21, 1.395, 0]);
    shoulder.rotation.z = side * 0.11;
    mesh(shoulder, new THREE.CylinderGeometry(0.06, 0.066, 0.18, 20), COLORS.shirt, [0, -0.07, 0]); // manche
    mesh(shoulder, ball(0.058), COLORS.shirt, [0, 0.0, 0]);
    mesh(shoulder, limb(0.044, 0.2), COLORS.skin, [0, -0.16, 0]);
    const elbow = group(shoulder, [0, -0.3, 0]);
    mesh(elbow, limb(0.041, 0.19), COLORS.skin, [0, -0.12, 0]);
    mesh(elbow, ball(0.046), COLORS.skin, [0, -0.275, 0]).scale.set(0.85, 1.1, 0.7);
    return { shoulder, elbow };
  });

  mesh(body, new THREE.CylinderGeometry(0.046, 0.05, 0.1, 20), COLORS.skin, [0, 1.48, 0]);

  // ----- Tête -----
  const head = group(body, [0, 1.6, 0]);
  const skull = group(head, [0, 0, 0]);
  skull.scale.set(0.96, 1.15, 1.02);
  mesh(skull, ball(0.105), COLORS.skin, [0, 0, 0]);
  // Le visage est un morceau de sphère transparent posé juste devant.
  skull.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.1062, 32, 24, Math.PI / 2 - 0.75, 1.5, Math.PI / 2 - 0.65, 1.25),
      drawing(512, 432, drawFace),
    ),
  );
  mesh(head, ball(0.017), COLORS.skin, [0, -0.012, 0.108]); // nez
  for (const side of [-1, 1]) mesh(head, ball(0.026), COLORS.skin, [side * 0.1, 0, 0]).scale.set(0.6, 1, 0.8);

  // Lunettes rondes à monture fine.
  const glasses = group(head, [0, 0.018, 0.1]);
  for (const side of [-1, 1]) {
    const lens = mesh(glasses, new THREE.TorusGeometry(0.031, 0.0038, 8, 28), COLORS.glasses, [side * 0.04, 0, 0.004]);
    lens.rotation.y = side * 0.3;
    const temple = mesh(glasses, new THREE.CylinderGeometry(0.003, 0.003, 0.1, 6), COLORS.glasses, [side * 0.082, 0.004, -0.05]);
    temple.rotation.x = Math.PI / 2;
  }
  mesh(glasses, new THREE.CylinderGeometry(0.003, 0.003, 0.022, 6), COLORS.glasses, [0, 0.004, 0.012]).rotation.z = Math.PI / 2;

  // Cheveux bouclés : des boules réparties sur les côtés et l'arrière, plus une frange.
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    const around = Math.PI * (0.3 + 1.4 * ((i * 0.618) % 1)); // de la tempe gauche à la tempe droite, par l'arrière
    const up = -0.085 + random() * 0.15;
    const out = 0.108 + random() * 0.03;
    mesh(head, ball(0.036 + random() * 0.018), COLORS.hair, [Math.sin(around) * out, up, Math.cos(around) * out * 0.95]);
  }
  for (let i = 0; i < 7; i++) {
    const across = -0.075 + (i / 6) * 0.15;
    mesh(head, ball(0.027), COLORS.hair, [across, 0.07 - Math.abs(across) * 0.25, 0.093 - Math.abs(across) * 0.25]);
  }

  // Casquette à quartiers de couleur.
  const cap = group(head, [0, 0.05, -0.004]);
  cap.scale.set(1.02, 0.95, 1.06);
  [COLORS.capYellow, COLORS.capGreen, COLORS.capRed, COLORS.capYellow, COLORS.capGreen, COLORS.capRed].forEach((color, i) => {
    // Le quartier 0 est centré sur l'avant (+z).
    const start = Math.PI / 2 - Math.PI / 6 + (i * Math.PI) / 3;
    mesh(cap, new THREE.SphereGeometry(0.116, 10, 14, start, Math.PI / 3, 0, Math.PI * 0.45), color, [0, 0, 0]);
  });
  mesh(cap, ball(0.012), COLORS.capRed, [0, 0.116, 0]); // bouton du sommet
  const brim = mesh(cap, new THREE.CylinderGeometry(0.105, 0.105, 0.012, 28, 1, false, -Math.PI / 2, Math.PI), COLORS.capRed, [0, 0.022, 0.07]);
  brim.rotation.x = 0.14;
  brim.scale.z = 1.25;

  root.scale.setScalar(settings.height / MODEL_HEIGHT);
  root.position.set(start[0], 0, start[1]);
  root.rotation.y = facing;

  // ----- Déplacement -----
  const target = new THREE.Vector2(start[0], start[1]);
  let finalFacing = facing;
  let stride = 0; // avancement du cycle de marche (un pas = π)
  let moving = 0; // 0 = à l'arrêt, 1 = en pleine marche (fondu entre les deux)
  let time = 0;

  return {
    object: root,
    walkTo(x, z, lookX, lookZ) {
      target.set(x, z);
      finalFacing = Math.atan2(lookX - x, lookZ - z);
    },
    update(dt) {
      time += dt;
      const dx = target.x - root.position.x;
      const dz = target.y - root.position.z;
      const distance = Math.hypot(dx, dz);
      const walking = distance > 0.02;

      if (walking) {
        // Il se tourne d'abord vers sa destination, puis avance ; il ralentit à l'arrivée.
        const heading = Math.atan2(dx, dz);
        const turn = shortestTurn(root.rotation.y, heading);
        root.rotation.y += turn * Math.min(1, dt * 9);
        const aligned = Math.max(0, 1 - Math.abs(turn) / 1.2);
        const step = Math.min(distance, settings.speed * aligned * Math.min(1, distance * 2.5 + 0.25) * dt);
        root.position.x += (dx / distance) * step;
        root.position.z += (dz / distance) * step;
        stride += (step / root.scale.x) * 4.6; // un pas d'environ 70 cm
      } else {
        root.rotation.y += shortestTurn(root.rotation.y, finalFacing) * Math.min(1, dt * 6);
      }

      moving += ((walking ? 1 : 0) - moving) * Math.min(1, dt * 8);
      legs.forEach(({ thigh, knee }, i) => {
        const phase = stride + i * Math.PI;
        thigh.rotation.x = -Math.sin(phase) * 0.5 * moving;
        // Le genou plie quand la jambe revient vers l'avant.
        knee.rotation.x = Math.max(0, Math.cos(phase)) * 0.9 * moving;
      });
      arms.forEach(({ shoulder, elbow }, i) => {
        const phase = stride + (i + 1) * Math.PI; // bras opposé à la jambe
        shoulder.rotation.x = -Math.sin(phase) * 0.42 * moving;
        elbow.rotation.x = -(0.12 + (0.3 + Math.max(0, -Math.sin(phase)) * 0.35) * moving);
      });
      // Léger rebond à chaque pas, respiration à l'arrêt.
      body.position.y = Math.abs(Math.sin(stride)) * 0.03 * moving + Math.sin(time * 1.8) * 0.004 * (1 - moving);
      body.rotation.x = 0.05 * moving;
      head.rotation.z = Math.sin(time * 1.1) * 0.03 * (1 - moving);
      head.rotation.y = Math.sin(time * 0.6) * 0.12 * (1 - moving);
    },
  };
}
