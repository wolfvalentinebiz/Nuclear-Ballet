import * as THREE from 'three';
import { geoToWorld } from '../globe/orientation';
import {
  getBuildingIcon,
  getInvertedBuildingIcon,
  type Building,
} from './buildings';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const ICON_SIZE = 32;
const SURFACE_RADIUS = 1.002;
const FACING_EPSILON = 0.01;

interface BuildingEntry {
  building: Building;
  normal: THREE.Vector3;
  position: THREE.Vector3;
  icon: HTMLCanvasElement;
}

interface Drawable {
  x: number;
  y: number;
  depth: number;
  icon: HTMLCanvasElement;
}

/**
 * Screen-space building markers over the globe. The markers stay a fixed
 * 16×16 pixel-art size and are discarded once their site rotates onto the far
 * side of Earth.
 */
export class BuildingLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private entries: BuildingEntry[] = [];
  private constructionEntries: BuildingEntry[] = [];
  private visible = true;
  private visibleIds: Set<string> | null = null;

  private readonly toCamera = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = STAGE_WIDTH;
    this.canvas.height = STAGE_HEIGHT;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create building overlay context');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  setBuildings(buildings: readonly Building[]): void {
    this.entries = buildings.map((building) => this.createEntry(building));
  }

  addBuilding(building: Building): void {
    this.entries.push(this.createEntry(building));
  }

  removeBuilding(buildingId: string): void {
    this.entries = this.entries.filter(
      (entry) => entry.building.id !== buildingId,
    );
  }

  addConstructionSite(building: Building): void {
    this.constructionEntries.push(this.createEntry(building, true));
  }

  removeConstructionSite(buildingId: string): void {
    this.constructionEntries = this.constructionEntries.filter(
      (entry) => entry.building.id !== buildingId,
    );
  }

  clearConstructionSites(): void {
    this.constructionEntries = [];
  }

  get constructionSiteCount(): number {
    return this.constructionEntries.length;
  }

  /**
   * Applies the player's sight filter. Null means every site is visible.
   * Building placement and ownership are unaffected.
   */
  setVisibleBuildings(ids: Set<string> | null): void {
    this.visibleIds = ids;
  }

  get visibleBuildingCount(): number {
    if (!this.visibleIds) return this.entries.length;
    return this.entries.filter((entry) => this.visibleIds?.has(entry.building.id))
      .length;
  }

  /**
   * Checks the 32px marker footprint against every visible building at the
   * current camera. Used to keep new placements from covering an icon at full
   * zoom.
   */
  hasIconOverlap(lat: number, lon: number, camera: THREE.Camera): boolean {
    if (this.entries.length === 0 && this.constructionEntries.length === 0) {
      return false;
    }

    camera.updateMatrixWorld();
    const placementNormal = geoToWorld(lat, lon);
    const placementPosition = placementNormal
      .clone()
      .multiplyScalar(SURFACE_RADIUS);
    const placementScreen = placementPosition.clone().project(camera);
    if (placementScreen.z < -1 || placementScreen.z > 1) return false;
    const placementX = (placementScreen.x * 0.5 + 0.5) * STAGE_WIDTH;
    const placementY = (1 - (placementScreen.y * 0.5 + 0.5)) * STAGE_HEIGHT;

    for (const entry of [...this.entries, ...this.constructionEntries]) {
      this.toCamera.subVectors(camera.position, entry.position);
      const distance = this.toCamera.length();
      if (distance === 0) continue;
      this.toCamera.divideScalar(distance);
      if (entry.normal.dot(this.toCamera) <= FACING_EPSILON) continue;

      this.projected.copy(entry.position).project(camera);
      if (this.projected.z < -1 || this.projected.z > 1) continue;

      const x = (this.projected.x * 0.5 + 0.5) * STAGE_WIDTH;
      const y = (1 - (this.projected.y * 0.5 + 0.5)) * STAGE_HEIGHT;
      if (
        Math.abs(x - placementX) < ICON_SIZE &&
        Math.abs(y - placementY) < ICON_SIZE
      ) {
        return true;
      }
    }

    return false;
  }

  private createEntry(building: Building, underConstruction = false): BuildingEntry {
    const normal = geoToWorld(building.lat, building.lon);
    return {
      building,
      normal,
      position: normal.clone().multiplyScalar(SURFACE_RADIUS),
      icon: underConstruction
        ? getInvertedBuildingIcon(building.type)
        : getBuildingIcon(building.type),
    };
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.canvas.hidden = !visible;
    if (!visible) this.clear();
  }

  render(camera: THREE.Camera): void {
    const ctx = this.ctx;
    this.clear();
    if (!this.visible) return;

    camera.updateMatrixWorld();
    const cameraPosition = camera.position;
    const drawables: Drawable[] = [];

    const collectDrawables = (
      entries: readonly BuildingEntry[],
      applySightFilter: boolean,
    ): void => {
      for (const entry of entries) {
        if (
          applySightFilter &&
          this.visibleIds &&
          !this.visibleIds.has(entry.building.id)
        ) {
          continue;
        }

        this.toCamera.subVectors(cameraPosition, entry.position);
        const distance = this.toCamera.length();
        if (distance === 0) continue;
        this.toCamera.divideScalar(distance);

        // A site is visible only while the camera is on its outward hemisphere.
        if (entry.normal.dot(this.toCamera) <= FACING_EPSILON) continue;

        this.projected.copy(entry.position).project(camera);
        if (this.projected.z < -1 || this.projected.z > 1) continue;

        const x = (this.projected.x * 0.5 + 0.5) * STAGE_WIDTH;
        const y = (1 - (this.projected.y * 0.5 + 0.5)) * STAGE_HEIGHT;
        if (
          x < -ICON_SIZE ||
          x > STAGE_WIDTH + ICON_SIZE ||
          y < -ICON_SIZE ||
          y > STAGE_HEIGHT + ICON_SIZE
        ) {
          continue;
        }

        drawables.push({
          x,
          y,
          depth: cameraPosition.distanceToSquared(entry.position),
          icon: entry.icon,
        });
      }
    };

    collectDrawables(this.entries, true);
    collectDrawables(this.constructionEntries, false);

    // Far markers first so near-side markers sit on top in dense capitals.
    drawables.sort((a, b) => b.depth - a.depth);
    ctx.imageSmoothingEnabled = false;
    for (const drawable of drawables) {
      ctx.drawImage(
        drawable.icon,
        Math.round(drawable.x) - ICON_SIZE / 2,
        Math.round(drawable.y) - ICON_SIZE / 2,
        ICON_SIZE,
        ICON_SIZE,
      );
    }
  }

  private clear(): void {
    this.ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  }
}
