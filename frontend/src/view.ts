// Vue 3D : rendu, caméra, survol / clic sur les objets, bulles, animation d'arrivée.
// Deux façons de regarder la chambre, choisies à la création (`mode`) :
// - 'outside' : vue d'ensemble, de l'extérieur, qu'on fait tourner (page d'accueil) ;
// - 'inside'  : on est dans la pièce, à hauteur d'yeux (page dedans.html).
// Le clic, la surbrillance, les bulles et le bonhomme sont communs aux deux.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCharacter } from './character';
import { ambiance, character as characterSettings, insideView, type Interactable } from './config';
import { createEnclosure } from './enclosure';
import type { Room } from './room';
import { standPoint, zoneAt, zoneCenter, zoneContains } from './zones';

export type ViewMode = 'outside' | 'inside';

// ----- Réglages de la vue d'ensemble -----
const FOV = 36;
const HOME_TARGET = new THREE.Vector3(0, 0.9, 0);
// Direction de la caméra au repos : dans l'angle ouvert de la chambre, un peu au-dessus.
const HOME_AZIMUTH = -Math.PI / 4;
const HOME_POLAR = 1.08;
/** Taille de la chambre à faire tenir à l'écran (largeur vue de l'angle, hauteur). */
const FIT = { width: 8.6, widthPortrait: 7.7, height: 7.1 };
const FOCUS_RATIO = 0.66; // distance caméra quand un objet est sélectionné, par rapport à la vue d'ensemble

// ----- Réglages communs -----
const INTRO_HEIGHT = 6; // hauteur d'où descend la chambre à l'arrivée
const INTRO_DARK = 0.12; // luminosité de la chambre au début de l'arrivée (elle « s'allume »)
const HIGHLIGHT_OPACITY = 0.28;
/** Espace où la caméra intérieure a le droit de se placer (un peu en retrait des murs). */
const INSIDE_BOUNDS = { minX: -2.3, maxX: 2.1, minZ: -2.1, maxZ: 2.35 };

interface Entry {
  item: Interactable;
  /** Copie des faces de l'objet, affichée par-dessus pour le surligner. */
  glow: THREE.MeshBasicMaterial;
  glowGoal: number;
  center: THREE.Vector3;
  anchor: THREE.Vector3;
  label: HTMLButtonElement | null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Angle le plus court pour aller de `from` à `to` (radians). */
const shortestTurn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

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
      map: glowTexture('rgb(255 150 70 / 0.5)', 'rgb(255 120 60 / 0)'),
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
    const radius = 5.5 + rand() * 3; // pas trop loin : une poussière collée à la caméra ferait une grosse tache
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
      size: 0.12,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(dust);
  return dust;
}

/**
 * Regroupe, pour chaque zone, les faces du modèle qui s'y trouvent entièrement.
 * Affichées par-dessus en surbrillance, elles « allument » l'objet survolé.
 */
function collectFaces(room: THREE.Object3D, items: Interactable[]): Map<string, number[]> {
  const faces = new Map<string, number[]>(items.map((item) => [item.id, []]));
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  room.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      corners.forEach((corner, k) =>
        corner.fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld),
      );
      for (const item of items) {
        if (corners.every((corner) => zoneContains(item.zone, corner, 0.02))) {
          faces.get(item.id)!.push(...corners.flatMap((corner) => [corner.x, corner.y, corner.z]));
        }
      }
    }
  });
  return faces;
}

/**
 * Vue intérieure : d'où regarder un objet. On se place à hauteur d'yeux, à côté
 * de l'endroit où le bonhomme vient se poster (`stand`), du côté qui laisse la
 * vue la plus dégagée. `item.viewFrom` permet d'imposer la place.
 */
function insideViewpoint(item: Interactable, center: THREE.Vector3, stand: [number, number]): THREE.Vector3 {
  if (item.viewFrom) return new THREE.Vector3(...item.viewFrom);
  const { min, max } = item.zone;
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const distance = clamp(size * 0.9 + 1.1, 1.5, 2.8);
  const standPosition = new THREE.Vector3(stand[0], center.y, stand[1]);
  const towardStand = standPosition.clone().sub(center).setY(0);
  if (towardStand.lengthSq() < 0.01) towardStand.set(-center.x, 0, 0.3 - center.z);
  towardStand.normalize();
  const up = new THREE.Vector3(0, 1, 0);
  let best = new THREE.Vector3();
  let bestScore = -Infinity;
  for (const side of [-1, 1]) {
    // De biais par rapport au bonhomme, pour qu'il ne bouche pas la vue.
    const point = center.clone().addScaledVector(towardStand.clone().applyAxisAngle(up, side * 0.8), distance);
    point.x = clamp(point.x, INSIDE_BOUNDS.minX, INSIDE_BOUNDS.maxX);
    point.z = clamp(point.z, INSIDE_BOUNDS.minZ, INSIDE_BOUNDS.maxZ);
    point.y = center.y;
    // On préfère le côté le plus éloigné du bonhomme et le plus loin de l'objet (donc le moins collé à un mur).
    const score = point.distanceTo(standPosition) + point.distanceTo(center);
    if (score > bestScore) {
      bestScore = score;
      best = point;
    }
  }
  best.y = clamp(center.y + 0.35, 1.15, 1.65);
  return best;
}

export interface RoomView {
  /** Résolue quand l'animation d'arrivée est terminée. */
  ready: Promise<void>;
  /** Centre la caméra sur un objet, ou revient à la vue de départ avec `null`. */
  focus(id: string | null): void;
  /**
   * Place occupée par le panneau, en pixels, à droite (ordinateur) ou en bas
   * (téléphone). La chambre glisse pour rester centrée dans l'espace libre.
   */
  setInset(right: number, bottom: number): void;
}

export function createRoomView(
  container: HTMLElement,
  labelLayer: HTMLElement,
  room: Room,
  interactables: Interactable[],
  onSelect: (id: string) => void,
  mode: ViewMode = 'outside',
): RoomView {
  const inside = mode === 'inside';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Les couleurs viennent telles quelles des textures peintes dans Blender.
  renderer.toneMapping = THREE.NoToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // `stage` porte la chambre et ses surbrillances : c'est lui qu'anime l'arrivée.
  const stage = new THREE.Group();
  stage.add(room.object);
  scene.add(stage);
  const dust = buildAmbiance(scene);

  const roomMaterials = new Set<THREE.MeshBasicMaterial>();
  room.object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) roomMaterials.add(mesh.material as THREE.MeshBasicMaterial);
  });
  let ceilingLamp: THREE.Object3D | null = null;
  if (inside) {
    // De l'intérieur, il faut une pièce fermée : murs manquants, plafond, porte.
    const enclosure = createEnclosure(room.texture);
    stage.add(enclosure.object);
    ceilingLamp = enclosure.lamp;
    enclosure.materials.forEach((material) => roomMaterials.add(material));
  }
  const setBrightness = (value: number) => roomMaterials.forEach((material) => material.color.setScalar(value));

  // Le bonhomme est le seul objet éclairé de la scène (la chambre a ses lumières peintes).
  const insideStart = insideView.characterStart;
  const character = !characterSettings.enabled
    ? null
    : inside
      ? createCharacter(insideStart, Math.atan2(insideView.eye[0] - insideStart[0], insideView.eye[2] - insideStart[1]))
      : createCharacter();
  if (character) {
    stage.add(character.object);
    scene.add(new THREE.HemisphereLight(0xfff3e6, 0xa8684a, 2.1));
    const windowLight = new THREE.DirectionalLight(0xffd9a8, 1.1);
    windowLight.position.set(-2, 3, -3); // depuis les fenêtres
    scene.add(windowLight);
  }

  const camera = new THREE.PerspectiveCamera(inside ? insideView.fov : FOV, 1, 0.05, 100);
  camera.rotation.order = 'YXZ'; // tourner la tête (Y) puis lever les yeux (X)
  const homeDirection = new THREE.Vector3().setFromSphericalCoords(1, HOME_POLAR, HOME_AZIMUTH);

  // Vue d'ensemble : la caméra tourne autour de la chambre.
  const controls = inside ? null : new OrbitControls(camera, renderer.domElement);
  if (controls) {
    controls.target.copy(HOME_TARGET);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.minAzimuthAngle = HOME_AZIMUTH - 0.55;
    controls.maxAzimuthAngle = HOME_AZIMUTH + 0.55;
    controls.minPolarAngle = 0.75;
    controls.maxPolarAngle = 1.42;
  }

  // ----- Objets cliquables -----
  room.object.updateMatrixWorld(true);
  const faces = collectFaces(room.object, interactables);
  const debug = new URLSearchParams(location.search).has('debug');
  const entries: Entry[] = interactables.map((item) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(faces.get(item.id) ?? [], 3));
    const glow = new THREE.MeshBasicMaterial({
      color: 0xffe2b0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // Légèrement devant les faces d'origine, pour ne pas scintiller.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const overlay = new THREE.Mesh(geometry, glow);
    overlay.visible = false;
    overlay.name = `glow:${item.id}`;
    stage.add(overlay);
    glow.userData.mesh = overlay;

    const { min, max } = item.zone;
    const center = new THREE.Vector3(...zoneCenter(item.zone));
    const anchor = new THREE.Vector3(center.x, max[1] + 0.1, center.z);
    if (debug) {
      stage.add(new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), 0x00ffcc));
    }

    let label: HTMLButtonElement | null = null;
    if (item.label) {
      label = document.createElement('button');
      label.className = 'label';
      label.textContent = item.label;
      label.addEventListener('click', () => onSelect(item.id));
      labelLayer.appendChild(label);
    }
    return { item, glow, glowGoal: 0, center, anchor, label };
  });

  if (debug) {
    const { min, max } = characterSettings.walkArea;
    const area = new THREE.Box3(new THREE.Vector3(min[0], 0, min[1]), new THREE.Vector3(max[0], 0.02, max[1]));
    stage.add(new THREE.Box3Helper(area, 0xff8800));
  }

  let highlighted: Entry | null = null;
  function highlight(entry: Entry | null) {
    if (entry === highlighted) return;
    if (highlighted) highlighted.glowGoal = 0;
    if (entry) entry.glowGoal = HIGHLIGHT_OPACITY;
    highlighted?.label?.classList.remove('hover');
    entry?.label?.classList.add('hover');
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
    // Premier point touché sur la chambre : un objet caché derrière un meuble n'est pas cliquable.
    const hit = raycaster.intersectObject(room.object, true)[0];
    if (!hit) return null;
    return zoneAt(entries.map((entry) => ({ entry, zone: entry.item.zone })), hit.point)?.entry ?? null;
  }

  // ----- Vue intérieure : position et direction du regard -----
  const homeEye = new THREE.Vector3(...insideView.eye);
  const homeLook = new THREE.Vector3(...insideView.lookAt);
  const look = {
    eye: homeEye.clone(), // où la caméra doit se trouver
    target: homeLook.clone(), // ce qu'elle doit regarder
    turn: 0, // la tête tournée par le visiteur, à gauche ou à droite
    tilt: 0, // … et vers le haut ou le bas
    edgeX: 0, // souris contre un bord de l'écran : -1 à gauche, 1 à droite
    edgeY: 0,
  };
  let yaw = 0; // direction actuelle de la caméra, qui rejoint en douceur celle visée
  let pitch = 0;
  const lookDirection = new THREE.Vector3();
  function aimedAngles(): [number, number] {
    lookDirection.copy(look.target).sub(look.eye);
    const baseYaw = Math.atan2(-lookDirection.x, -lookDirection.z);
    const basePitch = Math.atan2(lookDirection.y, Math.hypot(lookDirection.x, lookDirection.z));
    return [baseYaw + look.turn, clamp(basePitch + look.tilt, -1.2, 1.2)];
  }
  function limitLook() {
    // Devant un objet, on ne peut que jeter un œil autour ; depuis la place d'arrivée, on peut presque se retourner.
    const maxTurn = focused ? 0.6 : insideView.maxTurn;
    const maxTilt = focused ? 0.35 : insideView.maxTilt;
    look.turn = clamp(look.turn, -maxTurn, maxTurn);
    look.tilt = clamp(look.tilt, -maxTilt, maxTilt);
  }

  let focused: Entry | null = null;
  let down: { x: number; y: number } | null = null;
  let dragging = false;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
    dragging = false;
    if (inside) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (inside && down && e.buttons) {
      // Glisser pour regarder autour : on « tire » le décor, comme sur une carte.
      dragging ||= Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8;
      if (dragging) {
        const speed = (insideView.dragSpeed * camera.fov * Math.PI) / 180 / canvas.clientHeight;
        look.turn += e.movementX * speed;
        look.tilt += e.movementY * speed;
        limitLook();
      }
      look.edgeX = look.edgeY = 0;
      return;
    }
    if (e.pointerType !== 'mouse' || e.buttons || intro) return;
    highlight(pick(e) ?? focused);
    if (inside) {
      // La souris près d'un bord fait tourner le regard de ce côté.
      const rect = canvas.getBoundingClientRect();
      const edge = (position: number, size: number) => {
        const margin = 0.12;
        const ratio = position / size;
        if (ratio < margin) return -(1 - ratio / margin);
        if (ratio > 1 - margin) return (ratio - (1 - margin)) / margin;
        return 0;
      };
      look.edgeX = edge(e.clientX - rect.left, rect.width);
      look.edgeY = edge(e.clientY - rect.top, rect.height);
    }
  });
  canvas.addEventListener('pointerleave', () => {
    highlight(focused);
    look.edgeX = look.edgeY = 0;
  });
  canvas.addEventListener('pointerup', (e) => {
    // Un glissement fait tourner la vue ; seul un vrai clic sélectionne.
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
  controls?.addEventListener('start', () => (animating = false));

  // Le canevas garde toujours la taille de l'écran : quand le panneau s'ouvre,
  // on ne le redimensionne pas (cela ferait clignoter l'image), on décale la vue.
  const inset = { right: 0, bottom: 0 }; // place prise par le panneau, valeur visée
  const shift = { x: 0, y: 0 }; // décalage affiché, qui rejoint la valeur visée en douceur
  let started = false;

  /** Vue d'ensemble : distance à laquelle la chambre remplit l'espace laissé libre par le panneau. */
  function frameRoom() {
    if (!controls) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const freeWidth = Math.max(width - inset.right, width * 0.3);
    const freeHeight = Math.max(height - inset.bottom, height * 0.3);
    const half = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    // Un peu plus serré en portrait.
    const fitWidth = freeWidth < freeHeight ? FIT.widthPortrait : FIT.width;
    baseDistance = Math.max(
      (FIT.height * height) / (2 * half * freeHeight),
      (fitWidth * height) / (2 * half * freeWidth),
    );
    controls.minDistance = baseDistance * 0.35;
    controls.maxDistance = baseDistance * 1.15;
    goal.distance = focused ? baseDistance * FOCUS_RATIO : baseDistance;
    animating = true;
  }

  function applyShift() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (Math.abs(shift.x) < 0.5 && Math.abs(shift.y) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(width, height, shift.x, shift.y, width, height);
  }

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    if (inside) camera.fov = width < height ? insideView.fovPortrait : insideView.fov;
    applyShift();
    camera.updateProjectionMatrix();
    frameRoom();
    // Changer la taille efface le canevas : on redessine tout de suite pour ne jamais montrer une image vide.
    if (started) renderer.render(scene, camera);
  }
  resize();

  // ----- Animation d'arrivée : la chambre descend en tournant, puis s'allume -----
  // En vue intérieure, la caméra regarde d'abord la chambre du dehors, puis y entre.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let intro = ambiance.intro && !reducedMotion;
  let introStart = 0;
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => (markReady = resolve));
  const outsidePosition = HOME_TARGET.clone().addScaledVector(homeDirection, inside ? 13 : baseDistance);
  const outsideLook = new THREE.PerspectiveCamera(); // sert seulement à calculer une orientation de caméra
  outsideLook.rotation.order = 'YXZ';
  outsideLook.position.copy(outsidePosition);
  outsideLook.lookAt(HOME_TARGET);
  const ENTER_AT = 0.72; // part de l'arrivée après laquelle la caméra entre dans la pièce (vue intérieure)

  function placeInside() {
    camera.position.copy(look.eye);
    [yaw, pitch] = aimedAngles();
    camera.rotation.set(pitch, yaw, 0);
  }
  function endIntro() {
    intro = false;
    stage.position.y = 0;
    stage.rotation.y = 0;
    setBrightness(1);
    if (controls) controls.enabled = true;
    else placeInside();
    if (ceilingLamp) ceilingLamp.visible = true;
    labelLayer.classList.add('ready');
    markReady();
  }
  function playIntro(now: number) {
    introStart ||= now;
    const duration = ambiance.introDuration * (inside ? 1.45 : 1) * 1000;
    const t = clamp01((now - introStart) / duration);
    const settle = inside ? t / ENTER_AT : t; // la descente occupe toute l'arrivée, ou seulement son début
    const drop = easeOutCubic(clamp01(settle / 0.75));
    stage.position.y = (1 - drop) * INTRO_HEIGHT;
    stage.rotation.y = (1 - drop) * -Math.PI * 1.5;
    // La lumière monte sur la fin de la descente.
    setBrightness(INTRO_DARK + (1 - INTRO_DARK) * easeOutCubic(clamp01((settle - 0.35) / 0.65)));
    if (inside) {
      // Puis la caméra plonge du dehors jusqu'à la place du visiteur.
      const enter = easeInOut(clamp01((t - ENTER_AT) / (1 - ENTER_AT)));
      if (ceilingLamp) ceilingLamp.visible = enter > 0.6;
      const [aimYaw, aimPitch] = aimedAngles();
      camera.position.lerpVectors(outsidePosition, look.eye, enter);
      yaw = outsideLook.rotation.y + shortestTurn(outsideLook.rotation.y, aimYaw) * enter;
      pitch = outsideLook.rotation.x + (aimPitch - outsideLook.rotation.x) * enter;
      camera.rotation.set(pitch, yaw, 0);
      camera.fov = FOV + ((container.clientWidth < container.clientHeight ? insideView.fovPortrait : insideView.fov) - FOV) * enter;
      camera.updateProjectionMatrix();
    }
    if (t >= 1) endIntro();
  }
  if (inside) {
    camera.position.copy(outsidePosition);
    camera.rotation.copy(outsideLook.rotation);
  } else {
    camera.position.copy(HOME_TARGET).addScaledVector(homeDirection, baseDistance * (intro ? 1.5 : 1));
  }
  if (intro) {
    if (controls) controls.enabled = false;
    stage.position.y = INTRO_HEIGHT;
    setBrightness(INTRO_DARK);
  } else {
    endIntro();
  }
  new ResizeObserver(resize).observe(container);

  const projected = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const toAnchor = new THREE.Vector3();
  const forward = new THREE.Vector3();
  let previous = 0;
  function frame(now: number) {
    requestAnimationFrame(frame);
    // Temps écoulé depuis l'image précédente, borné : un onglet resté en arrière-plan ne fait pas de bond.
    const dt = Math.min(0.05, (now - (previous || now)) / 1000);
    previous = now;
    if (intro) playIntro(now);
    room.update(now);
    character?.update(dt);
    dust.rotation.y = now * 0.00002;
    dust.position.y = Math.sin(now * 0.0003) * 0.35;

    if (controls) {
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
    } else if (!intro) {
      // Vue intérieure : la caméra rejoint en douceur sa place et la direction visée.
      look.turn -= look.edgeX * insideView.edgeSpeed * dt;
      look.tilt -= look.edgeY * insideView.edgeSpeed * 0.6 * dt;
      limitLook();
      const [aimYaw, aimPitch] = aimedAngles();
      const ease = 1 - Math.exp(-dt * 6); // amorti : le regard rejoint sa cible sans à-coup
      camera.position.lerp(look.eye, ease);
      yaw += shortestTurn(yaw, aimYaw) * ease;
      pitch += (aimPitch - pitch) * ease;
      camera.rotation.set(pitch, yaw, 0);
    }

    // La vue glisse vers l'espace laissé libre par le panneau.
    const targetX = inset.right / 2;
    const targetY = inset.bottom / 2;
    if (shift.x !== targetX || shift.y !== targetY) {
      shift.x += (targetX - shift.x) * 0.12;
      shift.y += (targetY - shift.y) * 0.12;
      if (Math.abs(targetX - shift.x) < 0.5) shift.x = targetX;
      if (Math.abs(targetY - shift.y) < 0.5) shift.y = targetY;
      applyShift();
    }

    for (const entry of entries) {
      // Surbrillance en fondu, avec une légère respiration quand elle est allumée.
      const pulse = entry.glowGoal ? 1 + 0.25 * Math.sin(now * 0.005) : 1;
      entry.glow.opacity += (entry.glowGoal * pulse - entry.glow.opacity) * 0.18;
      (entry.glow.userData.mesh as THREE.Mesh).visible = entry.glow.opacity > 0.004;
    }
    renderer.render(scene, camera);

    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.getWorldDirection(forward);
    for (const entry of entries) {
      if (!entry.label) continue;
      // Une bulle dont l'objet est derrière la caméra n'a pas de place à l'écran.
      const inFront = toAnchor.copy(entry.anchor).sub(camera.position).dot(forward) > 0.1;
      entry.label.style.visibility = inFront ? '' : 'hidden';
      if (!inFront) continue;
      projected.copy(entry.anchor).project(camera);
      const x = ((projected.x + 1) / 2) * width;
      const y = ((1 - projected.y) / 2) * height;
      entry.label.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
  started = true;
  requestAnimationFrame(frame);

  return {
    ready,
    setInset(right, bottom) {
      if (inset.right === right && inset.bottom === bottom) return;
      inset.right = right;
      inset.bottom = bottom;
      frameRoom();
    },
    focus(id) {
      focused = entries.find((e) => e.item.id === id) ?? null;
      goal.target.copy(focused ? focused.center : HOME_TARGET);
      goal.distance = focused ? baseDistance * FOCUS_RATIO : baseDistance;
      animating = true;
      const stand = focused ? standPoint(focused.item.zone, characterSettings.walkArea) : null;
      if (inside) {
        look.eye.copy(focused && stand ? insideViewpoint(focused.item, focused.center, stand) : homeEye);
        look.target.copy(focused ? focused.center : homeLook);
        look.turn = look.tilt = 0;
      }
      highlight(focused);
      for (const entry of entries) entry.label?.classList.toggle('active', entry === focused);
      if (focused && stand) character?.walkTo(stand[0], stand[1], focused.center.x, focused.center.z);
    },
  };
}
