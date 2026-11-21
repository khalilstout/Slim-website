// Le petit bonhomme qui se promène dans la chambre. Il est construit ici, en
// formes simples, d'après la planche Ressources/imageh.png : pas de fichier 3D
// à charger, quelques dizaines de formes, donc aucun coût pour la fluidité.
// Réglages (taille, vitesse, zone de marche) : objet `character` de config.ts.

import * as THREE from 'three';
import { character as settings } from './config';

const COLORS = {
  skin: 0xffc0ad,
  hair: 0xc97a45,
  cap: 0x2f7a4f,
  capRed: 0xb93434,
  capYellow: 0xe2b33c,
  capBlue: 0x3657c4,
  propeller: 0x6aa5e6,
  shirt: 0xf0cc55,
  shorts: 0xb83232,
  sock: 0xf2ede4,
  shoe: 0x23212b,
};

export interface Character {
  object: THREE.Group;
  /** Marche en ligne droite jusqu'au point (x, z) du sol, puis se tourne vers (lookX, lookZ). */
  walkTo(x: number, z: number, lookX: number, lookZ: number): void;
  /** À appeler à chaque image. `dt` = secondes écoulées depuis l'image précédente. */
  update(dt: number): void;
}

const material = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: number, position: [number, number, number]) {
  const result = new THREE.Mesh(geometry, material(color));
  result.position.set(...position);
  parent.add(result);
  return result;
}

/** Petit dessin transparent (visage, fleur du t-shirt) posé sur une forme. */
function drawing(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false });
}

function drawFace(ctx: CanvasRenderingContext2D) {
  ctx.lineCap = 'round';
  // Yeux
  ctx.fillStyle = '#5a4038';
  for (const x of [96, 160]) {
    ctx.beginPath();
    ctx.roundRect(x - 6, 62, 12, 30, 6);
    ctx.fill();
  }
  // Sourcils
  ctx.strokeStyle = '#b06a3c';
  ctx.lineWidth = 4;
  for (const x of [96, 160]) {
    ctx.beginPath();
    ctx.arc(x, 56, 12, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  }
  // Mèche en spirale sur le front
  ctx.strokeStyle = '#c97a45';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const angle = (i / 40) * Math.PI * 3.2;
    const radius = 2 + i * 0.3;
    ctx.lineTo(128 + Math.cos(angle) * radius, 26 + Math.sin(angle) * radius);
  }
  ctx.stroke();
  // Taches de rousseur
  ctx.fillStyle = '#d9773f';
  for (const side of [-1, 1]) {
    for (const [dx, dy] of [[0, 0], [10, -5], [20, 0], [5, 9], [15, 9]]) {
      ctx.beginPath();
      ctx.arc(128 + side * (62 + dx), 108 + dy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Nez
  ctx.strokeStyle = '#d98e7c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(128, 104, 7, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  // Grande bouche ouverte et langue
  ctx.fillStyle = '#6b2530';
  ctx.beginPath();
  ctx.moveTo(92, 118);
  ctx.quadraticCurveTo(128, 132, 164, 118);
  ctx.quadraticCurveTo(150, 176, 128, 176);
  ctx.quadraticCurveTo(106, 176, 92, 118);
  ctx.fill();
  ctx.fillStyle = '#f08a8a';
  ctx.beginPath();
  ctx.ellipse(128, 162, 14, 12, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlower(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#3657c4';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(64 + Math.cos(angle) * 20, 46 + Math.sin(angle) * 20, 17, 6, angle, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(64, 70);
  ctx.lineTo(64, 112);
  ctx.moveTo(64, 104);
  ctx.quadraticCurveTo(86, 104, 90, 90);
  ctx.moveTo(64, 108);
  ctx.quadraticCurveTo(44, 108, 40, 96);
  ctx.stroke();
}

/** Angle le plus court pour aller de `from` à `to` (radians). */
function shortestTurn(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function createCharacter(): Character {
  // Le personnage regarde vers +z ; l'origine est entre ses pieds, au sol.
  const root = new THREE.Group();
  root.name = 'character';
  const body = new THREE.Group(); // tout sauf l'ombre : c'est lui qui sautille en marchant
  root.add(body);

  // Ombre : simple disque sombre au sol.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 20),
    new THREE.MeshBasicMaterial({ color: 0x2a0d05, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  root.add(shadow);

  // Jambes : un groupe par jambe, articulé à la hanche.
  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.06, 0.27, 0);
    mesh(leg, new THREE.CylinderGeometry(0.028, 0.028, 0.2, 8), COLORS.skin, [0, -0.1, 0]);
    mesh(leg, new THREE.CylinderGeometry(0.034, 0.034, 0.05, 8), COLORS.sock, [0, -0.185, 0]);
    mesh(leg, new THREE.BoxGeometry(0.085, 0.055, 0.16), COLORS.shoe, [0, -0.243, 0.03]);
    body.add(leg);
    return leg;
  });

  mesh(body, new THREE.BoxGeometry(0.25, 0.16, 0.16), COLORS.shorts, [0, 0.335, 0]);
  mesh(body, new THREE.BoxGeometry(0.27, 0.25, 0.16), COLORS.shirt, [0, 0.525, 0]);
  const flower = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), drawing(128, 128, drawFlower));
  flower.position.set(0, 0.52, 0.082);
  body.add(flower);

  // Bras : articulés à l'épaule, écartés comme sur le dessin.
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.14, 0.61, 0);
    arm.rotation.z = side * 0.75;
    mesh(arm, new THREE.CylinderGeometry(0.045, 0.05, 0.09, 8), COLORS.shirt, [0, -0.03, 0]);
    mesh(arm, new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8), COLORS.skin, [0, -0.15, 0]);
    mesh(arm, new THREE.IcosahedronGeometry(0.042, 1), COLORS.skin, [0, -0.26, 0]);
    body.add(arm);
    return arm;
  });

  mesh(body, new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8), COLORS.skin, [0, 0.665, 0]);

  // Tête : une grosse boule un peu aplatie, comme sur le dessin.
  const head = new THREE.Group();
  head.position.y = 0.86;
  body.add(head);
  const skull = new THREE.Group();
  skull.scale.set(1.18, 0.98, 1.05);
  head.add(skull);
  mesh(skull, new THREE.SphereGeometry(0.19, 20, 14), COLORS.skin, [0, 0, 0]);
  // Le visage est un morceau de sphère transparent posé juste devant.
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.192, 16, 12, Math.PI / 2 - 0.85, 1.7, Math.PI / 2 - 0.55, 1.2),
    drawing(256, 192, drawFace),
  );
  skull.add(face);
  for (const side of [-1, 1]) {
    mesh(head, new THREE.IcosahedronGeometry(0.05, 1), COLORS.skin, [side * 0.225, -0.03, 0]).scale.set(0.6, 1, 0.9);
  }
  // Cheveux bouclés : des touffes derrière et sur les côtés.
  for (let i = 0; i < 9; i++) {
    const angle = Math.PI * (0.62 + (i / 8) * 0.76) * 2 - Math.PI; // demi-cercle arrière
    const low = i % 2 ? -0.1 : -0.04;
    mesh(head, new THREE.IcosahedronGeometry(0.065, 0), COLORS.hair, [Math.sin(angle) * 0.2, low, Math.cos(angle) * 0.17]);
  }

  // Casquette : calotte verte devant, quartiers de couleur derrière, visière, hélice.
  const cap = new THREE.Group();
  cap.position.y = 0.075;
  cap.scale.set(1.2, 1.0, 1.08);
  head.add(cap);
  const wedge = (color: number, start: number, length: number) =>
    mesh(cap, new THREE.SphereGeometry(0.2, 10, 8, start, length, 0, Math.PI * 0.4), color, [0, 0, 0]);
  wedge(COLORS.cap, 0, Math.PI); // moitié avant (+z)
  wedge(COLORS.capRed, Math.PI, Math.PI / 3);
  wedge(COLORS.capYellow, (Math.PI * 4) / 3, Math.PI / 3);
  wedge(COLORS.capBlue, (Math.PI * 5) / 3, Math.PI / 3);
  const brim = mesh(cap, new THREE.CylinderGeometry(0.19, 0.19, 0.018, 16, 1, false, -Math.PI / 2, Math.PI), COLORS.cap, [0, 0.055, 0.1]);
  brim.rotation.x = -0.3;
  brim.scale.z = 1.25;
  mesh(head, new THREE.CylinderGeometry(0.012, 0.012, 0.07, 6), COLORS.propeller, [0, 0.255, 0]);
  const propeller = new THREE.Group();
  propeller.position.y = 0.295;
  propeller.rotation.z = 0.12;
  head.add(propeller);
  for (const side of [-1, 1]) {
    mesh(propeller, new THREE.SphereGeometry(0.1, 8, 6), COLORS.propeller, [side * 0.11, 0, 0]).scale.set(1, 0.08, 0.3);
  }

  root.scale.setScalar(settings.height / 1.16); // 1,16 = hauteur du modèle, hélice comprise
  root.position.set(settings.start[0], 0, settings.start[1]);
  root.rotation.y = settings.startFacing;

  // ----- Déplacement -----
  const target = new THREE.Vector2(settings.start[0], settings.start[1]);
  let finalFacing = settings.startFacing;
  let stride = 0; // avancement du cycle de marche
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
        root.rotation.y += turn * Math.min(1, dt * 10);
        const aligned = Math.max(0, 1 - Math.abs(turn) / 1.2);
        const step = Math.min(distance, settings.speed * aligned * Math.min(1, distance * 3 + 0.25) * dt);
        root.position.x += (dx / distance) * step;
        root.position.z += (dz / distance) * step;
        stride += step * 11;
      } else {
        root.rotation.y += shortestTurn(root.rotation.y, finalFacing) * Math.min(1, dt * 6);
      }

      moving += ((walking ? 1 : 0) - moving) * Math.min(1, dt * 8);
      const swing = Math.sin(stride) * 0.7 * moving;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      arms[0].rotation.x = -swing * 0.8;
      arms[1].rotation.x = swing * 0.8;
      // Sautillement en marchant, respiration à l'arrêt.
      body.position.y = Math.abs(Math.sin(stride)) * 0.03 * moving + Math.sin(time * 2.2) * 0.004 * (1 - moving);
      head.rotation.z = Math.sin(time * 1.3) * 0.04 * (1 - moving);
      propeller.rotation.y += dt * (3 + moving * 22);
    },
  };
}
