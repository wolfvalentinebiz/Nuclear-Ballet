import { fillPolygons } from '../geo/raster';
import { createLandMask } from '../geo/texture';
import type { CitiesData, CountriesData, LakeData, LandData } from '../geo/types';
import { PopulationField } from './field';

export const GRID_WIDTH = 1440;
export const GRID_HEIGHT = 720;

const CELL_SIZE = 180 / GRID_HEIGHT;
const EARTH_RADIUS_KM = 6371.0088;
const KM_PER_DEGREE = 111.195;
const DEG = Math.PI / 180;
const POPULATION_TARGET = 8.2e9;

function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = lat1 * DEG;
  const phi2 = lat2 * DEG;
  const dPhi = (lat2 - lat1) * DEG;
  const dLambda = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function countryColor(index: number): [number, number, number] {
  return [
    12 + ((index * 73) % 232),
    12 + ((index * 151) % 232),
    12 + ((index * 211) % 232),
  ];
}

function nearestCountry(
  red: number,
  green: number,
  blue: number,
  palette: ReadonlyArray<readonly [number, number, number]>,
): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i += 1) {
    const [pr, pg, pb] = palette[i];
    const distance = (red - pr) ** 2 + (green - pg) ** 2 + (blue - pb) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** Rasterizes each country in a unique color so cells can be assigned to a country. */
function buildCountryGrid(countries: CountriesData): Int16Array {
  const canvas = document.createElement('canvas');
  canvas.width = GRID_WIDTH;
  canvas.height = GRID_HEIGHT;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context is unavailable.');

  const palette: Array<[number, number, number]> = [];
  countries.countries.forEach((country, index) => {
    const [red, green, blue] = countryColor(index);
    palette.push([red, green, blue]);
    fillPolygons(ctx, country.polygons, GRID_WIDTH, GRID_HEIGHT, `rgb(${red},${green},${blue})`);
  });

  const pixels = ctx.getImageData(0, 0, GRID_WIDTH, GRID_HEIGHT).data;
  const grid = new Int16Array(GRID_WIDTH * GRID_HEIGHT).fill(-1);
  const exact = new Map<number, number>();
  palette.forEach(([red, green, blue], index) => {
    exact.set((red << 16) | (green << 8) | blue, index);
  });
  const nearestCache = new Map<number, number>();

  for (let i = 0; i < grid.length; i += 1) {
    const p = i * 4;
    if (pixels[p + 3] < 96) continue;

    const red = pixels[p];
    const green = pixels[p + 1];
    const blue = pixels[p + 2];
    const key = (red << 16) | (green << 8) | blue;

    let id = exact.get(key);
    if (id === undefined) {
      id = nearestCache.get(key);
      if (id === undefined) {
        id = nearestCountry(red, green, blue, palette);
        nearestCache.set(key, id);
      }
    }
    grid[i] = id;
  }

  return grid;
}

/**
 * Kernels each listed city by a population-scaled Gaussian. The kernel is
 * normalized inside its cutoff so no listed people are lost at the edge.
 */
function depositCities(cities: number[]): Float32Array {
  const urban = new Float32Array(GRID_WIDTH * GRID_HEIGHT);

  for (let c = 0; c < cities.length; c += 3) {
    const lat = cities[c];
    const lon = cities[c + 1];
    const population = cities[c + 2];
    if (!(population > 0)) continue;

    const sigmaDeg = Math.min(
      0.55,
      Math.max(0.2, 0.2 + 0.055 * Math.log10(population / 10_000)),
    );
    const sigmaKm = sigmaDeg * KM_PER_DEGREE;
    const cutoffKm = sigmaKm * 3;
    const latSpan = cutoffKm / KM_PER_DEGREE;
    const cosLat = Math.max(0.02, Math.cos(lat * DEG));
    const lonSpan = Math.min(180, latSpan / cosLat);

    const rowStart = Math.max(0, Math.floor((90 - lat - latSpan) / CELL_SIZE));
    const rowEnd = Math.min(
      GRID_HEIGHT - 1,
      Math.floor((90 - lat + latSpan) / CELL_SIZE),
    );

    const colStart = Math.floor((lon - lonSpan + 180) / CELL_SIZE);
    const colCount =
      lonSpan >= 180
        ? GRID_WIDTH
        : Math.min(GRID_WIDTH, Math.ceil((2 * lonSpan) / CELL_SIZE) + 1);
    const wrappedStart = ((colStart % GRID_WIDTH) + GRID_WIDTH) % GRID_WIDTH;

    let weightSum = 0;
    for (let row = rowStart; row <= rowEnd; row += 1) {
      const cellLat = 90 - (row + 0.5) * CELL_SIZE;
      for (let k = 0; k < colCount; k += 1) {
        const col = (wrappedStart + k) % GRID_WIDTH;
        const cellLon = -180 + (col + 0.5) * CELL_SIZE;
        const distance = greatCircleKm(lat, lon, cellLat, cellLon);
        if (distance <= cutoffKm) {
          weightSum += Math.exp(-(distance * distance) / (2 * sigmaKm * sigmaKm));
        }
      }
    }
    if (weightSum <= 0) continue;

    const scale = population / weightSum;
    for (let row = rowStart; row <= rowEnd; row += 1) {
      const cellLat = 90 - (row + 0.5) * CELL_SIZE;
      for (let k = 0; k < colCount; k += 1) {
        const col = (wrappedStart + k) % GRID_WIDTH;
        const cellLon = -180 + (col + 0.5) * CELL_SIZE;
        const distance = greatCircleKm(lat, lon, cellLat, cellLon);
        if (distance <= cutoffKm) {
          urban[row * GRID_WIDTH + col] +=
            Math.exp(-(distance * distance) / (2 * sigmaKm * sigmaKm)) * scale;
        }
      }
    }
  }

  return urban;
}

/** Separable box blur; three passes approximate a Gaussian. Wraps longitude. */
function blurField(
  source: Float32Array,
  radius: number,
  passes: number,
): Float32Array {
  const size = GRID_WIDTH * GRID_HEIGHT;
  const window = radius * 2 + 1;
  let current = source;
  let next: Float32Array = new Float32Array(size);
  const scratch = new Float32Array(size);

  for (let pass = 0; pass < passes; pass += 1) {
    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      const row = y * GRID_WIDTH;
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        sum += current[row + ((k % GRID_WIDTH) + GRID_WIDTH) % GRID_WIDTH];
      }
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        scratch[row + x] = sum / window;
        const leaving = ((x - radius) % GRID_WIDTH + GRID_WIDTH) % GRID_WIDTH;
        const entering = (x + radius + 1) % GRID_WIDTH;
        sum += current[row + entering] - current[row + leaving];
      }
    }

    for (let x = 0; x < GRID_WIDTH; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const y = Math.min(GRID_HEIGHT - 1, Math.max(0, k));
        sum += scratch[y * GRID_WIDTH + x];
      }
      for (let y = 0; y < GRID_HEIGHT; y += 1) {
        next[y * GRID_WIDTH + x] = sum / window;
        const leavingY = Math.min(GRID_HEIGHT - 1, Math.max(0, y - radius));
        const enteringY = Math.min(GRID_HEIGHT - 1, Math.max(0, y + radius + 1));
        sum += scratch[enteringY * GRID_WIDTH + x] - scratch[leavingY * GRID_WIDTH + x];
      }
    }

    const previous = current;
    current = next;
    next = previous;
  }

  return current;
}

/**
 * Builds the invisible population layer:
 *  - every listed city contributes a dense Gaussian core;
 *  - each country's remaining population is spread inside its own borders,
 *    weighted by proximity to its cities, so national totals stay realistic;
 *  - the world total is normalized to 8.2B for the current era.
 */
export function buildPopulationField(
  land: LandData,
  lakes: LakeData,
  countries: CountriesData,
  cities: CitiesData,
): PopulationField {
  const landMask = createLandMask(land, lakes, GRID_WIDTH, GRID_HEIGHT);
  const countryGrid = buildCountryGrid(countries);
  const urban = depositCities(cities.cities);
  const countryCount = countries.countries.length;

  const countryUrban = new Float64Array(countryCount);
  for (let i = 0; i < urban.length; i += 1) {
    const id = countryGrid[i];
    if (id >= 0) countryUrban[id] += urban[i];
  }

  const blurred = blurField(urban, 10, 3);
  let blurredOnLand = 0;
  let landCells = 0;
  for (let i = 0; i < landMask.length; i += 1) {
    if (landMask[i] === 1) {
      blurredOnLand += blurred[i];
      landCells += 1;
    }
  }
  const floorWeight = landCells > 0 ? (blurredOnLand / landCells) * 0.05 : 0;

  const cellWeight = new Float32Array(landMask.length);
  const countryWeight = new Float64Array(countryCount);
  for (let i = 0; i < cellWeight.length; i += 1) {
    if (landMask[i] === 0) continue;
    const id = countryGrid[i];
    if (id < 0) continue;
    const row = (i / GRID_WIDTH) | 0;
    const lat = 90 - (row + 0.5) * CELL_SIZE;
    if (lat < -60) continue;

    const weight = blurred[i] + floorWeight;
    cellWeight[i] = weight;
    countryWeight[id] += weight;
  }

  const grid = new Float32Array(urban);
  const countryScale = new Float64Array(countryCount);
  for (let id = 0; id < countryCount; id += 1) {
    const budget = Math.max(0, countries.countries[id].pop - countryUrban[id]);
    countryScale[id] = countryWeight[id] > 0 ? budget / countryWeight[id] : 0;
  }

  for (let i = 0; i < grid.length; i += 1) {
    const id = countryGrid[i];
    if (id >= 0 && cellWeight[i] > 0) {
      grid[i] += cellWeight[i] * countryScale[id];
    }
  }

  let total = 0;
  for (let i = 0; i < grid.length; i += 1) total += grid[i];
  if (total > 0) {
    const scale = POPULATION_TARGET / total;
    for (let i = 0; i < grid.length; i += 1) grid[i] *= scale;
    total *= scale;
  }

  console.info(
    `[population] ${(total / 1e9).toFixed(2)}B over ${landCells.toLocaleString()} land cells`,
  );

  return new PopulationField(GRID_WIDTH, GRID_HEIGHT, grid, landMask, countryGrid);
}
