import type { CountryData } from '../geo/types';
import type { PopulationField } from '../population/field';

const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;
const MIN_SECONDARY_DISTANCE_KM = 120;

interface CityCandidate {
  lat: number;
  lon: number;
  population: number;
}

function wrap(value: number, limit: number): number {
  const wrapped = value % limit;
  return wrapped < 0 ? wrapped + limit : wrapped;
}

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

function countryAtCity(field: PopulationField, lat: number, lon: number): number {
  const baseRow = Math.floor((90 - lat) / field.cellSize);
  const baseCol = Math.floor((lon + 180) / field.cellSize);

  for (let radius = 0; radius <= 3; radius += 1) {
    for (let dr = -radius; dr <= radius; dr += 1) {
      const row = baseRow + dr;
      if (row < 0 || row >= field.height) continue;
      for (let dc = -radius; dc <= radius; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
        const col = wrap(baseCol + dc, field.width);
        const cell = row * field.width + col;
        if (field.landMask[cell] !== 1) continue;
        const id = field.countryGrid[cell];
        if (id !== undefined && id >= 0) return id;
      }
    }
  }

  return -1;
}

/**
 * Finds the furthest land cell from a country's primary capital. This is used
 * only when a country has no usable second settlement in the city dataset.
 */
function farthestLandCell(
  field: PopulationField,
  countryId: number,
  primaryLat: number,
  primaryLon: number,
): { lat: number; lon: number } | null {
  let bestDistance = -1;
  let best: { lat: number; lon: number } | null = null;

  for (let cell = 0; cell < field.countryGrid.length; cell += 1) {
    if (field.countryGrid[cell] !== countryId || field.landMask[cell] !== 1) continue;
    const row = Math.floor(cell / field.width);
    const lat = 90 - (row + 0.5) * field.cellSize;
    if (lat < -60) continue;
    const col = cell - row * field.width;
    const lon = -180 + (col + 0.5) * field.cellSize;
    const distance = greatCircleKm(primaryLat, primaryLon, lat, lon);
    if (distance > bestDistance) {
      bestDistance = distance;
      best = { lat, lon };
    }
  }

  return best;
}

/**
 * Enriches every country that has a primary capital with a secondary capital.
 * A large non-capital city is preferred; sparsely covered countries fall back
 * to the farthest land cell inside their own borders.
 */
export function assignSecondaryCapitals(
  countries: readonly CountryData[],
  cities: readonly number[],
  field: PopulationField,
  locateCountry?: (lat: number, lon: number) => string | null,
): void {
  const candidates = new Map<number, CityCandidate[]>();
  const indexByName = new Map(countries.map((country, index) => [country.name, index]));

  for (let i = 0; i + 2 < cities.length; i += 3) {
    const lat = cities[i] ?? 0;
    const lon = cities[i + 1] ?? 0;
    const population = cities[i + 2] ?? 0;
    if (!(population > 0)) continue;
    const locatedName = locateCountry?.(lat, lon) ?? null;
    const countryId = locatedName
      ? indexByName.get(locatedName) ?? -1
      : countryAtCity(field, lat, lon);
    if (countryId < 0) continue;
    const list = candidates.get(countryId);
    if (list) list.push({ lat, lon, population });
    else candidates.set(countryId, [{ lat, lon, population }]);
  }

  for (let index = 0; index < countries.length; index += 1) {
    const country = countries[index];
    if (!country || country.capitalLat === null || country.capitalLon === null) {
      continue;
    }

    const citiesInCountry = candidates.get(index) ?? [];
    let secondary: CityCandidate | null = null;
    for (const city of citiesInCountry) {
      if (
        greatCircleKm(country.capitalLat, country.capitalLon, city.lat, city.lon) <
        MIN_SECONDARY_DISTANCE_KM
      ) {
        continue;
      }
      if (!secondary || city.population > secondary.population) secondary = city;
    }

    const fallback = secondary
      ? null
      : farthestLandCell(field, index, country.capitalLat, country.capitalLon);
    const site = secondary ?? fallback;
    country.secondaryCapitalLat = site ? Math.round(site.lat * 1000) / 1000 : null;
    country.secondaryCapitalLon = site ? Math.round(site.lon * 1000) / 1000 : null;
  }
}