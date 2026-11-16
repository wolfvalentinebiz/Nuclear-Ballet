import * as THREE from 'three';
import { geoToWorld } from '../globe/orientation';
import type { Building } from './buildings';
import { BASE_GBI_FRACTION } from './research';

/** Publicly cited GBI test range; the game uses it as a defensive radius. */
export const GBI_RANGE_KM = 5_300;
export const EARTH_RADIUS_KM = 6_371;

const FILL_RADIUS = 1.0034;
const RING_RADIUS = 1.004;
const RADIAL_SEGMENTS = 14;
const ANGULAR_SEGMENTS = 128;
const RANGE_COLOR = 0x7fe9ff;
const NORTH = new THREE.Vector3(0, 1, 0);

function createCapGeometry(rangeFraction: number): THREE.BufferGeometry {
  const rangeRad = (GBI_RANGE_KM / EARTH_RADIUS_KM) * rangeFraction;
  const positions: number[] = [0, FILL_RADIUS, 0];
  const indices: number[] = [];

  for (let radial = 1; radial <= RADIAL_SEGMENTS; radial += 1) {
    const theta = (rangeRad * radial) / RADIAL_SEGMENTS;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let segment = 0; segment < ANGULAR_SEGMENTS; segment += 1) {
      const phi = (segment / ANGULAR_SEGMENTS) * Math.PI * 2;
      positions.push(
        sinTheta * Math.cos(phi) * FILL_RADIUS,
        cosTheta * FILL_RADIUS,
        sinTheta * Math.sin(phi) * FILL_RADIUS,
      );
    }
  }

  const ringStart = (radial: number): number =>
    1 + (radial - 1) * ANGULAR_SEGMENTS;

  for (let segment = 0; segment < ANGULAR_SEGMENTS; segment += 1) {
    const next = (segment + 1) % ANGULAR_SEGMENTS;
    indices.push(0, ringStart(1) + segment, ringStart(1) + next);
  }

  for (let radial = 1; radial < RADIAL_SEGMENTS; radial += 1) {
    for (let segment = 0; segment < ANGULAR_SEGMENTS; segment += 1) {
      const next = (segment + 1) % ANGULAR_SEGMENTS;
      const inner = ringStart(radial) + segment;
      const innerNext = ringStart(radial) + next;
      const outer = ringStart(radial + 1) + segment;
      const outerNext = ringStart(radial + 1) + next;
      indices.push(inner, outer, innerNext, innerNext, outer, outerNext);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function createRingGeometry(rangeFraction: number): THREE.BufferGeometry {
  const rangeRad = (GBI_RANGE_KM / EARTH_RADIUS_KM) * rangeFraction;
  const positions: number[] = [];
  const sinTheta = Math.sin(rangeRad);
  const cosTheta = Math.cos(rangeRad);

  for (let segment = 0; segment < ANGULAR_SEGMENTS; segment += 1) {
    const phi = (segment / ANGULAR_SEGMENTS) * Math.PI * 2;
    positions.push(
      sinTheta * Math.cos(phi) * RING_RADIUS,
      cosTheta * RING_RADIUS,
      sinTheta * Math.sin(phi) * RING_RADIUS,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

interface RangeSite {
  lat: number;
  lon: number;
}

/**
 * Spherical cap ranges around every interceptor. The preview uses the same
 * geometry and follows the pointer. Coverage starts at 25% of the GBI envelope
 * and expands by 25 percentage points per missile-defense tech.
 */
export class InterceptorRanges {
  readonly group = new THREE.Group();

  private readonly currentGroup = new THREE.Group();
  private readonly previewGroup = new THREE.Group();
  private readonly previewFill: THREE.Mesh;
  private readonly previewRing: THREE.LineLoop;
  private capGeometry: THREE.BufferGeometry;
  private ringGeometry: THREE.BufferGeometry;
  private rangeFraction = BASE_GBI_FRACTION;
  private sites: RangeSite[] = [];

  private readonly fillMaterial = new THREE.MeshBasicMaterial({
    color: RANGE_COLOR,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly ringMaterial = new THREE.LineBasicMaterial({
    color: RANGE_COLOR,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  private readonly previewFillMaterial = new THREE.MeshBasicMaterial({
    color: RANGE_COLOR,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly previewRingMaterial = new THREE.LineBasicMaterial({
    color: RANGE_COLOR,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  private active = false;
  private previewVisible = false;

  constructor() {
    this.capGeometry = createCapGeometry(this.rangeFraction);
    this.ringGeometry = createRingGeometry(this.rangeFraction);

    this.previewFill = new THREE.Mesh(this.capGeometry, this.previewFillMaterial);
    this.previewFill.renderOrder = 1;
    this.previewRing = new THREE.LineLoop(this.ringGeometry, this.previewRingMaterial);
    this.previewRing.renderOrder = 2;
    this.previewGroup.add(this.previewFill, this.previewRing);
    this.previewGroup.visible = false;

    this.currentGroup.visible = false;
    this.group.add(this.currentGroup, this.previewGroup);
    this.group.visible = false;
  }

  get currentFraction(): number {
    return this.rangeFraction;
  }

  rangeKm(): number {
    return GBI_RANGE_KM * this.rangeFraction;
  }

  setRangeFraction(fraction: number): void {
    const next = Math.max(0, Math.min(1, fraction));
    if (Math.abs(next - this.rangeFraction) < 1e-9) return;

    this.rangeFraction = next;
    this.capGeometry.dispose();
    this.ringGeometry.dispose();
    this.capGeometry = createCapGeometry(this.rangeFraction);
    this.ringGeometry = createRingGeometry(this.rangeFraction);
    this.previewFill.geometry = this.capGeometry;
    this.previewRing.geometry = this.ringGeometry;
    this.rebuildCurrent();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.previewVisible = false;
    this.syncVisibility();
  }

  setInterceptors(buildings: readonly Building[]): void {
    this.sites = buildings
      .filter((building) => building.type === 'interceptorPlatform')
      .map((building) => ({ lat: building.lat, lon: building.lon }));
    this.rebuildCurrent();
  }

  setPreview(lat: number, lon: number): void {
    this.setCenter(this.previewGroup, lat, lon);
    this.previewVisible = true;
    this.syncVisibility();
  }

  clearPreview(): void {
    this.previewVisible = false;
    this.syncVisibility();
  }

  private rebuildCurrent(): void {
    this.currentGroup.clear();

    for (const site of this.sites) {
      const holder = new THREE.Group();
      const fill = new THREE.Mesh(this.capGeometry, this.fillMaterial);
      fill.renderOrder = 1;
      const ring = new THREE.LineLoop(this.ringGeometry, this.ringMaterial);
      ring.renderOrder = 2;

      holder.add(fill, ring);
      this.setCenter(holder, site.lat, site.lon);
      this.currentGroup.add(holder);
    }

    this.syncVisibility();
  }

  private setCenter(target: THREE.Object3D, lat: number, lon: number): void {
    target.quaternion.setFromUnitVectors(NORTH, geoToWorld(lat, lon));
  }

  private syncVisibility(): void {
    this.group.visible = this.active;
    this.currentGroup.visible = this.active;
    this.previewGroup.visible = this.active && this.previewVisible;
  }
}
