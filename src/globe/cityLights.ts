import * as THREE from 'three';

const WIDTH = 4096;
const HEIGHT = 2048;
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

function createGlowSprite(): HTMLCanvasElement {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable.');

  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255, 252, 240, 1)');
  gradient.addColorStop(0.14, 'rgba(255, 243, 210, 0.95)');
  gradient.addColorStop(0.34, 'rgba(255, 226, 165, 0.42)');
  gradient.addColorStop(0.62, 'rgba(255, 200, 120, 0.12)');
  gradient.addColorStop(1, 'rgba(255, 190, 100, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/**
 * Warm city glows baked into an equirectangular alpha texture. Strikes
 * extinguish every settlement inside their radius and repaint the texture,
 * so the night side darkens along with the population heatmap.
 */
export class CityLights {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly glow: HTMLCanvasElement;
  private readonly lat: Float32Array;
  private readonly lon: Float32Array;
  private readonly population: Float32Array;
  private readonly alive: Uint8Array;
  private readonly count: number;

  constructor(cities: number[]) {
    this.count = Math.floor(cities.length / 3);
    this.lat = new Float32Array(this.count);
    this.lon = new Float32Array(this.count);
    this.population = new Float32Array(this.count);
    this.alive = new Uint8Array(this.count);

    for (let i = 0; i < this.count; i += 1) {
      this.lat[i] = cities[i * 3] ?? 0;
      this.lon[i] = cities[i * 3 + 1] ?? 0;
      this.population[i] = cities[i * 3 + 2] ?? 0;
      this.alive[i] = 1;
    }

    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is unavailable.');
    this.ctx = ctx;
    this.glow = createGlowSprite();

    this.paint();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = true;
  }

  get litCities(): number {
    let lit = 0;
    for (let i = 0; i < this.count; i += 1) lit += this.alive[i] ?? 0;
    return lit;
  }

  /** Extinguishes cities inside the radius. Returns how many went dark. */
  blackout(lat: number, lon: number, radiusKm: number): number {
    let extinguished = 0;

    for (let i = 0; i < this.count; i += 1) {
      if (this.alive[i] === 0) continue;
      if (greatCircleKm(lat, lon, this.lat[i] ?? 0, this.lon[i] ?? 0) <= radiusKm) {
        this.alive[i] = 0;
        extinguished += 1;
      }
    }

    if (extinguished > 0) {
      this.paint();
      this.texture.needsUpdate = true;
    }

    return extinguished;
  }

  private paint(): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < this.count; i += 1) {
      if (this.alive[i] === 0) continue;
      const population = this.population[i] ?? 0;
      if (population <= 0) continue;

      const magnitude = Math.min(
        1,
        Math.max(0, (Math.log10(population) - 4) / 3.4),
      );
      const size = 4 + magnitude * 22;
      const alpha = 0.35 + magnitude * 0.65;
      const x = ((this.lon[i]! + 180) / 360) * WIDTH;
      const y = ((90 - this.lat[i]!) / 180) * HEIGHT;

      ctx.globalAlpha = alpha;
      this.draw(x, y, size);

      if (x < size / 2) this.draw(x + WIDTH, y, size);
      else if (x > WIDTH - size / 2) this.draw(x - WIDTH, y, size);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private draw(x: number, y: number, size: number): void {
    this.ctx.drawImage(this.glow, x - size / 2, y - size / 2, size, size);
  }
}
