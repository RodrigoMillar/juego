import * as THREE from 'three';
import { createCarModel, type CarModel } from '../carModel';
import { createTrack, type Track } from './track';
import type { GameAudio } from '../audio/GameAudio';
import type { CarConfig, HudState, PeerState, PlayerInfo } from '../types';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  localId: string;
  car: CarConfig;
  players: PlayerInfo[];
  laps: number;
  /** Local timestamp (Date.now based) at which the race starts. */
  startAt: number;
  audio?: GameAudio;
  onHud: (hud: HudState) => void;
  onState: (state: PeerState) => void;
  onFinished: (time: number) => void;
}

interface LocalCar {
  model: CarModel;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  prevIdx: number;
  lapsDone: number;
  finished: boolean;
  finishTime: number;
}

interface PeerCar {
  id: string;
  model: CarModel;
  target: PeerState | null;
  currentHeading: number;
  speed: number;
}

interface NearestSample {
  idx: number;
  dist: number;
  point: THREE.Vector3;
}

const MAXY_SPEED_BASE = 46;
const LABEL_HEIGHT = 3.1;

function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return from + diff * t;
}

function makeNameLabel(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const text = name.slice(0, 16);
  ctx.font = 'bold 54px "Segoe UI", system-ui, sans-serif';
  const width = Math.min(480, ctx.measureText(text).width + 56);

  ctx.fillStyle = 'rgba(4, 10, 22, 0.78)';
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
  ctx.lineWidth = 3;
  const x = (canvas.width - width) / 2;
  const y = 22;
  const h = 84;
  const r = 22;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + h, r);
  ctx.arcTo(x + width, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#e8f9ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, y + h / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sprite.scale.set(4.4, 1.1, 1);
  sprite.position.y = LABEL_HEIGHT;
  return sprite;
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly track: Track;
  private readonly options: GameOptions;
  private readonly keys = new Set<string>();

  private readonly local: LocalCar;
  private readonly peers = new Map<string, PeerCar>();
  private readonly cameraLook = new THREE.Vector3();

  private raf = 0;
  private lastTime = 0;
  private disposed = false;
  private offroad = false;
  private position = 1;
  private progress = 0;
  private lastHud = 0;
  private lastNet = 0;
  private finishSent = false;
  private throttle = false;
  private braking = false;

  constructor(options: GameOptions) {
    this.options = options;
    this.scene.background = new THREE.Color(0x05070f);
    this.scene.fog = new THREE.FogExp2(0x05070f, 0.0018);

    this.track = createTrack();
    this.scene.add(this.track.group);

    this.addLights();

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);

    const playerIndex = Math.max(
      0,
      options.players.findIndex((p) => p.id === options.localId),
    );

    const localSpawn = this.gridSpawn(playerIndex);
    const localModel = createCarModel(options.car);
    localModel.group.position.copy(localSpawn.pos);
    localModel.group.rotation.y = localSpawn.heading;
    this.scene.add(localModel.group);
    this.local = {
      model: localModel,
      pos: localSpawn.pos.clone(),
      heading: localSpawn.heading,
      speed: 0,
      prevIdx: localSpawn.idx,
      lapsDone: 0,
      finished: false,
      finishTime: 0,
    };

    options.players.forEach((player, index) => {
      if (player.id === options.localId) return;
      const spawn = this.gridSpawn(index);
      const model = createCarModel(player.car);
      model.group.position.copy(spawn.pos);
      model.group.rotation.y = spawn.heading;
      model.group.add(makeNameLabel(player.car?.character?.name || player.name));
      this.scene.add(model.group);
      this.peers.set(player.id, {
        id: player.id,
        model,
        target: null,
        currentHeading: spawn.heading,
        speed: 0,
      });
    });

    // Place the camera behind the car right away.
    const forward = new THREE.Vector3(Math.sin(localSpawn.heading), 0, Math.cos(localSpawn.heading));
    this.camera.position.copy(localSpawn.pos).addScaledVector(forward, -9).setY(4.4);
    this.cameraLook.copy(localSpawn.pos).setY(1.1).addScaledVector(forward, 8);
    this.camera.lookAt(this.cameraLook);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    options.audio?.startEngine();

    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  setPeerState(id: string, state: PeerState): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    if (
      !Number.isFinite(state.x) ||
      !Number.isFinite(state.z) ||
      !Number.isFinite(state.heading) ||
      !Number.isFinite(state.speed)
    ) {
      return;
    }
    peer.target = state;
    peer.speed = state.speed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.keys.clear();

    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (material) {
        for (const m of Array.isArray(material) ? material : [material]) materials.add(m);
      }
      const sprite = object as THREE.Sprite;
      if (sprite.material?.map) textures.add(sprite.material.map);
    });
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    this.renderer.dispose();
    this.renderer.setAnimationLoop(null);
    this.options.audio?.stopEngine();
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x9fc7ff, 0x0a0e18, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(90, 160, 40);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x22304d, 0.6));
  }

  private gridSpawn(playerIndex: number): { pos: THREE.Vector3; heading: number; idx: number } {
    const count = this.track.samples.length;
    const row = Math.floor(playerIndex / 2);
    const column = playerIndex % 2;
    const idx = (8 + row * 10) % count;
    const point = this.track.samples[idx];
    const tangent = this.track.tangents[idx];
    const lateral = column === 0 ? -2.55 : 2.55;
    const pos = new THREE.Vector3(
      point.x + tangent.z * lateral,
      0,
      point.z - tangent.x * lateral,
    );
    return { pos, heading: Math.atan2(tangent.x, tangent.z), idx };
  }

  private nearest(x: number, z: number): NearestSample {
    let bestIdx = 0;
    let bestDist = Infinity;
    const samples = this.track.samples;
    for (let i = 0; i < samples.length; i += 1) {
      const dx = samples[i].x - x;
      const dz = samples[i].z - z;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return { idx: bestIdx, dist: Math.sqrt(bestDist), point: samples[bestIdx] };
  }

  private tick = (time: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, Math.max(0.0001, (time - this.lastTime) / 1000));
    this.lastTime = time;
    const now = Date.now();
    this.update(dt, now);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number, now: number): void {
    const racing = now >= this.options.startAt;
    const elapsed = Math.max(0, (now - this.options.startAt) / 1000);
    const car = this.local;

    if (racing && !car.finished) {
      this.simulate(dt);
    } else if (car.finished) {
      car.speed *= 1 - Math.min(1, 1.6 * dt);
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
    }

    const maxSpeed = MAXY_SPEED_BASE + this.options.car.speed * 3;
    this.options.audio?.updateEngine({
      speedRatio: Math.min(1, Math.abs(car.speed) / maxSpeed),
      throttle: this.throttle && racing && !car.finished,
      braking: this.braking,
      offroad: this.offroad,
    });

    const near = this.nearest(car.pos.x, car.pos.z);
    this.enforceTrackBounds(near, dt);

    this.offroad = near.dist > this.track.halfWidth * 0.97;

    if (racing && !car.finished) {
      const count = this.track.samples.length;
      if (car.prevIdx > count * 0.72 && near.idx < count * 0.28) {
        car.lapsDone += 1;
        if (car.lapsDone >= this.options.laps) {
          car.finished = true;
          car.finishTime = elapsed;
          this.emitFinish();
        }
      }
      car.prevIdx = near.idx;
    }

    this.progress = car.lapsDone + near.idx / this.track.samples.length;

    car.model.group.position.set(car.pos.x, 0, car.pos.z);
    car.model.group.rotation.y = car.heading;

    this.updatePeers(dt);
    this.resolveCarCollisions();
    this.updateCamera(dt);
    this.updateWheels(dt);

    this.position = this.computePosition();

    const nowMs = now;
    if (nowMs - this.lastHud > 90) {
      this.lastHud = nowMs;
      this.emitHud(now, racing, elapsed);
    }
    if (nowMs - this.lastNet > 75) {
      this.lastNet = nowMs;
      this.options.onState({
        x: car.pos.x,
        z: car.pos.z,
        heading: car.heading,
        speed: car.speed,
        progress: this.progress,
        lap: Math.min(car.lapsDone + 1, this.options.laps),
        finished: car.finished,
      });
    }
  }

  private simulate(dt: number): void {
    const car = this.local;
    const config = this.options.car;
    const maxSpeed = MAXY_SPEED_BASE + config.speed * 3;
    const accelPower = 20 + config.accel * 2.4;
    const gripRate = 1.35 + config.grip * 0.06;

    const throttle = this.keys.has('w') || this.keys.has('arrowup');
    const brake = this.keys.has('s') || this.keys.has('arrowdown');
    this.throttle = throttle;
    this.braking = brake && car.speed > 0.5;
    const steer =
      (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0) -
      (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0);
    const handbrake = this.keys.has('space');

    const speedAbs = Math.abs(car.speed);
    const lowSpeedFactor = Math.min(1, speedAbs / 9);
    const highSpeedDamp = 1 - 0.62 * Math.min(1, speedAbs / maxSpeed);
    const direction = car.speed < -0.5 ? -1 : 1;
    car.heading += steer * gripRate * lowSpeedFactor * highSpeedDamp * direction * dt;

    if (throttle) {
      car.speed += accelPower * dt * (1 - 0.55 * Math.min(1, Math.max(0, car.speed) / maxSpeed));
    }
    if (brake) {
      if (car.speed > 0.5) {
        car.speed -= 58 * dt;
      } else {
        car.speed -= accelPower * 0.4 * dt;
      }
    }
    if (handbrake) {
      car.speed *= 1 - Math.min(1, 2.8 * dt);
    }

    car.speed -= car.speed * 0.32 * dt;

    if (this.offroad) {
      car.speed -= car.speed * 1.6 * dt;
      if (car.speed > 23) car.speed = Math.max(23, car.speed - 30 * dt);
    }

    car.speed = THREE.MathUtils.clamp(car.speed, -14, maxSpeed);

    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
  }

  private enforceTrackBounds(near: NearestSample, dt: number): void {
    const car = this.local;
    const dx = car.pos.x - near.point.x;
    const dz = car.pos.z - near.point.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= this.track.wallLimit) return;

    const nx = dx / dist;
    const nz = dz / dist;
    const scale = this.track.wallLimit / dist;
    car.pos.x = near.point.x + dx * scale;
    car.pos.z = near.point.z + dz * scale;

    // Only scrub the part of the velocity that pushes into the barrier, so
    // the car can scrape along a wall instead of stopping dead against it.
    const travel = car.speed >= 0 ? 1 : -1;
    const into = (Math.sin(car.heading) * nx + Math.cos(car.heading) * nz) * travel;
    if (into > 0) {
      car.speed *= 1 - Math.min(0.9, into * dt * 8);
    }
  }

  private updatePeers(dt: number): void {
    const k = 1 - Math.exp(-11 * dt);
    for (const peer of this.peers.values()) {
      const target = peer.target;
      const group = peer.model.group;
      if (target) {
        group.position.x += (target.x - group.position.x) * k;
        group.position.z += (target.z - group.position.z) * k;
        peer.currentHeading = lerpAngle(peer.currentHeading, target.heading, k);
        group.rotation.y = peer.currentHeading;
      }
      const spin = (target?.speed ?? peer.speed) * dt;
      for (const wheel of peer.model.wheels) {
        const axis = wheel.userData?.spinAxis === 'y' ? 'y' : wheel.userData?.spinAxis === 'z' ? 'z' : 'x';
        wheel.rotation[axis] += spin;
      }
    }
  }

  private resolveCarCollisions(): void {
    const car = this.local;
    for (const peer of this.peers.values()) {
      const dx = car.pos.x - peer.model.group.position.x;
      const dz = car.pos.z - peer.model.group.position.z;
      const dist = Math.hypot(dx, dz);
      const minDist = 2.7;
      if (dist > 0.001 && dist < minDist) {
        const push = (minDist - dist) * 0.6;
        car.pos.x += (dx / dist) * push;
        car.pos.z += (dz / dist) * push;
        car.speed *= 0.94;
      }
    }
  }

  private updateCamera(dt: number): void {
    const car = this.local;
    const speedRatio = Math.min(1, Math.abs(car.speed) / 62);
    const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
    const desired = new THREE.Vector3(
      car.pos.x - forward.x * (8.6 + speedRatio * 1.8),
      4.2 + speedRatio * 0.6,
      car.pos.z - forward.z * (8.6 + speedRatio * 1.8),
    );
    const smooth = 1 - Math.exp(-6.5 * dt);
    this.camera.position.lerp(desired, smooth);

    const lookDesired = new THREE.Vector3(
      car.pos.x + forward.x * (7 + speedRatio * 4),
      1.1,
      car.pos.z + forward.z * (7 + speedRatio * 4),
    );
    this.cameraLook.lerp(lookDesired, 1 - Math.exp(-9 * dt));
    this.camera.lookAt(this.cameraLook);
  }

  private updateWheels(dt: number): void {
    const spin = this.local.speed * dt;
    for (const wheel of this.local.model.wheels) {
      const axis = wheel.userData?.spinAxis === 'y' ? 'y' : wheel.userData?.spinAxis === 'z' ? 'z' : 'x';
      wheel.rotation[axis] += spin;
    }
  }

  private computePosition(): number {
    let ahead = 0;
    const car = this.local;
    for (const peer of this.peers.values()) {
      const target = peer.target;
      if (!target) continue;
      if (car.finished) {
        if (target.finished) ahead += 0;
        continue;
      }
      if (target.finished) {
        ahead += 1;
      } else if (target.progress > this.progress + 0.0005) {
        ahead += 1;
      }
    }
    return ahead + 1;
  }

  private emitHud(now: number, racing: boolean, elapsed: number): void {
    const car = this.local;
    let countdown: string | null = null;
    if (now < this.options.startAt) {
      countdown = String(Math.max(1, Math.ceil((this.options.startAt - now) / 1000)));
    } else if (now < this.options.startAt + 800 && racing) {
      countdown = '¡GO!';
    }

    this.options.onHud({
      speed: Math.round(Math.abs(car.speed) * 3.6),
      lap: Math.min(car.lapsDone + 1, this.options.laps),
      totalLaps: this.options.laps,
      position: Math.min(this.position, this.options.players.length),
      players: this.options.players.length,
      time: car.finished ? car.finishTime : elapsed,
      countdown,
      offroad: this.offroad && !car.finished,
      finished: car.finished,
    });
  }

  private emitFinish(): void {
    if (this.finishSent) return;
    this.finishSent = true;
    this.options.onFinished(this.local.finishTime);
  }

  private resetToTrack(): void {
    if (this.local.finished) return;
    const near = this.nearest(this.local.pos.x, this.local.pos.z);
    const point = this.track.samples[near.idx];
    const tangent = this.track.tangents[near.idx];
    this.local.pos.set(point.x, 0, point.z);
    this.local.heading = Math.atan2(tangent.x, tangent.z);
    this.local.speed = 0;
    this.local.prevIdx = near.idx;
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
      event.preventDefault();
    }
    this.keys.add(key === ' ' ? 'space' : key);
    if (key === 'r') this.resetToTrack();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    this.keys.delete(key === ' ' ? 'space' : key);
  };
}
