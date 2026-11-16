import type { CountriesData, CountryData, FlatRing, Polygon, PolygonSet } from './types';

interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface CountryMatch {
  index: number;
  country: CountryData;
  bounds: Bounds;
}

function pointInRing(ring: FlatRing, lon: number, lat: number): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i] ?? 0;
    const yi = ring[i + 1] ?? 0;
    const xj = ring[j] ?? 0;
    const yj = ring[j + 1] ?? 0;
    const crosses = yi > lat !== yj > lat;

    if (crosses && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(polygon: Polygon, lon: number, lat: number): boolean {
  let inside = false;
  for (const ring of polygon) {
    if (pointInRing(ring, lon, lat)) inside = !inside;
  }
  return inside;
}

/** Point-in-country test that also handles polygons crossing the antimeridian. */
export function polygonSetContainsPoint(
  polygons: PolygonSet,
  lon: number,
  lat: number,
): boolean {
  for (const shift of [0, 360, -360]) {
    const x = lon + shift;
    for (const polygon of polygons) {
      if (pointInPolygon(polygon, x, lat)) return true;
    }
  }
  return false;
}

/**
 * True when a polygon edge is now inside a merged country after annexation.
 * Sampling both sides of the edge removes the old shared boundary without
 * needing to stitch differently segmented Natural Earth rings together.
 */
export function isInternalCountryEdge(
  country: CountryData,
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): boolean {
  const dLon = lon2 - lon1;
  const dLat = lat2 - lat1;
  const midLat = (lat1 + lat2) / 2;
  const cosLat = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  const length = Math.hypot(dLon * cosLat, dLat);
  if (!(length > 1e-9)) return false;

  // A small geographic offset crosses one border without jumping across a
  // narrow country. The longitude component is corrected for latitude.
  const offset = 0.012;
  const offsetLon = (-dLat / length) * (offset / cosLat);
  const offsetLat = (dLon * cosLat / length) * offset;
  const midLon = (lon1 + lon2) / 2;

  return (
    polygonSetContainsPoint(country.polygons, midLon + offsetLon, midLat + offsetLat) &&
    polygonSetContainsPoint(country.polygons, midLon - offsetLon, midLat - offsetLat)
  );
}

function boundsOf(polygons: PolygonSet): Bounds {
  let minLat = 90;
  let maxLat = -90;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length; i += 2) {
        const lon = ring[i] ?? 0;
        const lat = ring[i + 1] ?? 0;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      }
    }
  }

  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Point lookup over every baked Natural Earth admin-0 boundary. Rings are
 * stored with unwrapped longitudes, so points near the antimeridian are
 * tested against all three longitude copies.
 */
export class CountryAtlas {
  private readonly matches: CountryMatch[];

  constructor(data: CountriesData) {
    this.matches = data.countries.map((country, index) => ({
      index,
      country,
      bounds: boundsOf(country.polygons),
    }));
  }

  get count(): number {
    return this.matches.length;
  }

  find(lat: number, lon: number): CountryMatch | null {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) {
      return null;
    }

    for (const match of this.matches) {
      const { minLat, maxLat, minLon, maxLon } = match.bounds;

      for (const shift of [0, 360, -360]) {
        const x = lon + shift;
        if (x < minLon || x > maxLon || lat < minLat || lat > maxLat) continue;

        for (const polygon of match.country.polygons) {
          if (pointInPolygon(polygon, x, lat)) return match;
        }
      }
    }

    return null;
  }
}
