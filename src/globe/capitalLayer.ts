import * as THREE from 'three';
import type { CountryData } from '../geo/types';
import { geoToWorld } from './orientation';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const STAR_SIZE = 28;
const SQUARE_SIZE = 16;
const SURFACE_RADIUS = 1.004;
const FACING_EPSILON = 0.01;
const EARTH_RADIUS_KM = 6371.0088;
const CAPITAL_COLLIDER_KM = 90;

interface CapitalEntry {
  name: string;
  lat: number;
  lon: number;
  kind: 'primary' | 'secondary';
  normal: THREE.Vector3;
  position: THREE.Vector3;
}

function createStarCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = STAR_SIZE;
  canvas.height = STAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create the capital star icon.');

  const center = STAR_SIZE / 2;
  const scale = STAR_SIZE / 14;
  const outer = 6.1 * scale;
  const inner = 2.8 * scale;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  // A very thin paper-coloured keyline keeps the black star legible over
  // both the bright terrain and the dark ocean/night side.
  ctx.fillStyle = '#000000';
  ctx.fill();
  ctx.strokeStyle = 'rgba(233, 226, 208, 0.88)';
  ctx.lineWidth = scale;
  ctx.stroke();

  return canvas;
}

function createSecondarySquare(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SQUARE_SIZE;
  canvas.height = SQUARE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create the secondary capital icon.');

  const scale = SQUARE_SIZE / 8;
  ctx.fillStyle = 'rgba(233, 226, 208, 0.88)';
  ctx.fillRect(scale, scale, 6 * scale, 6 * scale);
  ctx.fillStyle = '#000000';
  ctx.fillRect(2 * scale, 2 * scale, 4 * scale, 4 * scale);
  return canvas;
}

/**
 * Fixed-size black capital stars over the Earth. The markers sit on a second
 * 2D canvas so they remain crisp and screen-sized independent of globe zoom.
 */
export class CapitalLayer {
  readonly canvas: HTMLCanvasElement;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly star = createStarCanvas();
  private readonly square = createSecondarySquare();
  private entries: CapitalEntry[] = [];
  private visible = true;
  private readonly toCamera = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = STAGE_WIDTH;
    this.canvas.height = STAGE_HEIGHT;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create the capital overlay context.');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  setCountries(countries: readonly CountryData[]): void {
    this.entries = [];
    for (const country of countries) {
      if (country.capitalLat !== null && country.capitalLon !== null) {
        this.addEntry(country.name, country.capitalLat, country.capitalLon, 'primary');
      }
      if (
        country.secondaryCapitalLat !== null &&
        country.secondaryCapitalLat !== undefined &&
        country.secondaryCapitalLon !== null &&
        country.secondaryCapitalLon !== undefined
      ) {
        this.addEntry(
          country.name,
          country.secondaryCapitalLat,
          country.secondaryCapitalLon,
          'secondary',
        );
      }
    }
  }

  private addEntry(
    name: string,
    lat: number,
    lon: number,
    kind: CapitalEntry['kind'],
  ): void {
    const normal = geoToWorld(lat, lon);
    this.entries.push({
      name,
      lat,
      lon,
      kind,
      normal,
      position: normal.clone().multiplyScalar(SURFACE_RADIUS),
    });
  }

  get count(): number {
    return this.entries.length;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.canvas.hidden = !visible;
    if (!visible) this.clear();
  }

  get primaryCount(): number {
    return this.entries.filter((entry) => entry.kind === 'primary').length;
  }

  get secondaryCount(): number {
    return this.entries.filter((entry) => entry.kind === 'secondary').length;
  }

  /** Prevent construction icons from covering a primary or secondary capital. */
  blocksBuilding(lat: number, lon: number): boolean {
    const normal = geoToWorld(lat, lon);
    const threshold = Math.cos(CAPITAL_COLLIDER_KM / EARTH_RADIUS_KM);
    return this.entries.some((entry) => normal.dot(entry.normal) >= threshold);
  }

  render(camera: THREE.Camera): void {
    this.clear();
    if (!this.visible) return;

    camera.updateMatrixWorld();
    const cameraPosition = camera.position;

    for (const entry of this.entries) {
      this.toCamera.subVectors(cameraPosition, entry.position);
      const distance = this.toCamera.length();
      if (distance === 0) continue;
      this.toCamera.divideScalar(distance);
      if (entry.normal.dot(this.toCamera) <= FACING_EPSILON) continue;

      this.projected.copy(entry.position).project(camera);
      if (this.projected.z < -1 || this.projected.z > 1) continue;

      const x = (this.projected.x * 0.5 + 0.5) * STAGE_WIDTH;
      const y = (1 - (this.projected.y * 0.5 + 0.5)) * STAGE_HEIGHT;
      if (
        x < -STAR_SIZE ||
        x > STAGE_WIDTH + STAR_SIZE ||
        y < -STAR_SIZE ||
        y > STAGE_HEIGHT + STAR_SIZE
      ) {
        continue;
      }

      const icon = entry.kind === 'primary' ? this.star : this.square;
      const size = entry.kind === 'primary' ? STAR_SIZE : SQUARE_SIZE;
      this.ctx.drawImage(icon, Math.round(x) - size / 2, Math.round(y) - size / 2);
    }
  }

  private clear(): void {
    this.ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  }
}
