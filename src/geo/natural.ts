import { fillPolygons } from './raster';
import type { LakeData, LandData } from './types';

export type NaturalKind = 'mountain' | 'desert' | 'jungle' | 'wetland' | 'ice';

export interface NaturalRegion {
  name: string;
  kind: NaturalKind;
  /** Flat [lon, lat, ...] polygon. */
  ring: readonly number[];
}

export interface NaturalKindInfo {
  label: string;
  color: string;
  pattern: 'peaks' | 'dots' | 'hatch' | 'dashes' | 'grid';
}

export const NATURAL_KIND_INFO: Record<NaturalKind, NaturalKindInfo> = {
  mountain: { label: 'MOUNTAINS', color: '#d8d2c0', pattern: 'peaks' },
  desert: { label: 'DESERT', color: '#d8b66d', pattern: 'dots' },
  jungle: { label: 'JUNGLE', color: '#4f8c5b', pattern: 'hatch' },
  wetland: { label: 'WETLANDS', color: '#6d9b9a', pattern: 'dashes' },
  ice: { label: 'ICE / TUNDRA', color: '#c4e0e7', pattern: 'grid' },
};

export const NATURAL_KIND_ORDER: readonly NaturalKind[] = [
  'mountain',
  'desert',
  'jungle',
  'wetland',
  'ice',
];

/** Higher costs make the occupied-area contour stall inside rough ground. */
export const NATURAL_MOVEMENT_COST: Record<NaturalKind, number> = {
  mountain: 5.5,
  desert: 2.2,
  jungle: 3.2,
  wetland: 4.2,
  ice: 6,
};

/** Combat is much slower when the shared border itself lies in rough ground. */
export const NATURAL_DEFENSE_MULTIPLIER: Record<NaturalKind, number> = {
  mountain: 4,
  desert: 1.8,
  jungle: 2.5,
  wetland: 3.2,
  ice: 4,
};

/**
 * Broad, deliberately simplified natural barriers. These are game data rather
 * than a physical elevation model: each region makes ground difficult for a
 * military front, whether or not the natural map mode is visible.
 */
export const NATURAL_REGIONS: readonly NaturalRegion[] = [
  {
    name: 'Rocky Mountains',
    kind: 'mountain',
    ring: [-168, 63, -150, 58, -132, 54, -121, 47, -114, 39, -109, 31, -104, 22,
      -100, 26, -106, 36, -113, 45, -124, 51, -140, 57, -160, 59, -170, 61],
  },
  {
    name: 'Sierra Nevada',
    kind: 'mountain',
    ring: [-123, 42, -120, 37, -116, 34, -117, 39, -121, 42],
  },
  {
    name: 'Appalachians',
    kind: 'mountain',
    ring: [-84, 35, -80, 33, -76, 36, -72, 42, -68, 47, -65, 48, -68, 44,
      -74, 39, -79, 35, -83, 34],
  },
  {
    name: 'Andes',
    kind: 'mountain',
    ring: [-79, 9, -75, 2, -72, -5, -70, -18, -71, -30, -73, -42, -72, -52,
      -68, -55, -66, -50, -67, -40, -66, -30, -65, -15, -69, -2, -74, 7],
  },
  {
    name: 'Himalayas',
    kind: 'mountain',
    ring: [66, 36, 78, 37, 92, 33, 101, 28, 96, 24, 88, 27, 79, 29, 69, 31, 62, 34],
  },
  {
    name: 'Tibetan Plateau',
    kind: 'mountain',
    ring: [74, 37, 86, 40, 98, 34, 100, 28, 89, 26, 79, 29, 72, 33],
  },
  {
    name: 'Tian Shan',
    kind: 'mountain',
    ring: [67, 42, 82, 45, 94, 44, 96, 40, 86, 39, 76, 39, 68, 39],
  },
  {
    name: 'Altai',
    kind: 'mountain',
    ring: [84, 52, 94, 54, 101, 49, 96, 46, 88, 48],
  },
  {
    name: 'Urals',
    kind: 'mountain',
    ring: [58, 69, 67, 65, 64, 56, 59, 48, 55, 42, 52, 47, 56, 57, 60, 64],
  },
  {
    name: 'Caucasus',
    kind: 'mountain',
    ring: [37, 42, 44, 45, 50, 43, 49, 40, 43, 41, 39, 39],
  },
  {
    name: 'Zagros',
    kind: 'mountain',
    ring: [43, 39, 47, 36, 53, 30, 58, 26, 55, 24, 49, 30, 45, 34, 41, 37],
  },
  {
    name: 'Alps',
    kind: 'mountain',
    ring: [5, 44, 8, 47, 15, 48, 20, 46, 17, 44, 11, 45, 7, 43],
  },
  {
    name: 'Pyrenees',
    kind: 'mountain',
    ring: [-2, 43, 3, 43, 4, 42, 0, 41, -2, 42],
  },
  {
    name: 'Atlas',
    kind: 'mountain',
    ring: [-10, 30, -4, 35, 8, 36, 10, 33, 3, 30, -4, 29, -9, 28],
  },
  {
    name: 'Scandinavian Mountains',
    kind: 'mountain',
    ring: [5, 58, 9, 63, 16, 69, 24, 71, 28, 68, 20, 63, 13, 60, 7, 56],
  },
  {
    name: 'Ethiopian Highlands',
    kind: 'mountain',
    ring: [35, 14, 40, 14, 43, 10, 40, 5, 35, 7, 33, 10],
  },
  {
    name: 'East African Rift',
    kind: 'mountain',
    ring: [29, -3, 34, 0, 38, 5, 36, 8, 31, 5, 28, 1],
  },
  {
    name: 'Drakensberg',
    kind: 'mountain',
    ring: [27, -23, 31, -26, 32, -31, 28, -34, 24, -30, 23, -26],
  },
  {
    name: 'Great Dividing Range',
    kind: 'mountain',
    ring: [143, -16, 148, -20, 153, -28, 152, -37, 147, -39, 144, -34,
      147, -25, 142, -19],
  },
  {
    name: 'Southern Alps',
    kind: 'mountain',
    ring: [166, -46, 170, -43, 174, -39, 177, -38, 174, -42, 169, -46, 166, -47],
  },
  {
    name: 'Japanese Alps',
    kind: 'mountain',
    ring: [136, 36, 140, 38, 143, 35, 139, 34, 134, 35],
  },
  {
    name: 'Anatolian Plateau',
    kind: 'mountain',
    ring: [27, 38, 35, 42, 44, 40, 43, 36, 35, 37],
  },
  {
    name: 'Central American Cordillera',
    kind: 'mountain',
    ring: [-92, 15, -88, 14, -84, 10, -79, 8, -80, 11, -86, 15],
  },
  {
    name: 'Sahara',
    kind: 'desert',
    ring: [-17, 28, -8, 34, 6, 35, 20, 33, 32, 31, 37, 24, 35, 17, 24, 14,
      10, 15, -2, 18, -12, 21],
  },
  {
    name: 'Arabian Desert',
    kind: 'desert',
    ring: [35, 30, 44, 33, 55, 28, 58, 22, 53, 15, 44, 14, 38, 20],
  },
  {
    name: 'Gobi Desert',
    kind: 'desert',
    ring: [78, 44, 92, 48, 108, 46, 116, 40, 108, 36, 92, 39, 82, 41],
  },
  {
    name: 'Taklamakan',
    kind: 'desert',
    ring: [76, 41, 86, 42, 91, 39, 86, 37, 78, 38],
  },
  {
    name: 'Karakum and Kyzylkum',
    kind: 'desert',
    ring: [55, 44, 66, 46, 75, 43, 73, 38, 62, 37, 56, 40],
  },
  {
    name: 'Kalahari',
    kind: 'desert',
    ring: [14, -18, 22, -19, 27, -24, 25, -31, 16, -30, 12, -24],
  },
  {
    name: 'Great Victoria Desert',
    kind: 'desert',
    ring: [121, -26, 135, -25, 142, -30, 136, -34, 123, -33, 117, -29],
  },
  {
    name: 'Thar Desert',
    kind: 'desert',
    ring: [69, 28, 74, 30, 77, 25, 72, 23, 67, 24],
  },
  {
    name: 'Atacama Desert',
    kind: 'desert',
    ring: [-72, -18, -68, -21, -68, -28, -72, -27, -73, -23],
  },
  {
    name: 'Patagonian Desert',
    kind: 'desert',
    ring: [-71, -38, -65, -40, -64, -48, -69, -51, -72, -45],
  },
  {
    name: 'Great Basin',
    kind: 'desert',
    ring: [-120, 42, -111, 43, -109, 36, -115, 34, -119, 37],
  },
  {
    name: 'Sonoran Desert',
    kind: 'desert',
    ring: [-117, 34, -108, 33, -104, 27, -110, 24, -114, 28],
  },
  {
    name: 'Amazon Rainforest',
    kind: 'jungle',
    ring: [-77, 4, -65, 6, -50, 2, -47, -6, -58, -12, -72, -9, -78, -2],
  },
  {
    name: 'Congo Rainforest',
    kind: 'jungle',
    ring: [8, 4, 18, 5, 27, 1, 29, -5, 23, -9, 14, -8, 9, -3],
  },
  {
    name: 'Southeast Asian Jungle',
    kind: 'jungle',
    ring: [94, 24, 104, 22, 110, 15, 108, 4, 100, 0, 96, 6, 97, 15],
  },
  {
    name: 'New Guinea Jungle',
    kind: 'jungle',
    ring: [130, -1, 144, -3, 152, -8, 144, -10, 132, -7],
  },
  {
    name: 'Borneo Jungle',
    kind: 'jungle',
    ring: [108, 6, 118, 7, 121, 0, 118, -4, 111, -3, 107, 1],
  },
  {
    name: 'Sumatra Jungle',
    kind: 'jungle',
    ring: [95, 5, 101, 3, 105, -3, 102, -6, 97, -2],
  },
  {
    name: 'Madagascar Highlands',
    kind: 'jungle',
    ring: [48, -12, 51, -17, 49, -25, 45, -25, 44, -18],
  },
  {
    name: 'Mesoamerican Jungle',
    kind: 'jungle',
    ring: [-92, 18, -86, 17, -82, 11, -78, 8, -82, 13, -88, 16],
  },
  {
    name: 'Atlantic Forest',
    kind: 'jungle',
    ring: [-43, -6, -37, -8, -40, -20, -48, -25, -49, -18],
  },
  {
    name: 'Northern Australian Jungle',
    kind: 'jungle',
    ring: [128, -11, 142, -12, 146, -17, 137, -18, 130, -16],
  },
  {
    name: 'Pantanal',
    kind: 'wetland',
    ring: [-60, -14, -53, -16, -51, -23, -58, -25, -62, -20],
  },
  {
    name: 'Sundarbans',
    kind: 'wetland',
    ring: [86, 24, 92, 24, 93, 21, 88, 20],
  },
  {
    name: 'Everglades',
    kind: 'wetland',
    ring: [-83, 27, -79, 27, -79, 24, -84, 24],
  },
  {
    name: 'Okavango Delta',
    kind: 'wetland',
    ring: [20, -17, 25, -18, 24, -23, 20, -24, 19, -20],
  },
  {
    name: 'Siberian Lowlands',
    kind: 'wetland',
    ring: [60, 60, 90, 64, 110, 68, 80, 72, 58, 68],
  },
  {
    name: 'Mekong Delta',
    kind: 'wetland',
    ring: [104, 11, 109, 11, 109, 8, 104, 8],
  },
  {
    name: 'Sudd',
    kind: 'wetland',
    ring: [28, 12, 35, 12, 34, 5, 28, 5],
  },
  {
    name: 'Greenland Ice Sheet',
    kind: 'ice',
    ring: [-60, 83, -20, 80, -18, 65, -43, 58, -62, 67, -66, 76],
  },
  {
    name: 'Canadian Arctic',
    kind: 'ice',
    ring: [-125, 78, -62, 74, -60, 64, -90, 62, -120, 70],
  },
  {
    name: 'Siberian Tundra',
    kind: 'ice',
    ring: [60, 72, 150, 75, 179, 69, 170, 62, 110, 62, 70, 65],
  },
];

const refinedRingCache = new Map<string, readonly number[]>();

function edgeNoise(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Natural barriers are not survey polygons. Subdividing each edge and adding
 * a deterministic, low-frequency wobble gives the map layer irregular coasts
 * and a much more legible silhouette at high zoom.
 */
function refinedRing(region: NaturalRegion, regionIndex: number): readonly number[] {
  const cached = refinedRingCache.get(region.name);
  if (cached) return cached;

  const points: number[] = [];
  const ring = region.ring;
  const count = ring.length / 2;
  const seed = regionIndex * 1.618 + region.name.length * 0.37;

  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    const lon1 = ring[i * 2] ?? 0;
    const lat1 = ring[i * 2 + 1] ?? 0;
    const lon2 = ring[j * 2] ?? 0;
    const lat2 = ring[j * 2 + 1] ?? 0;
    let dLon = lon2 - lon1;
    if (dLon > 180) dLon -= 360;
    else if (dLon < -180) dLon += 360;
    const dLat = lat2 - lat1;
    const length = Math.hypot(dLon, dLat);
    const steps = Math.max(1, Math.ceil(length / 1.15));

    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const lon = lon1 + dLon * t;
      const lat = lat1 + dLat * t;
      points.push(lon, lat);

      if (step === 0 || length < 0.25) continue;
      const envelope = Math.sin(Math.PI * t);
      const perpendicularLon = -dLat / length;
      const perpendicularLat = dLon / length;
      const ripples =
        Math.sin(t * Math.PI * 2.7 + seed) * 0.18 +
        Math.sin(t * Math.PI * 6.1 + seed * 2.3) * 0.08;
      const grain = (edgeNoise(lon * 1.7 + seed, lat * 2.1 - seed) - 0.5) * 0.34;
      const offset = envelope * (ripples + grain);
      const lonScale = 1 / Math.max(0.28, Math.cos((lat * Math.PI) / 180));
      points.push(lon + perpendicularLon * offset * lonScale, lat + perpendicularLat * offset);
    }
  }

  refinedRingCache.set(region.name, points);
  return points;
}

function pointInRing(lon: number, lat: number, ring: readonly number[]): boolean {
  let inside = false;
  const count = ring.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const xi = ring[i * 2] ?? 0;
    const yi = ring[i * 2 + 1] ?? 0;
    const xj = ring[j * 2] ?? 0;
    const yj = ring[j * 2 + 1] ?? 0;
    const crosses = yi > lat !== yj > lat;
    if (
      crosses &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** The natural barrier covering a point, if any. */
export function naturalRegionAt(lat: number, lon: number): NaturalRegion | null {
  for (let index = 0; index < NATURAL_REGIONS.length; index += 1) {
    const region = NATURAL_REGIONS[index];
    if (!region) continue;
    if (pointInRing(lon, lat, refinedRing(region, index))) return region;
  }
  return null;
}

/** The stronger the ground, the more attackers it takes to keep moving. */
export function naturalDefenseMultiplierAt(lat: number, lon: number): number {
  const region = naturalRegionAt(lat, lon);
  return region ? NATURAL_DEFENSE_MULTIPLIER[region.kind] : 1;
}

function wildcardColor(color: string, alpha: number): string {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function makePattern(pattern: NaturalKindInfo['pattern']): CanvasPattern | null {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.lineWidth = 1;
  if (pattern === 'peaks') {
    ctx.strokeStyle = 'rgba(20, 24, 22, 0.5)';
    ctx.beginPath();
    ctx.moveTo(1, 11);
    ctx.lineTo(5, 5);
    ctx.lineTo(8, 9);
    ctx.lineTo(12, 2);
    ctx.lineTo(15, 8);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.48)';
    ctx.beginPath();
    ctx.moveTo(3, 13);
    ctx.lineTo(7, 7);
    ctx.lineTo(10, 11);
    ctx.lineTo(13, 4);
    ctx.stroke();
  } else if (pattern === 'dots') {
    ctx.fillStyle = 'rgba(74, 50, 21, 0.42)';
    for (const [x, y] of [[2, 3], [9, 1], [13, 7], [5, 10], [11, 13]]) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === 'hatch') {
    ctx.strokeStyle = 'rgba(10, 34, 18, 0.43)';
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(12, 0);
    ctx.moveTo(4, 16);
    ctx.lineTo(16, 4);
    ctx.stroke();
  } else if (pattern === 'dashes') {
    ctx.strokeStyle = 'rgba(18, 49, 51, 0.45)';
    ctx.beginPath();
    ctx.moveTo(1, 4);
    ctx.lineTo(7, 4);
    ctx.moveTo(9, 12);
    ctx.lineTo(15, 12);
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(69, 112, 126, 0.36)';
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(16, 4);
    ctx.moveTo(4, 0);
    ctx.lineTo(4, 16);
    ctx.stroke();
  }

  return ctx.createPattern(canvas, 'repeat');
}

function regionPath(
  region: NaturalRegion,
  regionIndex: number,
  width: number,
  height: number,
): Path2D {
  const path = new Path2D();
  const ring = refinedRing(region, regionIndex);
  for (let i = 0; i < ring.length; i += 2) {
    const x = ((ring[i] + 180) / 360) * width;
    const y = ((90 - ring[i + 1]) / 180) * height;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

/**
 * Rasterized obstacle map for the globe shader. Transparent pixels are normal
 * terrain; coloured, textured pixels are difficult ground.
 */
export function createNaturalCanvas(
  land: LandData,
  lakes: LakeData,
  width = 4096,
  height = 2048,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable.');

  const patterns = new Map<NaturalKind, CanvasPattern | null>();
  for (const kind of Object.keys(NATURAL_KIND_INFO) as NaturalKind[]) {
    patterns.set(kind, makePattern(NATURAL_KIND_INFO[kind].pattern));
  }

  for (let index = 0; index < NATURAL_REGIONS.length; index += 1) {
    const region = NATURAL_REGIONS[index];
    if (!region) continue;
    const info = NATURAL_KIND_INFO[region.kind];
    const path = regionPath(region, index, width, height);

    ctx.save();
    ctx.fillStyle = wildcardColor(info.color, 0.9);
    ctx.fill(path);
    const pattern = patterns.get(region.kind);
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fill(path);
    }
    // A dark, irregular keyline keeps neighbouring slow areas readable at
    // both globe scale and close zoom.
    ctx.strokeStyle = 'rgba(8, 11, 9, 0.48)';
    ctx.lineWidth = 1.4;
    ctx.stroke(path);
    ctx.restore();
  }

  const landMask = document.createElement('canvas');
  landMask.width = width;
  landMask.height = height;
  const maskCtx = landMask.getContext('2d');
  if (!maskCtx) throw new Error('2D canvas context is unavailable.');

  fillPolygons(maskCtx, land.polygons, width, height, '#ffffff');
  maskCtx.globalCompositeOperation = 'destination-out';
  fillPolygons(maskCtx, lakes.polygons, width, height, '#000000');

  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(landMask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  return canvas;
}

/**
 * A categorical raster of the same refined obstacle shapes. Values are 1..5
 * for the natural kinds, or 0 for ordinary ground/water. The war map uses
 * this for weighted front propagation.
 */
export function createNaturalField(
  land: LandData,
  lakes: LakeData,
  width: number,
  height: number,
): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context is unavailable.');

  for (let index = 0; index < NATURAL_REGIONS.length; index += 1) {
    const region = NATURAL_REGIONS[index];
    if (!region) continue;
    const code = NATURAL_KIND_ORDER.indexOf(region.kind) + 1;
    const channel = code * 40;
    ctx.fillStyle = `rgb(${channel}, ${channel}, ${channel})`;
    ctx.fill(regionPath(region, index, width, height));
  }

  const landMask = document.createElement('canvas');
  landMask.width = width;
  landMask.height = height;
  const maskCtx = landMask.getContext('2d');
  if (!maskCtx) throw new Error('2D canvas context is unavailable.');
  fillPolygons(maskCtx, land.polygons, width, height, '#ffffff');
  maskCtx.globalCompositeOperation = 'destination-out';
  fillPolygons(maskCtx, lakes.polygons, width, height, '#000000');

  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(landMask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  const pixels = ctx.getImageData(0, 0, width, height).data;
  const field = new Uint8Array(width * height);
  for (let i = 0; i < field.length; i += 1) {
    const alpha = pixels[i * 4 + 3];
    if (alpha < 64) continue;
    const code = Math.round(pixels[i * 4] / 40);
    field[i] = Math.max(1, Math.min(NATURAL_KIND_ORDER.length, code));
  }
  return field;
}

export function naturalKindForFieldCode(code: number): NaturalKind | null {
  return NATURAL_KIND_ORDER[code - 1] ?? null;
}
