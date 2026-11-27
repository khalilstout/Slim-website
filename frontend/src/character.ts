// Le bonhomme qui se promène dans la chambre.
// Son modèle (src/assets/character.glb) est fabriqué par tools/build-character.py :
// c'est là que se changent ses formes, ses couleurs et ses vêtements. Ici, on le
// charge, on l'éclaire, et on anime son squelette pour le faire marcher.
// Réglages (taille, vitesse, zone de marche) : objet `character` de config.ts.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import modelUrl from './assets/character.glb?url';
import { character as settings } from './config';

/** Hauteur du modèle tel qu'il sort de Blender, du sol au sommet de la casquette. */
const MODEL_HEIGHT = 1.82;

export interface Character {
  object: THREE.Group;
  /** Marche en ligne droite jusqu'au point (x, z) du sol, puis se tourne vers (lookX, lookZ). */
  walkTo(x: number, z: number, lookX: number, lookZ: number): void;
  /** À appeler à chaque image. `dt` = secondes écoulées depuis l'image précédente. */
  update(dt: number): void;
}

export async function loadCharacterModel(): Promise<THREE.Object3D> {
  const model = (await new GLTFLoader().loadAsync(modelUrl)).scene;
  model.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Matériau simple et mat. `vertexColors` applique les ombres douces que Blender
    // a peintes dans le modèle (sous la visière, entre les boucles…).
    const toLambert = (source: THREE.Material) =>
      new THREE.MeshLambertMaterial({
        name: source.name,
        color: (source as THREE.MeshStandardMaterial).color,
        vertexColors: mesh.geometry.hasAttribute('color'),
      });
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toLambert) : toLambert(mesh.material);
    // Un modèle à squelette bouge hors de sa boîte d'origine : on le dessine toujours.
    mesh.frustumCulled = false;
  });
  return model;
}

/** Angle le plus court pour aller de `from` à `to` (radians). */
function shortestTurn(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Un os qu'on fait tourner comme une articulation : `bend` l'incline d'avant en
 * arrière, `lean` de côté, `twist` autour de la verticale — toujours dans le
 * repère du personnage, quel que soit le sens dans lequel l'os a été dessiné.
 */
interface Joint {
  set(bend: number, lean?: number, twist?: number): void;
}

function joint(model: THREE.Object3D, name: string): Joint {
  // Le chargeur retire les points des noms : « thigh.L » devient « thighL ».
  const bone = model.getObjectByName(name.replace('.', ''));
  if (!bone?.parent) {
    console.warn(`[character] os « ${name} » introuvable dans le modèle`);
    return { set: () => undefined };
  }
  const rest = bone.quaternion.clone();
  const parentWorld = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const parentWorldInverse = parentWorld.clone().invert();
  const turn = new THREE.Quaternion();
  const euler = new THREE.Euler();
  return {
    set(bend, lean = 0, twist = 0) {
      turn.setFromEuler(euler.set(bend, twist, lean));
      bone.quaternion.copy(parentWorldInverse).multiply(turn).multiply(parentWorld).multiply(rest);
    },
  };
}

export function createCharacter(model: THREE.Object3D): Character {
  const { start, startFacing: facing } = settings;
  // Le personnage regarde vers +z ; l'origine est entre ses pieds, au sol.
  const root = new THREE.Group();
  root.name = 'character';
  model.updateMatrixWorld(true); // les articulations se mesurent sur la pose de repos
  const sides = ['L', 'R'];
  const thighs = sides.map((side) => joint(model, `thigh.${side}`));
  const shins = sides.map((side) => joint(model, `shin.${side}`));
  const feet = sides.map((side) => joint(model, `foot.${side}`));
  const upperArms = sides.map((side) => joint(model, `upper_arm.${side}`));
  const forearms = sides.map((side) => joint(model, `forearm.${side}`));
  const spine = joint(model, 'spine');
  const chest = joint(model, 'chest');
  const head = joint(model, 'head');
  root.add(model);

  // Ombre : simple disque sombre au sol.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 32),
    new THREE.MeshBasicMaterial({ color: 0x2a0d05, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  root.add(shadow);

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
      const still = 1 - moving;
      const breath = Math.sin(time * 1.8);
      // Un angle négatif porte le membre vers l'avant, positif vers l'arrière.
      sides.forEach((_, i) => {
        const phase = stride + i * Math.PI;
        const swing = Math.sin(phase);
        thighs[i].set(-swing * 0.5 * moving);
        // Le genou plie quand la jambe revient vers l'avant.
        shins[i].set(Math.max(0, Math.cos(phase)) * 0.95 * moving);
        feet[i].set(-Math.max(0, swing) * 0.25 * moving);
        // Bras opposé à la jambe ; le coude reste un peu fléchi.
        upperArms[i].set(swing * 0.45 * moving, 0, 0);
        forearms[i].set(-(0.1 + (0.35 + Math.max(0, swing) * 0.35) * moving));
      });
      // Les épaules accompagnent le pas ; à l'arrêt, il respire et regarde un peu autour.
      spine.set(0.04 * moving + breath * 0.008 * still, 0, Math.sin(stride) * 0.06 * moving);
      chest.set(breath * 0.012 * still, 0, -Math.sin(stride) * 0.1 * moving);
      head.set(0, Math.sin(time * 1.1) * 0.03 * still, Math.sin(time * 0.6) * 0.14 * still + Math.sin(stride) * 0.04 * moving);
      model.position.y = Math.abs(Math.sin(stride)) * 0.03 * moving;
    },
  };
}
