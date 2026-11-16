import * as THREE from 'three';
import { geoToWorld } from './orientation';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const SURFACE_RADIUS = 1.003;
const FACING_EPSILON = 0.01;
const DOT_SIZE = 4;
const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;

function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = lat1 * RAD;
  const phi2 = lat2 * RAD;
  const dPhi = (lat2 - lat1) * RAD;
  const dLambda = (lon2 - lon1) * RAD;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

interface CityEntry {
  normal: THREE.Vector3;
  position: THREE.Vector3;
  alive: boolean;
}

/** A screen-space network of small black city dots with strike deletion. */
export class CityLayer {
  readonly canvas: HTMLCanvasElement;

  private readonly ctx: CanvasRenderingContext2D;
  private entries: CityEntry[] = [];
  private visible = true;
  private readonly toCamera = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = STAGE_WIDTH;
    this.canvas.height = STAGE_HEIGHT;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create the city overlay context.');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  setCities(cities: readonly number[]): void {
    this.entries = [];
    for (let i = 0; i + 2 < cities.length; i += 3) {
      const lat = cities[i];
      const lon = cities[i + 1];
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const normal = geoToWorld(lat, lon);
      this.entries.push({
        normal,
        position: normal.clone().multiplyScalar(SURFACE_RADIUS),
        alive: true,
      });
    }
  }

  get count(): number {
    return this.entries.length;
  }

  get litCount(): number {
    return this.entries.reduce((total, entry) => total + (entry.alive ? 1 : 0), 0);
  }

  /** Removes every city marker inside a nuclear strike radius. */
  blackout(lat: number, lon: number, radiusKm: number): number {
    let removed = 0;
    for (const entry of this.entries) {
      if (!entry.alive) continue;
      const entryLat = THREE.MathUtils.radToDeg(Math.asin(entry.normal.y));
      const entryLon = THREE.MathUtils.radToDeg(
        Math.atan2(-entry.normal.z, entry.normal.x),
      );
      if (greatCircleKm(lat, lon, entryLat, entryLon) <= radiusKm) {
        entry.alive = false;
        removed += 1;
      }
    }
    return removed;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.canvas.hidden = !visible;
    if (!visible) this.clear();
  }

  render(camera: THREE.Camera): void {
    this.clear();
    if (!this.visible) return;

    camera.updateMatrixWorld();
    const cameraPosition = camera.position;
    this.ctx.fillStyle = '#000000';

    for (const entry of this.entries) {
      if (!entry.alive) continue;
      this.toCamera.subVectors(cameraPosition, entry.position);
      const distance = this.toCamera.length();
      if (distance === 0) continue;
      this.toCamera.divideScalar(distance);
      if (entry.normal.dot(this.toCamera) <= FACING_EPSILON) continue;

      this.projected.copy(entry.position).project(camera);
      if (this.projected.z < -1 || this.projected.z > 1) continue;

      const x = (this.projected.x * 0.5 + 0.5) * STAGE_WIDTH;
      const y = (1 - (this.projected.y * 0.5 + 0.5)) * STAGE_HEIGHT;
      if (x < 0 || x > STAGE_WIDTH || y < 0 || y > STAGE_HEIGHT) continue;
      this.ctx.fillRect(Math.round(x), Math.round(y), DOT_SIZE, DOT_SIZE);
    }
  }

  private clear(): void {
    this.ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  }
}