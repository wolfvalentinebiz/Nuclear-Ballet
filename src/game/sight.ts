import * as THREE from 'three';
import type { CountryData } from '../geo/types';
import type { Building } from './buildings';
import { geoToWorld } from '../globe/orientation';

export const SIGHT_RADIUS_KM = 1_000;
const EARTH_RADIUS_KM = 6_371;
const SHARED_BORDER_KM = 15;

interface BorderSegment {
  a: THREE.Vector3;
  b: THREE.Vector3;
  ab: THREE.Vector3;
  abLengthSq: number;
}

let segmentCache = new WeakMap<CountryData, BorderSegment[]>();
let pointCache = new WeakMap<CountryData, THREE.Vector3[]>();
let borderPairCache = new Map<string, boolean>();
let borderContactCache = new Map<string, BorderContact | null>();

/** Drops geometry-derived caches after a country's borders change. */
export function invalidateSightCaches(): void {
  segmentCache = new WeakMap();
  pointCache = new WeakMap();
  borderPairCache = new Map();
  borderContactCache = new Map();
}

export interface BorderContact {
  lat: number;
  lon: number;
  distanceKm: number;
}

function segmentsFor(country: CountryData): BorderSegment[] {
  let segments = segmentCache.get(country);
  if (segments) return segments;

  segments = [];
  for (const polygon of country.polygons) {
    for (const ring of polygon) {
      if (ring.length < 6) continue;

      let previous = geoToWorld(ring[1] ?? 0, ring[0] ?? 0);
      const first = previous.clone();
      for (let i = 2; i < ring.length; i += 2) {
        const current = geoToWorld(ring[i + 1] ?? 0, ring[i] ?? 0);
        const ab = current.clone().sub(previous);
        const abLengthSq = ab.lengthSq();
        if (abLengthSq > 1e-12) {
          segments.push({
            a: previous,
            b: current,
            ab,
            abLengthSq,
          });
        }
        previous = current;
      }

      const closing = first.clone().sub(previous);
      if (closing.lengthSq() > 1e-12) {
        segments.push({
          a: previous,
          b: first,
          ab: closing,
          abLengthSq: closing.lengthSq(),
        });
      }
    }
  }

  segmentCache.set(country, segments);
  return segments;
}

function borderPoints(country: CountryData): THREE.Vector3[] {
  let points = pointCache.get(country);
  if (points) return points;

  points = [];
  for (const polygon of country.polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length; i += 2) {
        points.push(geoToWorld(ring[i + 1] ?? 0, ring[i] ?? 0));
      }
    }
  }
  pointCache.set(country, points);
  return points;
}

function distanceToSegmentKm(
  point: THREE.Vector3,
  segment: BorderSegment,
): number {
  const apX = point.x - segment.a.x;
  const apY = point.y - segment.a.y;
  const apZ = point.z - segment.a.z;
  const t = THREE.MathUtils.clamp(
    (apX * segment.ab.x + apY * segment.ab.y + apZ * segment.ab.z) /
      segment.abLengthSq,
    0,
    1,
  );

  const qx = segment.a.x + segment.ab.x * t;
  const qy = segment.a.y + segment.ab.y * t;
  const qz = segment.a.z + segment.ab.z * t;
  const qLength = Math.hypot(qx, qy, qz);
  if (qLength < 1e-9) return Math.PI * EARTH_RADIUS_KM;

  const cosine = THREE.MathUtils.clamp(
    (point.x * qx + point.y * qy + point.z * qz) / qLength,
    -1,
    1,
  );
  return Math.acos(cosine) * EARTH_RADIUS_KM;
}

/** Great-circle distance from a geographic point to a nation's boundary. */
export function distanceToCountryBorderKm(
  country: CountryData,
  lat: number,
  lon: number,
): number {
  const point = geoToWorld(lat, lon);
  let best = Infinity;

  for (const segment of segmentsFor(country)) {
    const distance = distanceToSegmentKm(point, segment);
    if (distance < best) {
      best = distance;
      if (best <= 0.5) break;
    }
  }

  return best;
}

/**
 * Fog-of-war filter: own sites are always visible; foreign sites are visible
 * only when they lie within the sight radius of the player's border.
 */
export function createSightVisibility(
  country: CountryData,
  buildings: readonly Building[],
  radiusKm = SIGHT_RADIUS_KM,
): Set<string> {
  const visible = new Set<string>();
  const borderSegments = segmentsFor(country);

  for (const building of buildings) {
    if (building.country === country.name) {
      visible.add(building.id);
      continue;
    }

    const point = geoToWorld(building.lat, building.lon);
    let best = Infinity;
    for (const segment of borderSegments) {
      const distance = distanceToSegmentKm(point, segment);
      if (distance < best) best = distance;
      if (best <= radiusKm) break;
    }
    if (best <= radiusKm) visible.add(building.id);
  }

  return visible;
}

function minBorderDistanceKm(a: CountryData, b: CountryData): number {
  const aPoints = borderPoints(a);
  const bPoints = borderPoints(b);
  const strideA = Math.max(1, Math.ceil(aPoints.length / 2_000));
  const strideB = Math.max(1, Math.ceil(bPoints.length / 2_000));
  let bestSq = Infinity;

  for (let i = 0; i < aPoints.length; i += strideA) {
    const pointA = aPoints[i];
    if (!pointA) continue;
    for (let j = 0; j < bPoints.length; j += strideB) {
      const pointB = bPoints[j];
      if (!pointB) continue;
      const dx = pointA.x - pointB.x;
      const dy = pointA.y - pointB.y;
      const dz = pointA.z - pointB.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      if (distanceSq < bestSq) bestSq = distanceSq;
    }
  }

  // Chord length to great-circle distance.
  const chord = Math.sqrt(bestSq);
  return 2 * Math.asin(Math.min(1, chord / 2)) * EARTH_RADIUS_KM;
}

export function countriesShareLandBorder(
  a: CountryData,
  b: CountryData,
): boolean {
  const key = a.name < b.name ? `${a.name}|${b.name}` : `${b.name}|${a.name}`;
  const cached = borderPairCache.get(key);
  if (cached !== undefined) return cached;

  const shared = minBorderDistanceKm(a, b) <= SHARED_BORDER_KM;
  borderPairCache.set(key, shared);
  return shared;
}

/**
 * Midpoint of the closest pair of boundary vertices. A war front uses this
 * as its contact point for terrain checks and its visual advance marker.
 */
export function sharedBorderPoint(a: CountryData, b: CountryData): BorderContact | null {
  const key = a.name < b.name ? `${a.name}|${b.name}` : `${b.name}|${a.name}`;
  if (borderContactCache.has(key)) return borderContactCache.get(key) ?? null;

  const aPoints = borderPoints(a);
  const bPoints = borderPoints(b);
  const strideA = Math.max(1, Math.ceil(aPoints.length / 2_000));
  const strideB = Math.max(1, Math.ceil(bPoints.length / 2_000));
  let bestSq = Infinity;
  let bestA: THREE.Vector3 | null = null;
  let bestB: THREE.Vector3 | null = null;

  for (let i = 0; i < aPoints.length; i += strideA) {
    const pointA = aPoints[i];
    if (!pointA) continue;
    for (let j = 0; j < bPoints.length; j += strideB) {
      const pointB = bPoints[j];
      if (!pointB) continue;
      const distanceSq = pointA.distanceToSquared(pointB);
      if (distanceSq < bestSq) {
        bestSq = distanceSq;
        bestA = pointA;
        bestB = pointB;
      }
    }
  }

  if (!bestA || !bestB) {
    borderContactCache.set(key, null);
    return null;
  }

  const chord = Math.sqrt(bestSq);
  const distanceKm = 2 * Math.asin(Math.min(1, chord / 2)) * EARTH_RADIUS_KM;
  if (distanceKm > SHARED_BORDER_KM) {
    borderContactCache.set(key, null);
    return null;
  }

  const midpoint = bestA.clone().add(bestB).normalize();
  const contact: BorderContact = {
    lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(midpoint.y, -1, 1))),
    lon: THREE.MathUtils.radToDeg(Math.atan2(-midpoint.z, midpoint.x)),
    distanceKm,
  };
  borderContactCache.set(key, contact);
  return contact;
}
