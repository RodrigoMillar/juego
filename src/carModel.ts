import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CarConfig, CarFinish, CharacterConfig } from './types';
import { DEFAULT_CHARACTER } from './types';

const gltfLoader = new GLTFLoader();
const LADA_GLB_PATH = '/models/lada_2107.glb';
const FIAT_GLB_PATH = '/models/fiat_132.glb';
const CHEVETTE_GLB_PATH = '/models/chevrolet_chevette_sl_76.glb';
const LUV_GLB_PATH = '/models/chevrolet_luv.glb';
const CAVALIER_GLB_PATH = '/models/chevrolet_cavalier.glb';
const BEETLE_GLB_PATH = '/models/classic_volkswagen_beetle.glb';
const FALCON_GLB_PATH = '/models/chevrolet_falcon.glb';
const RITMO_GLB_PATH = '/models/fiat_ritmo.glb';
const D21_GLB_PATH = '/models/nissan_d21_1997.glb';
const V16_GLB_PATH = '/models/nissan_v16_taxi.glb';

export interface CarModel {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  length: number;
}

interface CarMaterials {
  body: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  head: THREE.MeshBasicMaterial;
  tail: THREE.MeshBasicMaterial;
  amber: THREE.MeshBasicMaterial;
  interior: THREE.MeshStandardMaterial;
}

interface WheelSpec {
  radius: number;
  width: number;
  x: number;
  z: number;
  rim: 'steel' | 'alloy' | 'offroad';
}

interface KitOptions {
  width: number;
  length: number;
  rearZ: number;
  roofY: number;
  roofZ: number;
  kind: 'sedan' | 'hatch' | 'coupe' | 'truck';
}

const FINISH_TUNING: Record<CarFinish, { metalness: number; roughness: number }> = {
  gloss: { metalness: 0.5, roughness: 0.22 },
  matte: { metalness: 0.12, roughness: 0.86 },
  metal: { metalness: 0.95, roughness: 0.3 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function rbox(
  parent: THREE.Object3D,
  size: [number, number, number],
  a: number | [number, number, number],
  b: [number, number, number] | THREE.Material,
  c?: THREE.Material | [number, number, number],
  d?: [number, number, number],
): THREE.Mesh {
  let radius = 0.06;
  let position: [number, number, number];
  let material: THREE.Material;
  let rotation: [number, number, number] | undefined;

  if (Array.isArray(a)) {
    position = a;
    material = b as THREE.Material;
    radius = typeof c === 'number' ? (c as number) : 0.06;
    rotation = Array.isArray(d) ? (d as [number, number, number]) : undefined;
    if (Array.isArray(c)) rotation = c as [number, number, number];
  } else {
    radius = a as number;
    position = b as [number, number, number];
    material = c as THREE.Material;
    rotation = d;
  }

  const geo = new RoundedBoxGeometry(size[0], size[1], size[2], 4, radius);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  rotation?: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function cyl(
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: [number, number, number],
  material: THREE.Material,
  rotation?: [number, number, number],
  segments = 16,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function sphere(
  parent: THREE.Object3D,
  radius: number,
  position: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function disc(
  parent: THREE.Object3D,
  radius: number,
  thickness: number,
  position: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thickness, 16), material);
  mesh.position.set(...position);
  mesh.rotation.x = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

function createMaterials(config: CarConfig): CarMaterials {
  const finish = FINISH_TUNING[config.finish] ?? FINISH_TUNING.gloss;
  const accent = new THREE.Color(config.accent);

  return {
    body: new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.color),
      metalness: finish.metalness,
      roughness: finish.roughness,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: accent,
      metalness: 0.55,
      roughness: 0.3,
      emissive: accent.clone(),
      emissiveIntensity: 0.24,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x0a1424,
      metalness: 0.95,
      roughness: 0.08,
      transparent: true,
      opacity: 0.72,
    }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x090a0e, roughness: 0.95 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd6e2f0, metalness: 1, roughness: 0.16 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0d1017, roughness: 0.88 }),
    head: new THREE.MeshBasicMaterial({ color: 0xfff2c4 }),
    tail: new THREE.MeshBasicMaterial({ color: 0xff1f3d }),
    amber: new THREE.MeshBasicMaterial({ color: 0xff9f1c }),
    interior: new THREE.MeshStandardMaterial({ color: 0x11151f, roughness: 0.9 }),
  };
}

function addWheels(
  group: THREE.Group,
  mats: CarMaterials,
  spec: WheelSpec[],
  accent: THREE.Color,
): THREE.Object3D[] {
  const wheels: THREE.Object3D[] = [];
  const rimMat = new THREE.MeshStandardMaterial({
    color: spec[0]?.rim === 'steel' ? 0x9fb0c4 : accent,
    metalness: 0.92,
    roughness: 0.28,
  });

  for (const wheel of spec) {
    const holder = new THREE.Group();
    holder.position.set(wheel.x, wheel.radius, wheel.z);
    group.add(holder);

    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(wheel.radius, wheel.radius, wheel.width, 24),
      mats.rubber,
    );
    tire.rotation.z = Math.PI / 2;
    holder.add(tire);

    for (const side of [-1, 1]) {
      const sidewall = new THREE.Mesh(
        new THREE.TorusGeometry(wheel.radius * 0.92, 0.035, 6, 24),
        mats.rubber,
      );
      sidewall.rotation.y = Math.PI / 2;
      sidewall.position.x = side * (wheel.width / 2 - 0.02);
      holder.add(sidewall);
    }

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(wheel.radius * 0.58, wheel.radius * 0.13, 8, 24),
      rimMat,
    );
    rim.rotation.y = Math.PI / 2;
    holder.add(rim);

    if (wheel.rim !== 'steel') {
      const spokeCount = wheel.rim === 'offroad' ? 3 : 5;
      for (let i = 0; i < spokeCount; i += 1) {
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(wheel.width * 0.42, wheel.radius * 1.1, wheel.radius * 0.1),
          rimMat,
        );
        spoke.rotation.x = (Math.PI / spokeCount) * i;
        holder.add(spoke);
      }
    }

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(wheel.radius * 0.18, wheel.radius * 0.18, wheel.width * 0.9, 12),
      mats.chrome,
    );
    hub.rotation.z = Math.PI / 2;
    holder.add(hub);

    // Arco de rueda dentro de holder para ocultarse junto con la rueda de respaldo.
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(wheel.radius * 1.16, 0.06, 6, 20, Math.PI),
      mats.body,
    );
    arch.rotation.y = Math.PI / 2;
    arch.position.set(0, 0, 0);
    holder.add(arch);

    wheels.push(holder);
  }

  return wheels;
}

function addMirrors(
  group: THREE.Group,
  mats: CarMaterials,
  width: number,
  y: number,
  z: number,
): void {
  for (const x of [-width / 2 - 0.1, width / 2 + 0.1]) {
    rbox(group, [0.18, 0.12, 0.1], 0.04, [x, y, z], mats.dark);
    box(group, [0.06, 0.18, 0.06], [x, y - 0.1, z], mats.dark);
    rbox(group, [0.12, 0.03, 0.04], 0.01, [x * 0.85, y - 0.18, z + 0.15], mats.chrome);
  }
  rbox(group, [width * 0.9, 0.025, 0.02], 0.01, [0, y + 0.34, z - 0.45], mats.chrome);
  rbox(group, [width * 0.9, 0.025, 0.02], 0.01, [0, y + 0.34, z + 0.95], mats.chrome);
}

function addDriver(
  group: THREE.Group,
  mats: CarMaterials,
  x: number,
  y: number,
  z: number,
  character: CharacterConfig = (globalThis as { __neonCarCharacter?: CharacterConfig }).__neonCarCharacter ?? DEFAULT_CHARACTER,
): void {
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(character.skin), roughness: 0.6 });
  const hairMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(character.hair), roughness: 0.7 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(character.eyes), roughness: 0.3 });

  rbox(group, [0.26, 0.34, 0.22], 0.08, [x, y + 0.22, z], mats.interior);
  cyl(group, 0.06, 0.06, 0.08, [x, y + 0.42, z], skinMat);
  sphere(group, 0.19, [x, y + 0.56, z], skinMat);

  sphere(group, 0.025, [x - 0.06, y + 0.58, z + 0.16], eyeMat);
  sphere(group, 0.025, [x + 0.06, y + 0.58, z + 0.16], eyeMat);
  rbox(group, [0.08, 0.02, 0.02], 0.01, [x, y + 0.53, z + 0.17], mats.dark);
  rbox(group, [0.05, 0.02, 0.03], 0.01, [x, y + 0.5, z + 0.17], mats.dark);

  const style = character.hairStyle;
  if (style === 1) {
    rbox(group, [0.34, 0.12, 0.3], 0.1, [x, y + 0.68, z - 0.02], hairMat);
    rbox(group, [0.3, 0.1, 0.12], 0.06, [x, y + 0.62, z + 0.12], hairMat);
  } else if (style === 2) {
    rbox(group, [0.36, 0.14, 0.34], 0.12, [x, y + 0.66, z - 0.04], hairMat);
    rbox(group, [0.12, 0.3, 0.12], 0.06, [x - 0.18, y + 0.48, z - 0.06], hairMat);
    rbox(group, [0.12, 0.3, 0.12], 0.06, [x + 0.18, y + 0.48, z - 0.06], hairMat);
  } else if (style === 3) {
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      sphere(group, 0.1, [x + Math.cos(angle) * 0.14, y + 0.7, z + Math.sin(angle) * 0.12], hairMat);
    }
    rbox(group, [0.34, 0.1, 0.3], 0.1, [x, y + 0.66, z], hairMat);
  }
}

function addStripes(
  group: THREE.Group,
  mats: CarMaterials,
  width: number,
  length: number,
  topY: number,
  z: number,
): void {
  for (const offset of [-0.16, 0.16]) {
    rbox(group, [0.12, 0.02, length * 0.72], 0.01, [offset, topY + 0.015, z], mats.accent);
  }
}

function addSpoiler(
  group: THREE.Group,
  mats: CarMaterials,
  width: number,
  y: number,
  z: number,
  tall: boolean,
): void {
  const supports = tall ? 0.34 : 0.2;
  for (const x of [-width * 0.34, width * 0.34]) {
    rbox(group, [0.07, supports, 0.1], 0.02, [x, y + supports / 2, z], mats.dark);
  }
  rbox(group, [width * 0.9, 0.05, 0.32], 0.02, [0, y + supports, z], mats.accent);
  if (tall) {
    rbox(group, [0.05, 0.16, 0.36], 0.02, [-width * 0.44, y + supports, z], mats.accent);
    rbox(group, [0.05, 0.16, 0.36], 0.02, [width * 0.44, y + supports, z], mats.accent);
  }
}

function addRallyLights(
  group: THREE.Group,
  mats: CarMaterials,
  width: number,
  y: number,
  z: number,
): void {
  rbox(group, [width * 0.62, 0.18, 0.22], 0.06, [0, y, z], mats.dark);
  const count = 4;
  for (let i = 0; i < count; i += 1) {
    const x = (i - (count - 1) / 2) * (width * 0.14);
    sphere(group, 0.07, [x, y + 0.01, z + 0.12], mats.head);
  }
}

function addMudFlaps(
  group: THREE.Group,
  mats: CarMaterials,
  wheelX: number,
  rearZ: number,
): void {
  for (const x of [-wheelX, wheelX]) {
    rbox(group, [0.3, 0.32, 0.04], 0.03, [x, 0.24, rearZ - 0.34], mats.dark);
  }
}

function addUnderglow(group: THREE.Group, mats: CarMaterials, width: number, length: number): void {
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.45, length * 1.08),
    new THREE.MeshBasicMaterial({
      color: mats.accent.color,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.035;
  group.add(glow);
}

function addShadow(group: THREE.Group, width: number, length: number): void {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(width * 0.82, length * 0.58, 1);
  shadow.position.y = 0.02;
  group.add(shadow);
}

function addStyleKit(
  group: THREE.Group,
  mats: CarMaterials,
  options: KitOptions,
  style: number,
): void {
  if (style <= 0) return;
  const { width, length, rearZ, roofY, roofZ, kind } = options;

  if (kind !== 'truck') {
    addStripes(group, mats, width, length, roofY + 0.02, roofZ);
    addSpoiler(group, mats, width, kind === 'hatch' ? roofY - 0.3 : roofY - 0.18, rearZ, style === 2);
  }

  if (style === 2) {
    if (kind === 'truck') {
      addRallyLights(group, mats, width * 0.84, roofY + 0.46, roofZ - 0.5);
      addMudFlaps(group, mats, width * 0.48, -length * 0.3);
    } else {
      addRallyLights(group, mats, width * 0.88, roofY + 0.22, roofZ + 0.22);
      addMudFlaps(group, mats, width * 0.47, -length * 0.32);
    }
  }
}

// ---------------------------------------------------------------------------
// Carga de modelo GLB
// ---------------------------------------------------------------------------
function loadGlbCar(
  path: string,
  group: THREE.Group,
  mats: CarMaterials,
  _config: CarConfig,
  wheels: THREE.Object3D[],
  length: number,
  isWheel: (child: THREE.Object3D) => boolean,
  legacyGroup?: THREE.Object3D,
  rotation?: [number, number, number],
): void {
  // Ocultamos el auto procedural de inmediato para que nunca se vea
  // superpuesto con el GLB mientras este termina de cargar.
  if (legacyGroup) legacyGroup.visible = false;
  for (const wheel of wheels) wheel.visible = false;

  const glbPlaceholder = new THREE.Group();
  glbPlaceholder.name = 'glb-placeholder';
  const placeholderBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 2.4), mats.body.clone());
  placeholderBox.position.y = 0.5;
  glbPlaceholder.add(placeholderBox);
  group.add(glbPlaceholder);

  gltfLoader.load(
    path,
    (gltf) => {
      const model = gltf.scene;
      model.name = path;

      if (rotation) {
        model.rotation.set(rotation[0], rotation[1], rotation[2]);
        model.updateMatrixWorld(true);
      } else {
        const initialBounds = new THREE.Box3().setFromObject(model);
        const initialSize = new THREE.Vector3();
        initialBounds.getSize(initialSize);
        if (initialSize.x > initialSize.z * 1.5 && initialSize.x >= initialSize.y) {
          model.rotation.y = -Math.PI / 2;
        } else if (initialSize.y > initialSize.x * 1.5 && initialSize.y > initialSize.z * 1.5) {
          model.rotation.x = -Math.PI / 2;
          model.rotation.y = Math.PI;
        }
        model.updateMatrixWorld(true);
      }

      const bounds = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      bounds.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scaleFactor = length / maxDim;
      model.scale.setScalar(scaleFactor);

      const scaledBounds = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      scaledBounds.getCenter(center);
      model.position.set(-center.x, -scaledBounds.min.y, -center.z);

      model.updateMatrixWorld(true);

      const glbWheels: THREE.Object3D[] = [];
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          const materialName = (child.material && 'name' in child.material ? String(child.material.name) : '').toLowerCase();
          if (/body|carpaint|lataria/i.test(materialName)) child.material = mats.body;
          else if (/glass|vidros/i.test(materialName)) child.material = mats.glass;
          else if (/black/i.test(materialName)) child.material = mats.dark;
          else if (/chrome/i.test(materialName)) child.material = mats.chrome;
        }

        if (isWheel(child)) {
          const m = child.matrixWorld.elements;
          const axes = [
            new THREE.Vector3(m[0], m[1], m[2]),
            new THREE.Vector3(m[4], m[5], m[6]),
            new THREE.Vector3(m[8], m[9], m[10]),
          ];
          let bestAxis: 'x' | 'y' | 'z' = 'x';
          let bestDot = Math.abs(axes[0].x);
          for (let i = 1; i < 3; i += 1) {
            const dot = Math.abs(axes[i].x);
            if (dot > bestDot) {
              bestDot = dot;
              bestAxis = i === 1 ? 'y' : 'z';
            }
          }
          child.userData.spinAxis = bestAxis;
          glbWheels.push(child);
        }
      });

      if (glbWheels.length > 0) {
        for (const wheel of [...wheels]) wheel.visible = false;
        wheels.length = 0;
        wheels.push(...glbWheels);
      } else {
        for (const wheel of wheels) wheel.visible = false;
      }

      if (legacyGroup) {
        legacyGroup.visible = false;
      }
      glbPlaceholder.removeFromParent();
      group.add(model);
    },
    undefined,
    (error) => {
      console.warn('No se pudo cargar ' + path + ', manteniendo geometria base:', error);
      glbPlaceholder.removeFromParent();
      if (legacyGroup) legacyGroup.visible = true;
      for (const wheel of wheels) wheel.visible = true;
    },
  );
}

// ---------------------------------------------------------------------------
// Lada 2106 (1976)
// ---------------------------------------------------------------------------
function buildLada(group: THREE.Group, mats: CarMaterials, config: CarConfig): CarModel {
  const width = 1.6;
  const length = 4.1;
  const radius = 0.33;
  const bodyY = 0.56;

  const legacyGroup = new THREE.Group();
  legacyGroup.name = 'legacy-primitives';
  group.add(legacyGroup);

  rbox(legacyGroup, [width, 0.5, 4.05], 0.14, [0, bodyY, 0], mats.body);
  rbox(legacyGroup, [width * 0.95, 0.14, 1.2], 0.06, [0, bodyY + 0.3, 1.32], mats.body);
  rbox(legacyGroup, [width * 0.95, 0.16, 0.95], 0.06, [0, bodyY + 0.31, -1.5], mats.body);
  rbox(legacyGroup, [width * 0.86, 0.46, 1.9], 0.14, [0, bodyY + 0.34, -0.12], mats.glass);
  rbox(legacyGroup, [width * 0.88, 0.09, 1.72], 0.05, [0, bodyY + 0.6, -0.12], mats.body);

  for (const x of [-width * 0.43, width * 0.43]) {
    rbox(legacyGroup, [0.06, 0.48, 0.08], 0.02, [x, bodyY + 0.36, 0.8], mats.chrome);
    rbox(legacyGroup, [0.06, 0.48, 0.08], 0.02, [x, bodyY + 0.36, -1.04], mats.chrome);
  }

  rbox(legacyGroup, [width * 1.05, 0.18, 0.22], 0.06, [0, bodyY - 0.08, 2.08], mats.chrome);
  rbox(legacyGroup, [width * 1.05, 0.18, 0.22], 0.06, [0, bodyY - 0.08, -2.06], mats.chrome);

  rbox(legacyGroup, [width * 0.74, 0.24, 0.06], 0.03, [0, bodyY + 0.14, 2.1], mats.dark);
  for (let i = 0; i < 6; i += 1) {
    box(legacyGroup, [width * 0.68, 0.022, 0.02], [0, bodyY + 0.04 + i * 0.045, 2.13], mats.chrome);
  }
  for (const x of [-0.55, 0.55]) {
    cyl(legacyGroup, 0.16, 0.16, 0.06, [x, bodyY + 0.18, 2.09], mats.chrome, [Math.PI / 2, 0, 0]);
    sphere(legacyGroup, 0.13, [x, bodyY + 0.18, 2.12], mats.head);
    sphere(legacyGroup, 0.06, [x * 1.35, bodyY - 0.02, 2.09], mats.amber);
  }

  for (const x of [-0.53, 0.53]) {
    rbox(legacyGroup, [0.56, 0.2, 0.08], 0.04, [x, bodyY + 0.2, -2.07], mats.tail);
    rbox(legacyGroup, [0.16, 0.2, 0.08], 0.04, [x < 0 ? x - 0.32 : x + 0.32, bodyY + 0.2, -2.07], mats.amber);
    cyl(legacyGroup, 0.12, 0.12, 0.06, [x, bodyY + 0.2, -2.03], mats.chrome, [Math.PI / 2, 0, 0]);
  }

  for (const x of [-width / 2 - 0.005, width / 2 + 0.005]) {
    rbox(legacyGroup, [0.02, 0.04, 3.1], 0.01, [x, bodyY + 0.13, 0], mats.chrome);
  }

  disc(legacyGroup, 0.09, 0.04, [0, bodyY + 0.14, 2.14], mats.chrome);
  rbox(legacyGroup, [0.5, 0.12, 0.03], 0.02, [0, bodyY - 0.02, 2.16], mats.dark);
  rbox(legacyGroup, [0.5, 0.12, 0.03], 0.02, [0, bodyY - 0.02, -2.14], mats.dark);
  cyl(legacyGroup, 0.035, 0.035, 0.4, [-0.5, bodyY - 0.28, -2.0], mats.chrome, [Math.PI / 2, 0, 0]);

  rbox(legacyGroup, [0.45, 0.12, 0.4], 0.04, [0.35, bodyY + 0.05, 0.35], mats.interior);
  rbox(legacyGroup, [0.45, 0.12, 0.4], 0.04, [-0.35, bodyY + 0.05, 0.35], mats.interior);
  const steeringWheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.025, 8, 16),
    mats.dark,
  );
  steeringWheel.position.set(0.28, bodyY + 0.42, 0.75);
  steeringWheel.rotation.y = Math.PI / 2;
  steeringWheel.rotation.x = 0.4;
  legacyGroup.add(steeringWheel);

  addMirrors(legacyGroup, mats, width, bodyY + 0.52, 0.72);
  addDriver(legacyGroup, mats, 0.25, bodyY - 0.1, -0.2);

  const wheels = addWheels(
    group,
    mats,
    [
      { radius, width: 0.24, x: -width / 2 + 0.06, z: 1.3, rim: 'steel' },
      { radius, width: 0.24, x: width / 2 - 0.06, z: 1.3, rim: 'steel' },
      { radius, width: 0.24, x: -width / 2 + 0.06, z: -1.3, rim: 'steel' },
      { radius, width: 0.24, x: width / 2 - 0.06, z: -1.3, rim: 'steel' },
    ],
    mats.accent.color,
  );

  loadGlbCar(
    LADA_GLB_PATH,
    group,
    mats,
    config,
    wheels,
    length,
    (child) => child.name.toLowerCase().includes('kama'),
    legacyGroup,
  );

  addStyleKit(legacyGroup, mats, {
    width,
    length,
    rearZ: -1.95,
    roofY: bodyY + 0.64,
    roofZ: -0.12,
    kind: 'sedan',
  }, config.style);

  addUnderglow(group, mats, width, length);
  addShadow(group, width, length);
  return { group, wheels, length };
}

// ---------------------------------------------------------------------------
// Fiat 132 (1977)
// ---------------------------------------------------------------------------
function buildFiat(group: THREE.Group, mats: CarMaterials, config: CarConfig): CarModel {
  const width = 1.66;
  const length = 4.34;
  const radius = 0.34;
  const bodyY = 0.62;

  const legacyGroup = new THREE.Group();
  legacyGroup.name = 'legacy-primitives';
  group.add(legacyGroup);

  rbox(legacyGroup, [width, 0.54, 4.14], 0.18, [0, bodyY, 0], mats.body);
  rbox(legacyGroup, [width * 0.98, 0.16, 1.36], 0.08, [0, bodyY + 0.33, 1.28], mats.body);
  rbox(legacyGroup, [width * 0.98, 0.18, 1.06], 0.08, [0, bodyY + 0.34, -1.56], mats.body);
  rbox(legacyGroup, [width * 0.9, 0.2, 0.72], 0.1, [0, bodyY + 0.18, 2.06], mats.body);
  rbox(legacyGroup, [width * 0.9, 0.48, 1.92], 0.16, [0, bodyY + 0.4, -0.16], mats.glass);
  rbox(legacyGroup, [width * 0.92, 0.09, 1.74], 0.05, [0, bodyY + 0.69, -0.16], mats.body);

  rbox(legacyGroup, [width * 0.82, 0.025, 1.58], 0.01, [0, bodyY + 0.74, -0.16], mats.dark);

  rbox(legacyGroup, [width * 1.06, 0.16, 0.22], 0.06, [0, bodyY - 0.1, 2.2], mats.chrome);
  rbox(legacyGroup, [width * 1.06, 0.16, 0.22], 0.06, [0, bodyY - 0.1, -2.18], mats.chrome);
  rbox(legacyGroup, [width * 0.8, 0.26, 0.05], 0.03, [0, bodyY + 0.12, 2.21], mats.dark);
  rbox(legacyGroup, [width * 0.88, 0.32, 0.03], 0.02, [0, bodyY + 0.12, 2.24], mats.chrome);

  for (const x of [-0.54, 0.54]) {
    rbox(legacyGroup, [0.5, 0.16, 0.06], 0.03, [x, bodyY + 0.23, 2.22], mats.head);
    sphere(legacyGroup, 0.06, [x * 1.5, bodyY + 0.05, 2.2], mats.amber);
    rbox(legacyGroup, [0.58, 0.18, 0.06], 0.03, [x, bodyY + 0.25, -2.2], mats.tail);
  }
  for (const x of [-width / 2 - 0.01, width / 2 + 0.01]) {
    rbox(legacyGroup, [0.02, 0.045, 3.22], 0.01, [x, bodyY + 0.15, 0], mats.chrome);
  }

  addMirrors(legacyGroup, mats, width, bodyY + 0.56, 0.78);
  addDriver(legacyGroup, mats, 0.22, bodyY - 0.12, -0.2);

  const wheels = addWheels(
    group,
    mats,
    [
      { radius, width: 0.25, x: -width / 2 + 0.06, z: 1.36, rim: 'steel' },
      { radius, width: 0.25, x: width / 2 - 0.06, z: 1.36, rim: 'steel' },
      { radius, width: 0.25, x: -width / 2 + 0.06, z: -1.36, rim: 'steel' },
      { radius, width: 0.25, x: width / 2 - 0.06, z: -1.36, rim: 'steel' },
    ],
    mats.accent.color,
  );

  loadGlbCar(
    FIAT_GLB_PATH,
    group,
    mats,
    config,
    wheels,
    length,
    (child) => /wheel|tire|rim|pneu|fl|fr|rl|rr/i.test(child.name),
    legacyGroup,
    [-Math.PI / 2, 0, 0],
  );

  addStyleKit(legacyGroup, mats, {
    width,
    length,
    rearZ: -2.05,
    roofY: bodyY + 0.73,
    roofZ: -0.16,
    kind: 'sedan',
  }, config.style);

  addUnderglow(group, mats, width, length);
  addShadow(group, width, length);
  return { group, wheels, length };
}

// ---------------------------------------------------------------------------
// Chevrolet Chevette (1976)
// ---------------------------------------------------------------------------
function buildChevette(group: THREE.Group, mats: CarMaterials, config: CarConfig): CarModel {
  const width = 1.6;
  const length = 3.98;
  const radius = 0.32;
  const bodyY = 0.56;

  const legacyGroup = new THREE.Group();
  legacyGroup.name = 'legacy-primitives';
  group.add(legacyGroup);

  rbox(legacyGroup, [width, 0.48, 3.82], 0.16, [0, bodyY, 0], mats.body);
  rbox(legacyGroup, [width * 0.97, 0.14, 1.18], 0.07, [0, bodyY + 0.29, 1.26], mats.body);
  rbox(legacyGroup, [width * 0.94, 0.28, 0.54], 0.1, [0, bodyY + 0.06, 1.86], mats.body);
  rbox(legacyGroup, [width * 0.9, 0.44, 1.5], 0.14, [0, bodyY + 0.37, -0.34], mats.glass);
  rbox(legacyGroup, [width * 0.94, 0.08, 1.34], 0.04, [0, bodyY + 0.63, -0.34], mats.body);

  rbox(legacyGroup, [width * 0.86, 0.06, 0.95], 0.03, [0, bodyY + 0.34, -1.62], mats.glass, [-0.62, 0, 0]);
  rbox(legacyGroup, [width * 0.96, 0.34, 0.24], 0.08, [0, bodyY - 0.02, -1.96], mats.body);

  rbox(legacyGroup, [width * 1.02, 0.15, 0.2], 0.06, [0, bodyY - 0.08, 2.02], mats.dark);
  rbox(legacyGroup, [width * 1.02, 0.15, 0.2], 0.06, [0, bodyY - 0.08, -2.0], mats.dark);
  rbox(legacyGroup, [width * 0.6, 0.18, 0.05], 0.03, [0, bodyY + 0.1, 2.03], mats.dark);

  for (const x of [-0.52, 0.52]) {
    sphere(legacyGroup, 0.12, [x, bodyY + 0.15, 2.04], mats.head);
    rbox(legacyGroup, [0.42, 0.16, 0.06], 0.03, [x, bodyY + 0.19, -2.03], mats.tail);
  }
  rbox(legacyGroup, [width * 0.52, 0.08, 0.04], 0.02, [0, bodyY - 0.05, 2.03], mats.amber);

  addMirrors(legacyGroup, mats, width, bodyY + 0.48, 0.62);
  addDriver(legacyGroup, mats, 0.2, bodyY - 0.08, -0.3);

  const wheels = addWheels(
    group,
    mats,
    [
      { radius, width: 0.23, x: -width / 2 + 0.05, z: 1.26, rim: 'steel' },
      { radius, width: 0.23, x: width / 2 - 0.05, z: 1.26, rim: 'steel' },
      { radius, width: 0.23, x: -width / 2 + 0.05, z: -1.26, rim: 'steel' },
      { radius, width: 0.23, x: width / 2 - 0.05, z: -1.26, rim: 'steel' },
    ],
    mats.accent.color,
  );

  loadGlbCar(
    CHEVETTE_GLB_PATH,
    group,
    mats,
    config,
    wheels,
    length,
    (child) => /^Pneu_/i.test(child.name),
    legacyGroup,
  );

  addStyleKit(legacyGroup, mats, {
    width,
    length,
    rearZ: -1.86,
    roofY: bodyY + 0.66,
    roofZ: -0.34,
    kind: 'hatch',
  }, config.style);

  addUnderglow(group, mats, width, length);
  addShadow(group, width, length);
  return { group, wheels, length };
}

// ---------------------------------------------------------------------------
// Chevrolet LUV (1999)
// ---------------------------------------------------------------------------
function buildLuv(group: THREE.Group, mats: CarMaterials, config: CarConfig): CarModel {
  const width = 1.74;
  const length = 4.62;
  const radius = 0.4;
  const bodyY = 1.04;

  const legacyGroup = new THREE.Group();
  legacyGroup.name = 'legacy-primitives';
  group.add(legacyGroup);

  rbox(legacyGroup, [width * 0.88, 0.16, 4.3], 0.06, [0, 0.5, 0], mats.dark);

  rbox(legacyGroup, [width, 0.62, 1.52], 0.16, [0, bodyY, 0.74], mats.body);
  rbox(legacyGroup, [width * 0.98, 0.16, 1.4], 0.08, [0, bodyY + 0.37, 1.74], mats.body);
  rbox(legacyGroup, [width, 0.38, 1.86], 0.12, [0, bodyY - 0.16, 1.44], mats.body);
  rbox(legacyGroup, [width * 0.9, 0.44, 1.1], 0.14, [0, bodyY + 0.42, 0.6], mats.glass);
  rbox(legacyGroup, [width * 0.94, 0.08, 1.16], 0.04, [0, bodyY + 0.66, 0.6], mats.body);

  rbox(legacyGroup, [width * 0.9, 0.1, 1.94], 0.04, [0, bodyY - 0.22, -1.42], mats.body);
  for (const x of [-width / 2 + 0.02, width / 2 - 0.02]) {
    rbox(legacyGroup, [0.12, 0.46, 2.0], 0.04, [x, bodyY - 0.02, -1.42], mats.body);
    rbox(legacyGroup, [0.13, 0.08, 2.04], 0.03, [x, bodyY + 0.22, -1.42], mats.dark);
  }
  rbox(legacyGroup, [width, 0.46, 0.12], 0.04, [0, bodyY - 0.02, -2.39], mats.body);
  rbox(legacyGroup, [width * 0.94, 0.06, 1.88], 0.03, [0, bodyY - 0.16, -1.42], mats.dark);

  rbox(legacyGroup, [width * 1.05, 0.2, 0.24], 0.06, [0, 0.68, 2.32], mats.chrome);
  rbox(legacyGroup, [width * 1.05, 0.18, 0.22], 0.06, [0, 0.7, -2.45], mats.chrome);
  rbox(legacyGroup, [width * 0.76, 0.22, 0.06], 0.03, [0, bodyY + 0.02, 2.34], mats.dark);
  rbox(legacyGroup, [width * 0.88, 0.15, 0.04], 0.02, [0, bodyY - 0.12, 2.35], mats.chrome);

  for (const x of [-0.6, 0.6]) {
    rbox(legacyGroup, [0.38, 0.18, 0.06], 0.03, [x, bodyY + 0.06, 2.35], mats.head);
    rbox(legacyGroup, [0.2, 0.34, 0.06], 0.03, [x * 1.24, bodyY - 0.02, -2.43], mats.tail);
  }
  rbox(legacyGroup, [width * 0.42, 0.08, 0.05], 0.02, [0, bodyY - 0.2, 2.36], mats.amber);

  addMirrors(legacyGroup, mats, width, bodyY + 0.42, 1.18);
  addDriver(legacyGroup, mats, 0.24, bodyY - 0.18, 0.55);

  if (config.style >= 1) {
    for (const x of [-width * 0.38, width * 0.38]) {
      rbox(legacyGroup, [0.09, 0.74, 0.09], 0.03, [x, bodyY + 0.54, 0.05], mats.dark);
    }
    rbox(legacyGroup, [width * 0.88, 0.1, 0.1], 0.03, [0, bodyY + 0.9, 0.05], mats.accent);
  }

  const wheels = addWheels(
    group,
    mats,
    [
      { radius, width: 0.3, x: -width / 2 + 0.04, z: 1.55, rim: 'offroad' },
      { radius, width: 0.3, x: width / 2 - 0.04, z: 1.55, rim: 'offroad' },
      { radius, width: 0.3, x: -width / 2 + 0.04, z: -1.5, rim: 'offroad' },
      { radius, width: 0.3, x: width / 2 - 0.04, z: -1.5, rim: 'offroad' },
    ],
    mats.accent.color,
  );

  loadGlbCar(
    LUV_GLB_PATH,
    group,
    mats,
    config,
    wheels,
    length,
    (child) => /wheel|tire|rim|pneu|fl|fr|rl|rr/i.test(child.name),
    legacyGroup,
  );

  addStyleKit(legacyGroup, mats, {
    width,
    length,
    rearZ: -2.32,
    roofY: bodyY + 0.74,
    roofZ: 0.6,
    kind: 'truck',
  }, config.style);

  addUnderglow(group, mats, width, length);
  addShadow(group, width, length);
  return { group, wheels, length };
}

// ---------------------------------------------------------------------------
// Chevrolet Cavalier (1996)
// ---------------------------------------------------------------------------
function buildCavalier(group: THREE.Group, mats: CarMaterials, config: CarConfig): CarModel {
  const width = 1.76;
  const length = 4.52;
  const radius = 0.34;
  const bodyY = 0.6;

  const legacyGroup = new THREE.Group();
  legacyGroup.name = 'legacy-primitives';
  group.add(legacyGroup);

  rbox(legacyGroup, [width, 0.46, 4.24], 0.16, [0, bodyY, 0], mats.body);
  rbox(legacyGroup, [width * 0.98, 0.12, 1.42], 0.06, [0, bodyY + 0.27, 1.28], mats.body, [0.04, 0, 0]);
  rbox(legacyGroup, [width * 0.96, 0.32, 0.74], 0.1, [0, bodyY - 0.02, 2.08], mats.body);
  rbox(legacyGroup, [width * 0.97, 0.16, 1.02], 0.06, [0, bodyY + 0.29, -1.68], mats.body);
  rbox(legacyGroup, [width * 0.9, 0.44, 1.84], 0.16, [0, bodyY + 0.36, -0.2], mats.glass);
  rbox(legacyGroup, [width * 0.92, 0.08, 1.54], 0.04, [0, bodyY + 0.61, -0.2], mats.body);

  rbox(legacyGroup, [width * 1.02, 0.26, 0.22], 0.08, [0, bodyY - 0.16, 2.3], mats.body);
  rbox(legacyGroup, [width * 0.68, 0.1, 0.05], 0.03, [0, bodyY + 0.09, 2.37], mats.dark);
  rbox(legacyGroup, [width * 0.82, 0.05, 0.03], 0.02, [0, bodyY - 0.02, 2.38], mats.chrome);

  for (const x of [-0.6, 0.6]) {
    rbox(legacyGroup, [0.52, 0.1, 0.05], 0.03, [x, bodyY + 0.17, 2.37], mats.head);
    rbox(legacyGroup, [0.16, 0.12, 0.05], 0.03, [x * 1.4, bodyY + 0.03, 2.34], mats.amber);
  }

  rbox(legacyGroup, [width * 0.84, 0.18, 0.05], 0.03, [0, bodyY + 0.21, -2.33], mats.tail);
  rbox(legacyGroup, [width * 0.3, 0.07, 0.04], 0.02, [0, bodyY + 0.21, -2.36], mats.head);
  rbox(legacyGroup, [width * 1.03, 0.22, 0.2], 0.06, [0, bodyY - 0.13, -2.3], mats.body);

  for (const x of [-width / 2 + 0.02, width / 2 - 0.02]) {
    rbox(legacyGroup, [0.08, 0.12, 2.92], 0.03, [x, bodyY - 0.24, 0.05], mats.dark);
  }

  addMirrors(legacyGroup, mats, width, bodyY + 0.44, 0.7);
  addDriver(legacyGroup, mats, 0.2, bodyY - 0.1, -0.22);

  const wheels = addWheels(
    group,
    mats,
    [
      { radius, width: 0.26, x: -width / 2 + 0.04, z: 1.42, rim: 'alloy' },
      { radius, width: 0.26, x: width / 2 - 0.04, z: 1.42, rim: 'alloy' },
      { radius, width: 0.26, x: -width / 2 + 0.04, z: -1.4, rim: 'alloy' },
      { radius, width: 0.26, x: width / 2 - 0.04, z: -1.4, rim: 'alloy' },
    ],
    mats.accent.color,
  );

  loadGlbCar(
    CAVALIER_GLB_PATH,
    group,
    mats,
    config,
    wheels,
    length,
    (child) => /wheel|tire|rim|pneu|fl|fr|rl|rr/i.test(child.name),
    legacyGroup,
  );

  addStyleKit(legacyGroup, mats, {
    width,
    length,
    rearZ: -2.16,
    roofY: bodyY + 0.65,
    roofZ: -0.2,
    kind: 'coupe',
  }, config.style);

  if (config.style === 2) {
    rbox(legacyGroup, [width * 0.34, 0.08, 0.52], 0.03, [0, bodyY + 0.34, 1.18], mats.dark);
  }

  addUnderglow(group, mats, width, length);
  addShadow(group, width, length);
  return { group, wheels, length };
}

// ---------------------------------------------------------------------------
// Volkswagen Escarabajo (1974)
// ---------------------------------------------------------------------------
function buildBeetle(group: THREE.Group, mats: CarMaterials, config: CarConfig): CarModel {
  const width = 1.58;
  const length = 4.05;
  const radius = 0.3;
  const bodyY = 0.52;

  const legacyGroup = new THREE.Group();
  legacyGroup.name = 'legacy-primitives';
  group.add(legacyGroup);

  rbox(legacyGroup, [width * 0.92, 0.5, 2.6], 0.42, [0, bodyY + 0.18, 0.1], mats.body);
  rbox(legacyGroup, [width * 0.88, 0.26, 1.0], 0.3, [0, bodyY - 0.02, 1.5], mats.body, [0.35, 0, 0]);
  rbox(legacyGroup, [width * 0.9, 0.42, 1.15], 0.36, [0, bodyY + 0.12, -1.35], mats.body, [-0.2, 0, 0]);
  rbox(legacyGroup, [width * 0.78, 0.4, 1.5], 0.35, [0, bodyY + 0.52, -0.15], mats.body);

  rbox(legacyGroup, [width * 0.72, 0.34, 1.25], 0.12, [0, bodyY + 0.5, -0.15], mats.glass);
  rbox(legacyGroup, [width * 0.7, 0.28, 0.06], 0.04, [0, bodyY + 0.46, 0.62], mats.glass, [-0.35, 0, 0]);

  for (const x of [-width / 2 + 0.02, width / 2 - 0.02]) {
    rbox(legacyGroup, [0.42, 0.34, 1.25], 0.18, [x, bodyY - 0.02, 1.35], mats.body);
  }
  for (const x of [-width / 2 + 0.02, width / 2 - 0.02]) {
    rbox(legacyGroup, [0.46, 0.38, 1.3], 0.2, [x, bodyY - 0.02, -1.25], mats.body);
  }

  for (const x of [-width / 2 - 0.06, width / 2 + 0.06]) {
    rbox(legacyGroup, [0.12, 0.06, 2.4], 0.03, [x, bodyY - 0.22, 0.05], mats.dark);
  }

  rbox(legacyGroup, [width * 1.02, 0.12, 0.16], 0.04, [0, bodyY - 0.12, 2.05], mats.chrome);
  rbox(legacyGroup, [width * 1.02, 0.12, 0.16], 0.04, [0, bodyY - 0.12, -2.05], mats.chrome);

  for (const x of [-0.55, 0.55]) {
    sphere(legacyGroup, 0.16, [x, bodyY + 0.1, 2.0], mats.head);
    sphere(legacyGroup, 0.07, [x, bodyY + 0.1, 2.02], mats.glass);
  }
  for (const x of [-0.5, 0.5]) {
    rbox(legacyGroup, [0.22, 0.12, 0.06], 0.03, [x, bodyY + 0.12, -2.04], mats.tail);
  }

  for (let i = 0; i < 6; i += 1) {
    box(legacyGroup, [width * 0.6, 0.02, 0.03], [0, bodyY + 0.2 - i * 0.05, -1.95], mats.dark);
  }

  cyl(legacyGroup, 0.04, 0.04, 0.35, [0.35, bodyY - 0.28, -2.0], mats.chrome, [Math.PI / 2, 0, 0]);
  disc(legacyGroup, 0.12, 0.04, [0, bodyY + 0.1, 2.06], mats.chrome);

  addMirrors(legacyGroup, mats, width, bodyY + 0.42, 0.6);
  addDriver(legacyGroup, mats, 0.18, bodyY - 0.1, -0.15);

  const wheels = addWheels(
    group,
    mats,
    [
      { radius, width: 0.2, x: -width / 2 + 0.08, z: 1.32, rim: 'steel' },
      { radius, width: 0.2, x: width / 2 - 0.08, z: 1.32, rim: 'steel' },
      { radius, width: 0.2, x: -width / 2 + 0.08, z: -1.32, rim: 'steel' },
      { radius, width: 0.2, x: width / 2 - 0.08, z: -1.32, rim: 'steel' },
    ],
    mats.accent.color,
  );

  loadGlbCar(
    BEETLE_GLB_PATH,
    group,
    mats,
    config,
    wheels,
    length,
    (child: THREE.Object3D) => /wheel|tire|rim|pneu|fl|fr|rl|rr/i.test(child.name),
    legacyGroup,
  );

  addStyleKit(legacyGroup, mats, {
    width,
    length,
    rearZ: -1.9,
    roofY: bodyY + 0.72,
    roofZ: -0.15,
    kind: 'coupe',
  }, config.style);

  addUnderglow(group, mats, width, length);
  addShadow(group, width, length);
  return { group, wheels, length };
}

// ---------------------------------------------------------------------------
// Chevrolet Falcon
// ---------------------------------------------------------------------------
function buildFalcon(group: THREE.Group, mats: CarMaterials, config: CarConfig): CarModel {
  const width = 1.78;
  const length = 4.65;
  const radius = 0.35;
  const bodyY = 0.58;

  const legacyGroup = new THREE.Group();
  legacyGroup.name = 'legacy-primitives';
  group.add(legacyGroup);

  rbox(legacyGroup, [width, 0.5, 4.55], 0.14, [0, bodyY, 0], mats.body);
  rbox(legacyGroup, [width * 0.88, 0.44, 1.85], 0.12, [0, bodyY + 0.36, -0.14], mats.glass);
  rbox(legacyGroup, [width * 0.9, 0.08, 1.65], 0.04, [0, bodyY + 0.62, -0.14], mats.body);

  const wheels = addWheels(
    group,
    mats,
    [
      { radius, width: 0.25, x: -width / 2 + 0.06, z: 1.45, rim: 'steel' },
      { radius, width: 0.25, x: width / 2 - 0.06, z: 1.45, rim: 'steel' },
      { radius, width: 0.25, x: -width / 2 + 0.06, z: -1.45, rim: 'steel' },
      { radius, width: 0.25, x: width / 2 - 0.06, z: -1.45, rim: 'steel' },
    ],
    mats.accent.color,
  );

  loadGlbCar(
    FALCON_GLB_PATH,
    group,
    mats,
    config,
    wheels,
    length,
    (child) => /wheel|tire|rim|pneu|fl|fr|rl|rr/i.test(child.name),
    legacyGroup,
  );

  addUnderglow(group, mats, width, length);
  addShadow(group, width, length);
  return { group, wheels, length };
}

// ---------------------------------------------------------------------------
// Fiat Ritmo
// ---------------------------------------------------------------------------
function buildRitmo(group: THREE.Group, mats: CarMaterials, config: CarConfig): CarModel {
  const width = 1.65;
  const length = 3.93;
  const radius = 0.32;
  const bodyY = 0.55;

  const legacyGroup = new THREE.Group();
  legacyGroup.name = 'legacy-primitives';
  group.add(legacyGroup);

  rbox(legacyGroup, [width, 0.48, 3.85], 0.14, [0, bodyY, 0], mats.body);
  rbox(legacyGroup, [width * 0.88, 0.44, 1.75], 0.12, [0, bodyY + 0.35, -0.15], mats.glass);
  rbox(legacyGroup, [width * 0.9, 0.08, 1.55], 0.04, [0, bodyY + 0.6, -0.15], mats.body);

  const wheels = addWheels(
    group,
    mats,
    [
      { radius, width: 0.23, x: -width / 2 + 0.05, z: 1.24, rim: 'steel' },
      { radius, width: 0.23, x: width / 2 - 0.05, z: 1.24, rim: 'steel' },
      { radius, width: 0.23, x: -width / 2 + 0.05, z: -1.24, rim: 'steel' },
      { radius, width: 0.23, x: width / 2 - 0.05, z: -1.24, rim: 'steel' },
    ],
    mats.accent.color,
  );

  loadGlbCar(
    RITMO_GLB_PATH,
    group,
    mats,
    config,
    wheels,
    length,
    (child) => /wheel|tire|rim|pneu|fl|fr|rl|rr/i.test(child.name),
    legacyGroup,
  );

  addUnderglow(group, mats, width, length);
  addShadow(group, width, length);
  return { group, wheels, length };
}

// ---------------------------------------------------------------------------
// Nissan D21 (1997)
// ---------------------------------------------------------------------------
function buildD21(group: THREE.Group, mats: CarMaterials, config: CarConfig): CarModel {
  const width = 1.69;
  const length = 4.72;
  const radius = 0.38;
  const bodyY = 0.96;

  const legacyGroup = new THREE.Group();
  legacyGroup.name = 'legacy-primitives';
  group.add(legacyGroup);

  rbox(legacyGroup, [width * 0.88, 0.16, 4.4], 0.06, [0, 0.48, 0], mats.dark);
  rbox(legacyGroup, [width, 0.58, 1.55], 0.14, [0, bodyY, 0.72], mats.body);
  rbox(legacyGroup, [width * 0.92, 0.46, 1.95], 0.06, [0, bodyY - 0.05, -1.42], mats.body);

  const wheels = addWheels(
    group,
    mats,
    [
      { radius, width: 0.28, x: -width / 2 + 0.05, z: 1.52, rim: 'offroad' },
      { radius, width: 0.28, x: width / 2 - 0.05, z: 1.52, rim: 'offroad' },
      { radius, width: 0.28, x: -width / 2 + 0.05, z: -1.48, rim: 'offroad' },
      { radius, width: 0.28, x: width / 2 - 0.05, z: -1.48, rim: 'offroad' },
    ],
    mats.accent.color,
  );

  loadGlbCar(
    D21_GLB_PATH,
    group,
    mats,
    config,
    wheels,
    length,
    (child) => /wheel|tire|rim|pneu|fl|fr|rl|rr/i.test(child.name),
    legacyGroup,
  );

  addUnderglow(group, mats, width, length);
  addShadow(group, width, length);
  return { group, wheels, length };
}

// ---------------------------------------------------------------------------
// Nissan V16
// ---------------------------------------------------------------------------
function buildV16(group: THREE.Group, mats: CarMaterials, config: CarConfig): CarModel {
  const width = 1.66;
  const length = 4.3;
  const radius = 0.32;
  const bodyY = 0.54;

  const legacyGroup = new THREE.Group();
  legacyGroup.name = 'legacy-primitives';
  group.add(legacyGroup);

  rbox(legacyGroup, [width, 0.48, 4.2], 0.14, [0, bodyY, 0], mats.body);
  rbox(legacyGroup, [width * 0.88, 0.44, 1.8], 0.12, [0, bodyY + 0.35, -0.14], mats.glass);
  rbox(legacyGroup, [width * 0.9, 0.08, 1.6], 0.04, [0, bodyY + 0.6, -0.14], mats.body);

  const wheels = addWheels(
    group,
    mats,
    [
      { radius, width: 0.23, x: -width / 2 + 0.05, z: 1.32, rim: 'steel' },
      { radius, width: 0.23, x: width / 2 - 0.05, z: 1.32, rim: 'steel' },
      { radius, width: 0.23, x: -width / 2 + 0.05, z: -1.32, rim: 'steel' },
      { radius, width: 0.23, x: width / 2 - 0.05, z: -1.32, rim: 'steel' },
    ],
    mats.accent.color,
  );

  loadGlbCar(
    V16_GLB_PATH,
    group,
    mats,
    config,
    wheels,
    length,
    (child) => /wheel|tire|rim|pneu|fl|fr|rl|rr/i.test(child.name),
    legacyGroup,
  );

  addUnderglow(group, mats, width, length);
  addShadow(group, width, length);
  return { group, wheels, length };
}

const BUILDERS = {
  lada: buildLada,
  fiat: buildFiat,
  chevette: buildChevette,
  luv: buildLuv,
  cavalier: buildCavalier,
  beetle: buildBeetle,
  falcon: buildFalcon,
  ritmo: buildRitmo,
  d21: buildD21,
  v16: buildV16,
} as const;

export function createCarModel(config: CarConfig): CarModel {
  (globalThis as { __neonCarCharacter?: CharacterConfig }).__neonCarCharacter = config.character ?? DEFAULT_CHARACTER;
  const group = new THREE.Group();
  group.name = `car-${config.model}`;
  const mats = createMaterials(config);
  const builder = BUILDERS[config.model] ?? buildLada;
  return builder(group, mats, config);
}