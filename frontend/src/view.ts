// Vue 3D : rendu, caméra, survol / clic sur les objets, bulles.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ambiance, type Interactable } from './config';

const FOV = 36;
const HOME_TARGET = new THREE.Vector3(0, 1.05, 0);
// Direction de la caméra au repos : dans l'angle ouvert de la chambre, un peu au-dessus.
const HOME_AZIMUTH = Math.PI / 4;
const HOME_POLAR = 1.05;
const FOCUS_RATIO = 0.56; // distance caméra quand un objet est sélectionné, par rapport à la vue d'ensemble
const INTRO_HEIGHT = 6; // hauteur d'où descend la chambre à l'arrivée
const HIGHLIGHT = new THREE.Color(0x4a3a18);

interface Entry {
  item: Interactable;
  object: THREE.Object3D;
  materials: { material: THREE.MeshStandardMaterial; base: THREE.Color }[];
  center: THREE.Vector3;
  anchor: THREE.Vector3;
  label: HTMLButtonElement | null;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
/** Dépasse légèrement 1 avant d'y revenir : effet « pop ». */
const easeOutBack = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

/** Texture ronde et douce, pour les particules et le halo. */
function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = THREE.SRGBColorSpace;
  return result;
}

/** Décor autour de la chambre : halo chaud en dessous et poussières lumineuses. */
function buildAmbiance(scene: THREE.Scene): THREE.Points {
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22),
    new THREE.MeshBasicMaterial({
      map: glowTexture('rgb(255 150 70 / 0.55)', 'rgb(255 120 60 / 0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -1.2;
  scene.add(halo);

  // Répartition déterministe, en couronne autour de la chambre.
  const positions = new Float32Array(ambiance.particles * 3);
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < ambiance.particles; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 5 + rand() * 3.5; // pas trop loin : une poussière collée à la caméra ferait une grosse tache
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = -4 + rand() * 12;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: glowTexture('rgb(255 225 170 / 1)', 'rgb(255 200 140 / 0)'),
      size: 0.16,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(dust);
  return dust;
}

export interface RoomView {
  /** Résolue quand l'animation d'arrivée est terminée. */
  ready: Promise<void>;
  /** Centre la caméra sur un objet, ou revient à la vue d'ensemble avec `null`. */
  focus(id: string | null): void;
}

export function createRoomView(
  container: HTMLElement,
  labelLayer: HTMLElement,
  room: THREE.Object3D,
  interactables: Interactable[],
  onSelect: (id: string) => void,
): RoomView {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(room);
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x8a5a3c, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(4.5, 9, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -6;
  sun.shadow.camera.right = sun.shadow.camera.top = 6;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 25;
  sun.shadow.radius = 5;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  // Lueur chaude venant des fenêtres.
  const windowGlow = new THREE.PointLight(0xffa640, 6, 5, 1.5);
  windowGlow.position.set(-2.3, 1.6, 0.6);
  scene.add(windowGlow);

  const dust = buildAmbiance(scene);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  const homeDirection = new THREE.Vector3().setFromSphericalCoords(1, HOME_POLAR, HOME_AZIMUTH);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME_TARGET);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.minAzimuthAngle = HOME_AZIMUTH - 0.6;
  controls.maxAzimuthAngle = HOME_AZIMUTH + 0.6;
  controls.minPolarAngle = 0.7;
  controls.maxPolarAngle = 1.4;

  // ----- Objets cliquables -----
  const entries: Entry[] = [];
  room.updateMatrixWorld(true); // nécessaire pour mesurer les objets imbriqués
  for (const item of interactables) {
    const object = room.getObjectByName(item.id);
    if (!object) {
      console.warn(`[room] objet « ${item.id} » introuvable dans la scène`);
      continue;
    }
    const materials: Entry['materials'] = [];
    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Matériau propre à l'objet, pour le surligner sans toucher aux autres.
      const material = (mesh.material as THREE.MeshStandardMaterial).clone();
      mesh.material = material;
      if (material.emissive) materials.push({ material, base: material.emissive.clone() });
    });
    const bounds = new THREE.Box3().setFromObject(object);
    const center = bounds.getCenter(new THREE.Vector3());
    const anchor = new THREE.Vector3(center.x, bounds.max.y + 0.12, center.z);

    let label: HTMLButtonElement | null = null;
    if (item.label) {
      label = document.createElement('button');
      label.className = 'label';
      label.textContent = item.label;
      label.addEventListener('click', () => onSelect(item.id));
      labelLayer.appendChild(label);
    }
    entries.push({ item, object, materials, center, anchor, label });
  }

  let highlighted: Entry | null = null;
  function highlight(entry: Entry | null) {
    if (entry === highlighted) return;
    highlighted?.materials.forEach(({ material, base }) => material.emissive.copy(base));
    entry?.materials.forEach(({ material, base }) => material.emissive.copy(base).add(HIGHLIGHT));
    highlighted = entry;
    renderer.domElement.style.cursor = entry ? 'pointer' : 'grab';
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pick(event: PointerEvent): Entry | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    // On teste toute la chambre : un objet caché derrière un meuble n'est pas cliquable.
    const hit = raycaster.intersectObject(room, true)[0];
    if (!hit) return null;
    for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) {
      const entry = entries.find((e) => e.object === node);
      if (entry) return entry;
    }
    return null;
  }

  let focused: Entry | null = null;
  let down: { x: number; y: number } | null = null;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' && !e.buttons && !intro) highlight(pick(e) ?? focused);
  });
  canvas.addEventListener('pointerleave', () => highlight(focused));
  canvas.addEventListener('pointerup', (e) => {
    // Un glissement fait tourner la caméra ; seul un vrai clic sélectionne.
    const moved = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) : Infinity;
    down = null;
    if (moved > 8 || intro) return;
    const entry = pick(e);
    if (entry) onSelect(entry.item.id);
  });

  // ----- Caméra : cadrage et animation -----
  let baseDistance = 10;
  let animating = false;
  const goal = { target: HOME_TARGET.clone(), distance: baseDistance };
  controls.addEventListener('start', () => (animating = false));

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // Distance à laquelle la chambre remplit l'écran (un peu plus serré en portrait).
    const half = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const fitWidth = camera.aspect < 1 ? 7.9 : 8.3;
    baseDistance = Math.max(7.3 / (2 * half), fitWidth / (2 * half * camera.aspect));
    controls.minDistance = baseDistance * 0.35;
    controls.maxDistance = baseDistance * 1.15;
    goal.distance = focused ? baseDistance * FOCUS_RATIO : baseDistance;
    animating = true;
  }
  resize();

  // ----- Animation d'arrivée : la chambre descend en tournant, puis les meubles apparaissent -----
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let intro = ambiance.intro && !reducedMotion;
  let introStart = 0;
  const furniture = room.children.filter((child) => child.type === 'Group');
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => (markReady = resolve));
  function endIntro() {
    intro = false;
    room.position.y = 0;
    room.rotation.y = 0;
    furniture.forEach((object) => object.scale.setScalar(1));
    controls.enabled = true;
    labelLayer.classList.add('ready');
    markReady();
  }
  function playIntro(now: number) {
    introStart ||= now;
    const t = clamp01((now - introStart) / (ambiance.introDuration * 1000));
    const drop = easeOutCubic(clamp01(t / 0.7));
    room.position.y = (1 - drop) * INTRO_HEIGHT;
    room.rotation.y = (1 - drop) * -Math.PI * 1.5;
    furniture.forEach((object, index) => {
      const pop = clamp01((t - 0.5 - (index / furniture.length) * 0.3) / 0.2);
      object.scale.setScalar(Math.max(0.001, easeOutBack(pop)));
    });
    if (t >= 1) endIntro();
  }
  camera.position.copy(HOME_TARGET).addScaledVector(homeDirection, baseDistance * (intro ? 1.5 : 1));
  if (intro) {
    controls.enabled = false;
    furniture.forEach((object) => object.scale.setScalar(0.001));
    room.position.y = INTRO_HEIGHT;
  } else {
    endIntro();
  }
  new ResizeObserver(resize).observe(container);

  const projected = new THREE.Vector3();
  const offset = new THREE.Vector3();
  function frame(now: number) {
    requestAnimationFrame(frame);
    if (intro) playIntro(now);
    dust.rotation.y = now * 0.00002;
    dust.position.y = Math.sin(now * 0.0003) * 0.35;
    const ease = intro ? 0.03 : 0.08; // la caméra s'approche plus lentement pendant l'arrivée
    if (animating) {
      // On glisse vers la cible en gardant l'angle de vue courant.
      offset.copy(camera.position).sub(controls.target);
      const distance = offset.length();
      const nextDistance = distance + (goal.distance - distance) * ease;
      controls.target.lerp(goal.target, ease);
      camera.position.copy(controls.target).addScaledVector(offset.normalize(), nextDistance);
      if (controls.target.distanceToSquared(goal.target) < 1e-6 && Math.abs(goal.distance - nextDistance) < 1e-3) {
        animating = false;
      }
    }
    controls.update();
    renderer.render(scene, camera);

    const width = container.clientWidth;
    const height = container.clientHeight;
    for (const entry of entries) {
      if (!entry.label) continue;
      projected.copy(entry.anchor).project(camera);
      const x = ((projected.x + 1) / 2) * width;
      const y = ((1 - projected.y) / 2) * height;
      entry.label.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
  requestAnimationFrame(frame);

  return {
    ready,
    focus(id) {
      focused = entries.find((e) => e.item.id === id) ?? null;
      goal.target.copy(focused ? focused.center : HOME_TARGET);
      goal.distance = focused ? baseDistance * FOCUS_RATIO : baseDistance;
      animating = true;
      highlight(focused);
      for (const entry of entries) entry.label?.classList.toggle('active', entry === focused);
    },
  };
}
