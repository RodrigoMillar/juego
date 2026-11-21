import * as THREE from 'three';
import { createCarModel } from '../carModel';
import type { CarConfig } from '../types';

function disposeObject(object: THREE.Object3D): void {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) m.dispose();
  });
}

export class GaragePreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly root = new THREE.Group();
  private model: THREE.Group | null = null;
  private raf = 0;
  private running = false;
  private lastTime = 0;
  private width = 0;
  private height = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.camera.position.set(0, 2.7, 9);
    this.camera.lookAt(0, 1, 0);

    this.scene.add(new THREE.HemisphereLight(0xa8c8ff, 0x0a0e18, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(5, 8, 6);
    this.scene.add(key);
    const rimPink = new THREE.DirectionalLight(0xff3ea5, 1.6);
    rimPink.position.set(-7, 3, -5);
    this.scene.add(rimPink);
    const rimCyan = new THREE.DirectionalLight(0x22d3ee, 1.6);
    rimCyan.position.set(7, 4, -4);
    this.scene.add(rimCyan);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(3.1, 3.35, 0.3, 48),
      new THREE.MeshStandardMaterial({ color: 0x0c1322, metalness: 0.55, roughness: 0.45 }),
    );
    platform.position.y = -0.16;
    this.scene.add(platform);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.02, 0.035, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    this.scene.add(ring);

    this.scene.add(this.root);
  }

  setCar(car: CarConfig): void {
    if (this.model) {
      this.root.remove(this.model);
      disposeObject(this.model);
    }
    this.model = createCarModel(car).group;
    this.root.add(this.model);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private loop = (time: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;

    this.resize();
    this.root.rotation.y += dt * 0.75;
    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width <= 0 || height <= 0 || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
