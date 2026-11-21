import * as THREE from 'three';

export interface Track {
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  samples: THREE.Vector3[];
  tangents: THREE.Vector3[];
  start: THREE.Vector3;
  halfWidth: number;
  wallLimit: number;
}

const HALF_WIDTH = 7;
const WALL_OFFSET = HALF_WIDTH + 1.4;
const SAMPLE_COUNT = 800;

const CONTROL_POINTS: Array<[number, number]> = [
  [0, 0],
  [70, -45],
  [145, -35],
  [175, 15],
  [150, 75],
  [85, 95],
  [25, 65],
  [-35, 80],
  [-95, 55],
  [-120, 0],
  [-85, -55],
  [-20, -70],
];

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ribbon(
  samples: THREE.Vector3[],
  tangents: THREE.Vector3[],
  offset: number,
  width: number,
  y: number,
  material: THREE.Material,
): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const n = samples.length;

  for (let i = 0; i < n; i += 1) {
    const p = samples[i];
    const t = tangents[i];
    const latX = t.z;
    const latZ = -t.x;
    const a = offset - width / 2;
    const b = offset + width / 2;
    positions.push(p.x + latX * a, y, p.z + latZ * a);
    positions.push(p.x + latX * b, y, p.z + latZ * b);
    uvs.push(i / n, 0, i / n, 1);
  }

  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    const a = i * 2;
    const b = i * 2 + 1;
    const c = next * 2;
    const d = next * 2 + 1;
    indices.push(a, c, b, b, c, d);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, material);
}

function verticalWall(
  samples: THREE.Vector3[],
  tangents: THREE.Vector3[],
  offset: number,
  height: number,
  material: THREE.Material,
): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const n = samples.length;

  for (let i = 0; i < n; i += 1) {
    const p = samples[i];
    const t = tangents[i];
    const x = p.x + t.z * offset;
    const z = p.z - t.x * offset;
    positions.push(x, 0, z, x, height, z);
    uvs.push(i / n, 0, i / n, 1);
  }

  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    const a = i * 2;
    const b = i * 2 + 1;
    const c = next * 2;
    const d = next * 2 + 1;
    indices.push(a, c, b, b, c, d);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  material.side = THREE.DoubleSide;
  return mesh;
}

function checkerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const cell = 32;
  for (let y = 0; y < canvas.height / cell; y += 1) {
    for (let x = 0; x < canvas.width / cell; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#e8f6ff' : '#0a0f18';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function nearestDistanceSq(samples: THREE.Vector3[], x: number, z: number): number {
  let best = Infinity;
  for (const s of samples) {
    const dx = s.x - x;
    const dz = s.z - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return best;
}

function buildScenery(group: THREE.Group, samples: THREE.Vector3[], tangents: THREE.Vector3[]) {
  const rng = makeRng(1337);

  // Skyline blocks outside the track.
  const buildingMats = [0x111a2e, 0x161f38, 0x0e1524].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.1 }),
  );
  const windowMat = new THREE.MeshBasicMaterial({ color: 0x2f7fa8 });

  let placed = 0;
  let attempts = 0;
  while (placed < 56 && attempts < 400) {
    attempts += 1;
    const angle = rng() * Math.PI * 2;
    const radius = 90 + rng() * 150;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (nearestDistanceSq(samples, x, z) < (HALF_WIDTH + 26) ** 2) continue;

    const w = 8 + rng() * 18;
    const d = 8 + rng() * 18;
    const h = 10 + rng() * 55;
    const material = buildingMats[Math.floor(rng() * buildingMats.length)];
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    block.position.set(x, h / 2, z);
    group.add(block);

    const window = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.5, d * 0.9), windowMat);
    window.position.set(x, h - 1.2, z);
    group.add(window);
    placed += 1;
  }

  // Roadside pylons.
  const pylonGeo = new THREE.BoxGeometry(0.3, 5.2, 0.3);
  const cyan = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const magenta = new THREE.MeshBasicMaterial({ color: 0xff3ea5 });
  for (let i = 0; i < samples.length; i += 52) {
    const p = samples[i];
    const t = tangents[i];
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(pylonGeo, (i / 52 + (side > 0 ? 1 : 0)) % 2 === 0 ? cyan : magenta);
      pylon.position.set(
        p.x + t.z * side * (WALL_OFFSET + 3.2),
        2.6,
        p.z - t.x * side * (WALL_OFFSET + 3.2),
      );
      group.add(pylon);
    }
  }

  // Start gantry.
  const start = samples[0];
  const angle = Math.atan2(tangents[0].x, tangents[0].z);
  const gantry = new THREE.Group();
  gantry.position.copy(start);
  gantry.rotation.y = angle;
  const pillarGeo = new THREE.BoxGeometry(0.7, 8, 0.7);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1b2740, metalness: 0.6, roughness: 0.4 });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(side * (HALF_WIDTH + 2.4), 4, 0);
    gantry.add(pillar);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry((HALF_WIDTH + 2.4) * 2, 1.1, 0.9), pillarMat);
  beam.position.y = 7.6;
  gantry.add(beam);
  const neonBar = new THREE.Mesh(new THREE.BoxGeometry((HALF_WIDTH + 2.4) * 2 - 1, 0.16, 0.2), cyan);
  neonBar.position.set(0, 7.02, 0.5);
  gantry.add(neonBar);
  group.add(gantry);

  // Start / finish line.
  const lineMat = new THREE.MeshBasicMaterial({ map: checkerTexture() });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH * 2, 3), lineMat);
  line.rotation.x = -Math.PI / 2;
  const lineGroup = new THREE.Group();
  lineGroup.position.copy(start);
  lineGroup.position.y = 0.08;
  lineGroup.rotation.y = angle;
  lineGroup.add(line);
  group.add(lineGroup);
}

export function createTrack(): Track {
  const curve = new THREE.CatmullRomCurve3(
    CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'catmullrom',
    0.35,
  );

  const raw = curve.getSpacedPoints(SAMPLE_COUNT);
  const samples = raw.slice(0, SAMPLE_COUNT);
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    tangents.push(curve.getTangentAt(i / SAMPLE_COUNT).setY(0).normalize());
  }

  const group = new THREE.Group();
  group.name = 'track';

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({ color: 0x070b14, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  group.add(ground);

  const grid = new THREE.GridHelper(1400, 70, 0x1a2740, 0x101a2c);
  grid.position.y = 0.01;
  const gridMat = grid.material as THREE.LineBasicMaterial;
  gridMat.transparent = true;
  gridMat.opacity = 0.35;
  group.add(grid);

  const road = ribbon(
    samples,
    tangents,
    0,
    HALF_WIDTH * 2,
    0.04,
    new THREE.MeshStandardMaterial({ color: 0x171c2a, roughness: 0.95, metalness: 0.04 }),
  );
  group.add(road);

  // Slightly lighter inner lane to give the asphalt some texture.
  group.add(
    ribbon(
      samples,
      tangents,
      0,
      HALF_WIDTH * 0.55,
      0.048,
      new THREE.MeshStandardMaterial({ color: 0x1c2233, roughness: 1 }),
    ),
  );

  const cyanMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const magentaMat = new THREE.MeshBasicMaterial({ color: 0xff3ea5 });
  group.add(ribbon(samples, tangents, HALF_WIDTH - 0.45, 0.3, 0.09, cyanMat));
  group.add(ribbon(samples, tangents, -(HALF_WIDTH - 0.45), 0.3, 0.09, magentaMat));

  // Curbs.
  const curbMat = new THREE.MeshBasicMaterial({ color: 0x2a3550 });
  group.add(ribbon(samples, tangents, HALF_WIDTH - 1.1, 0.9, 0.055, curbMat));
  group.add(ribbon(samples, tangents, -(HALF_WIDTH - 1.1), 0.9, 0.055, curbMat));

  // Low barriers.
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x141c2e,
    roughness: 0.55,
    metalness: 0.35,
    side: THREE.DoubleSide,
  });
  group.add(verticalWall(samples, tangents, WALL_OFFSET, 1.5, wallMat));
  group.add(verticalWall(samples, tangents, -WALL_OFFSET, 1.5, wallMat));
  const wallGlowCyan = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const wallGlowPink = new THREE.MeshBasicMaterial({ color: 0xff3ea5 });
  group.add(ribbon(samples, tangents, WALL_OFFSET, 0.16, 1.52, wallGlowCyan));
  group.add(ribbon(samples, tangents, -WALL_OFFSET, 0.16, 1.52, wallGlowPink));

  buildScenery(group, samples, tangents);

  // Stars.
  const starCount = 1400;
  const starPositions = new Float32Array(starCount * 3);
  const rng = makeRng(99);
  for (let i = 0; i < starCount; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = 300 + rng() * 500;
    starPositions[i * 3] = Math.cos(angle) * radius;
    starPositions[i * 3 + 1] = 40 + rng() * 320;
    starPositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xa8c6ff, size: 1.6, transparent: true, opacity: 0.85, sizeAttenuation: true }),
  );
  group.add(stars);

  return {
    group,
    curve,
    samples,
    tangents,
    start: samples[0].clone(),
    halfWidth: HALF_WIDTH,
    wallLimit: WALL_OFFSET - 0.5,
  };
}
