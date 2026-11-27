// La chambre : charge le modèle Blender (src/assets/room.glb) et lui applique
// ses textures. Les textures sont « pré-éclairées » (ombres et lumières déjà
// peintes dedans par Blender) : la scène n'a donc besoin d'aucune lumière, ce
// qui la rend légère sur téléphone.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import modelUrl from './assets/room.glb?url';
import postersTextureUrl from './assets/posters-base.jpg?url';
import roomTextureUrl from './assets/room-base.jpg?url';
import { mainPosters } from './config';

export interface Room {
  object: THREE.Group;
  /** À appeler à chaque image : anime l'écran de l'ordinateur. */
  update(now: number): void;
}

async function loadTexture(url: string): Promise<THREE.Texture> {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.flipY = false; // convention des fichiers .glb
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Écran de l'ordinateur : un petit lecteur audio dessiné à la main, animé. */
function createScreen(): { texture: THREE.CanvasTexture; draw(now: number): void } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  let last = -Infinity;
  return {
    texture,
    draw(now) {
      if (now - last < 90) return; // ~11 images par seconde suffisent
      last = now;
      const gradient = ctx.createLinearGradient(0, 0, 256, 128);
      gradient.addColorStop(0, '#1b1230');
      gradient.addColorStop(1, '#3a1d3f');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#ffb057';
      ctx.font = '800 30px system-ui, sans-serif';
      ctx.fillText('SLIM', 16, 40);
      ctx.fillStyle = 'rgb(255 255 255 / 0.6)';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText('EN LECTURE', 17, 58);
      for (let i = 0; i < 28; i++) {
        const level = 0.5 + 0.5 * Math.sin(now * 0.004 + i * 0.9) * Math.sin(now * 0.0013 + i * 0.37);
        const height = 6 + level * 38;
        ctx.fillStyle = i % 3 ? '#ff8a3c' : '#ffd08a';
        ctx.fillRect(16 + i * 8, 112 - height, 5, height);
      }
      texture.needsUpdate = true;
    },
  };
}

/** Redirige chaque grand poster vers le morceau d'image choisi dans config.ts. */
function remapMainPosters(geometry: THREE.BufferGeometry): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  // Le modèle range les posters l'un après l'autre, 4 sommets par poster.
  for (let poster = 0; poster * 4 < uv.count; poster++) {
    const crop = mainPosters[poster]?.crop;
    if (!crop) continue;
    const indices = [0, 1, 2, 3].map((i) => poster * 4 + i);
    const us = indices.map((i) => uv.getX(i));
    const vs = indices.map((i) => uv.getY(i));
    const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
    for (const i of indices) {
      const u = (uv.getX(i) - u0) / (u1 - u0 || 1);
      const v = (uv.getY(i) - v0) / (v1 - v0 || 1);
      uv.setXY(i, crop[0] + u * (crop[2] - crop[0]), crop[1] + v * (crop[3] - crop[1]));
    }
  }
  uv.needsUpdate = true;
}

export async function loadRoom(): Promise<Room> {
  const [gltf, roomTexture, postersTexture] = await Promise.all([
    new GLTFLoader().loadAsync(modelUrl),
    loadTexture(roomTextureUrl),
    loadTexture(postersTextureUrl),
  ]);
  const screen = createScreen();
  screen.draw(0);

  // Une texture par matériau du modèle (noms donnés dans Blender).
  const maps: Record<string, THREE.Texture> = {
    room_mat: roomTexture,
    posters_mat: postersTexture,
    main_posters_mat: postersTexture,
    screen_mat: screen.texture,
  };
  const materials = new Map<string, THREE.MeshBasicMaterial>();
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = (mesh.material as THREE.Material).name;
    const map = maps[name];
    if (!map) {
      console.warn(`[room] matériau « ${name} » sans texture associée (voir room.ts)`);
      return;
    }
    if (name === 'main_posters_mat') remapMainPosters(mesh.geometry);
    let material = materials.get(name);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ map, name });
      materials.set(name, material);
    }
    mesh.material = material;
  });

  return { object: gltf.scene, update: screen.draw };
}
