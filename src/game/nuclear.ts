import * as THREE from 'three';
import {
  nuclearItems,
  productionItem,
  type ProductionItem,
} from './arsenal';
import type { Building } from './buildings';
import type { ProductionSystem } from './production';
import type { ResourceLedger } from '../economy/resources';
import type { PopulationField } from '../population/field';
import { geoToWorld } from '../globe/orientation';

const EARTH_RADIUS_KM = 6371.0088;
const EARTH_SURFACE = 1.0015;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const FRIENDLY_COLOR = 0x67ff9a;
const ENEMY_COLOR = 0xff4b4b;
const INTERCEPTOR_COLOR = 0x8beaff;

export interface NuclearSystemDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  field: PopulationField;
  production: ProductionSystem;
  resources: ResourceLedger;
  getBuildings: () => readonly Building[];
  getPlayerNation: () => string | null;
  /** Nation-specific production inventory used by AI launch decisions. */
  getProductionForNation: (nation: string) => ProductionSystem | null;
  countryAt: (lat: number, lon: number) => string | null;
  isAtWar: (a: string, b: string) => boolean;
  isLand: (lat: number, lon: number) => boolean;
  /** Removes completed buildings and construction sites inside a blast. */
  destroyBuildings: (lat: number, lon: number, radiusKm: number) => number;
  flashOverlay: HTMLElement;
  toast: (message: string) => void;
  onTargetsChanged: () => void;
  /** Simulated Unix time in milliseconds. Cooldowns run on simulation time. */
  getClockMs: () => number;
  getLaunchCooldownMs: (owner: string | null) => number;
}

export interface PlatformStatus {
  ready: number;
  total: number;
  nextReadyInMs: number;
  cooldownMs: number;
}

export interface WarheadStock {
  item: ProductionItem;
  count: number;
}

export type NuclearActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

interface QueuedTarget {
  id: number;
  item: ProductionItem;
  lat: number;
  lon: number;
  country: string | null;
  planId: string;
  color: number;
  marker: THREE.Group;
}

interface PendingLaunch {
  target: QueuedTarget;
  platform: Building;
  at: number;
}

interface QueuedLaunch {
  target: QueuedTarget;
}

interface Missile {
  id: number;
  item: ProductionItem;
  target: QueuedTarget;
  platform: Building;
  owner: string;
  color: number;
  start: THREE.Vector3;
  targetPoint: THREE.Vector3;
  path: THREE.Vector3[];
  group: THREE.Group;
  track: THREE.Line;
  zone: THREE.Group;
  progress: number;
  duration: number;
  arc: number;
  dead: boolean;
  interceptAttempted: boolean;
}

interface Interceptor {
  id: number;
  missileId: number;
  group: THREE.Group;
  track: THREE.Line;
  from: THREE.Vector3;
  to: THREE.Vector3;
  progress: number;
  duration: number;
  done: boolean;
}

interface Effect {
  object: THREE.Object3D;
  age: number;
  duration: number;
  update: (normalized: number) => void;
}

interface LandScar {
  object: THREE.Mesh;
  material: THREE.ShaderMaterial;
  opacity: number;
  createdAt: number;
}

const SCAR_LIFETIME_MS = 365 * 86_400_000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function angularDistanceKm(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.acos(clamp(a.dot(b), -1, 1)) * EARTH_RADIUS_KM;
}

function angularRadius(radiusKm: number): number {
  return radiusKm / EARTH_RADIUS_KM;
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function makeGlowTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.18, 'rgba(255,255,255,0.92)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (child as THREE.Mesh).material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) entry.dispose();
  });
  object.removeFromParent();
}

/**
 * Land/water lookup for the scar shader. Rows are flipped because the field's
 * first row is the north pole while a DataTexture's first row is the bottom.
 */
function createLandMaskTexture(field: PopulationField): THREE.DataTexture {
  const { width, height } = field;
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const textureRow = height - 1 - row;
    for (let col = 0; col < width; col += 1) {
      const land = field.landMask[row * width + col] === 1 ? 255 : 0;
      const offset = (textureRow * width + col) * 4;
      data[offset] = land;
      data[offset + 1] = land;
      data[offset + 2] = land;
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class NuclearSystem {
  readonly group = new THREE.Group();

  private readonly glowTexture = makeGlowTexture();
  private readonly targets: QueuedTarget[] = [];
  private readonly pending: PendingLaunch[] = [];
  private readonly queuedLaunches: QueuedLaunch[] = [];
  private readonly missiles: Missile[] = [];
  private readonly interceptors: Interceptor[] = [];
  private readonly effects: Effect[] = [];
  private readonly landScars: LandScar[] = [];
  private readonly scars = new THREE.Group();
  private readonly populationBursts = new THREE.Group();
  private readonly landTexture: THREE.DataTexture;
  private readonly platformReadyAt = new Map<string, number>();
  private nextTargetId = 1;
  private nextMissileId = 1;
  private nextInterceptorId = 1;
  private elapsed = 0;
  private flashStrength = 0;
  private flashRemaining = 0;

  constructor(private readonly deps: NuclearSystemDeps) {
    this.group.name = 'nuclear-warfare';
    this.scars.name = 'nuclear-surface-scars';
    this.populationBursts.name = 'nuclear-population-bursts';
    this.group.add(this.scars, this.populationBursts);
    this.landTexture = createLandMaskTexture(this.deps.field);
    this.setPopulationMode(false);
    deps.scene.add(this.group);
  }

  get targetCount(): number {
    return this.targets.length;
  }

  /**
   * Population mode shows only the fading strike burst. Permanent blast scars
   * stay hidden there so the heatmap remains readable after an attack.
   */
  setPopulationMode(population: boolean): void {
    this.scars.visible = !population;
    this.populationBursts.visible = population;
  }

  launchStatus(owner: string | null): PlatformStatus {
    const platforms = owner ? this.launchPlatforms(owner) : [];
    const now = this.deps.getClockMs();
    let ready = 0;
    let nextReadyAt = Number.POSITIVE_INFINITY;

    for (const platform of platforms) {
      const readyAt = this.platformReadyAt.get(platform.id) ?? Number.NEGATIVE_INFINITY;
      if (readyAt <= now) ready += 1;
      else nextReadyAt = Math.min(nextReadyAt, readyAt);
    }

    return {
      ready,
      total: platforms.length,
      nextReadyInMs:
        nextReadyAt === Number.POSITIVE_INFINITY
          ? 0
          : Math.max(0, nextReadyAt - now),
      cooldownMs: this.deps.getLaunchCooldownMs(owner),
    };
  }

  /** Completed warheads that have not already been assigned to a queued target. */
  availableWarheads(): WarheadStock[] {
    return nuclearItems().map((item) => {
      const committed = this.targets.filter(
        (target) => target.item.id === item.id,
      ).length;
      return {
        item,
        count: Math.max(0, this.deps.production.itemCount(item.id) - committed),
      };
    });
  }

  addTarget(
    itemId: string,
    lat: number,
    lon: number,
    planId = 'default',
    color = FRIENDLY_COLOR,
  ): NuclearActionResult {
    const owner = this.deps.getPlayerNation();
    if (!owner) return { ok: false, message: 'NO NATION SELECTED' };

    const item = productionItem(itemId);
    if (!item.yieldMt || !item.rangeKm) {
      return { ok: false, message: 'NOT A NUCLEAR WARHEAD' };
    }

    const targetCountry = this.deps.countryAt(lat, lon);
    if (!targetCountry) {
      return { ok: false, message: 'SELECT A COUNTRY TARGET' };
    }
    if (!this.deps.isAtWar(owner, targetCountry)) {
      return { ok: false, message: 'NOT AT WAR WITH TARGET' };
    }

    const committed = this.targets.filter(
      (target) => target.item.id === item.id,
    ).length;
    if (this.deps.production.itemCount(item.id) - committed <= 0) {
      return { ok: false, message: `NO ${item.name} WARHEADS AVAILABLE` };
    }

    const platforms = this.launchPlatforms(owner);
    if (platforms.length === 0) {
      return {
        ok: false,
        message: 'NO NUCLEAR LAUNCH PLATFORM · BUILD ONE FIRST',
      };
    }

    if (!this.platformFor(item, lat, lon, owner)) {
      return {
        ok: false,
        message: `OUT OF RANGE · ${item.name} MAX ${formatCount(item.rangeKm)} KM`,
      };
    }

    const target: QueuedTarget = {
      id: this.nextTargetId,
      item,
      lat,
      lon,
      country: targetCountry,
      planId,
      color,
      marker: this.createTargetMarker(item, lat, lon, color),
    };
    this.nextTargetId += 1;
    this.targets.push(target);
    this.group.add(target.marker);
    this.deps.onTargetsChanged();
    return {
      ok: true,
      message: `TARGET ACQUIRED · ${item.yieldLabel} ${item.name.toUpperCase()}`,
    };
  }

  removeLastTarget(planId?: string): NuclearActionResult {
    let index = -1;
    for (let cursor = this.targets.length - 1; cursor >= 0; cursor -= 1) {
      if (planId === undefined || this.targets[cursor]!.planId === planId) {
        index = cursor;
        break;
      }
    }
    const target = index >= 0 ? this.targets.splice(index, 1)[0] : null;
    if (!target) return { ok: false, message: 'NO QUEUED TARGETS' };
    disposeObject(target.marker);
    this.deps.onTargetsChanged();
    return { ok: true, message: 'LAST TARGET REMOVED' };
  }

  targetCountForPlan(planId: string): number {
    return this.targets.filter((target) => target.planId === planId).length;
  }

  queuedCountForPlan(planId: string): number {
    return this.queuedLaunches.filter(
      (launch) => launch.target.planId === planId,
    ).length;
  }

  /** Cancels waiting launches and returns their targets to the war plan. */
  cancelQueued(planId?: string): NuclearActionResult {
    const owner = this.deps.getPlayerNation();
    if (!owner) return { ok: false, message: 'NO NATION SELECTED' };

    let cancelled = 0;
    for (let index = this.queuedLaunches.length - 1; index >= 0; index -= 1) {
      const launch = this.queuedLaunches[index]!;
      if (planId !== undefined && launch.target.planId !== planId) continue;
      this.queuedLaunches.splice(index, 1);
      const target = launch.target;
      this.targets.push(target);
      this.deps.production.refundItem(target.item.id, 1);
      this.deps.resources.addCounter(owner, target.item.counter, 1);
      cancelled += 1;
    }

    if (cancelled === 0) return { ok: false, message: 'NO QUEUED LAUNCHES' };
    this.deps.onTargetsChanged();
    return {
      ok: true,
      message: `${cancelled} QUEUED LAUNCH${cancelled === 1 ? '' : 'ES'} CANCELLED`,
    };
  }

  /**
   * Launches a completed AI warhead without putting a target marker in the
   * player's queue. Platform range, readiness, and stock checks are the same
   * as a player launch.
   */
  launchForNation(
    owner: string,
    itemId: string,
    lat: number,
    lon: number,
  ): NuclearActionResult {
    const item = productionItem(itemId);
    if (!item.yieldMt || !item.rangeKm) {
      return { ok: false, message: 'NOT A NUCLEAR WARHEAD' };
    }

    const targetCountry = this.deps.countryAt(lat, lon);
    if (!targetCountry || !this.deps.isAtWar(owner, targetCountry)) {
      return { ok: false, message: 'NOT AT WAR WITH TARGET' };
    }

    const production = this.deps.getProductionForNation(owner);
    if (!production || production.itemCount(item.id) < 1) {
      return { ok: false, message: `NO ${item.name} WARHEADS AVAILABLE` };
    }

    const platform = this.platformFor(item, lat, lon, owner, true);
    if (!platform) {
      return { ok: false, message: `NO READY PLATFORM IN RANGE` };
    }

    const balance = this.deps.resources.forNation(owner);
    if (balance[item.counter] < 1) {
      return { ok: false, message: `NO ${item.name} STOCK` };
    }

    if (!production.consumeItem(item.id, 1)) {
      return { ok: false, message: `NO ${item.name} WARHEADS AVAILABLE` };
    }
    if (!this.deps.resources.spendCounter(owner, item.counter, 1)) {
      production.refundItem(item.id, 1);
      return { ok: false, message: `NO ${item.name} STOCK` };
    }

    const now = this.deps.getClockMs();
    this.platformReadyAt.set(
      platform.id,
      now + Math.max(0, this.deps.getLaunchCooldownMs(owner)),
    );

    const target: QueuedTarget = {
      id: this.nextTargetId,
      item,
      lat,
      lon,
      country: targetCountry,
      planId: 'ai',
      color: ENEMY_COLOR,
      marker: new THREE.Group(),
    };
    this.nextTargetId += 1;
    this.pending.push({ target, platform, at: this.elapsed });
    return { ok: true, message: 'AI STRIKE AUTHORIZED' };
  }

  detonate(planId?: string): NuclearActionResult {
    const owner = this.deps.getPlayerNation();
    if (!owner) return { ok: false, message: 'NO NATION SELECTED' };
    if (this.targets.length === 0) {
      return { ok: false, message: 'NO TARGETS QUEUED' };
    }

    const planTargets = planId
      ? this.targets.filter((target) => target.planId === planId)
      : this.targets;
    if (planTargets.length === 0) {
      return { ok: false, message: 'NO TARGETS QUEUED' };
    }

    const platforms = this.launchPlatforms(owner);
    if (platforms.length === 0) {
      return {
        ok: false,
        message: 'NO NUCLEAR LAUNCH PLATFORM · BUILD ONE FIRST',
      };
    }

    const immediate: Array<{ target: QueuedTarget; platform: Building }> = [];
    const waiting: QueuedTarget[] = [];
    const usedPlatforms = new Set<string>();
    let held = 0;
    let lastReason = '';

    for (const target of planTargets) {
      if (!target.country) {
        held += 1;
        lastReason = 'TARGET NOT A COUNTRY';
        continue;
      }
      if (!this.deps.isAtWar(owner, target.country)) {
        held += 1;
        lastReason = 'NOT AT WAR WITH TARGET';
        continue;
      }
      const balance = this.deps.resources.forNation(owner);
      if (balance[target.item.counter] < 1) {
        held += 1;
        lastReason = `NO ${target.item.name} STOCK`;
        continue;
      }

      const inRange = this.platformFor(
        target.item,
        target.lat,
        target.lon,
        owner,
      );
      if (!inRange) {
        held += 1;
        lastReason = 'TARGET OUT OF RANGE';
        continue;
      }

      if (!this.deps.production.consumeItem(target.item.id, 1)) {
        held += 1;
        lastReason = `NO ${target.item.name} STOCK`;
        continue;
      }
      if (!this.deps.resources.spendCounter(owner, target.item.counter, 1)) {
        this.deps.production.refundItem(target.item.id, 1);
        held += 1;
        lastReason = `NO ${target.item.name} STOCK`;
        continue;
      }

      const platform = this.platformFor(
        target.item,
        target.lat,
        target.lon,
        owner,
        true,
        usedPlatforms,
      );
      if (platform) {
        usedPlatforms.add(platform.id);
        immediate.push({ target, platform });
      } else {
        waiting.push(target);
      }
    }

    if (immediate.length === 0 && waiting.length === 0) {
      return {
        ok: false,
        message: held > 0 ? `STRIKE HELD · ${lastReason}` : 'NOTHING TO LAUNCH',
      };
    }

    const launched = new Set<QueuedTarget>([
      ...immediate.map((entry) => entry.target),
      ...waiting,
    ]);
    for (let index = this.targets.length - 1; index >= 0; index -= 1) {
      if (launched.has(this.targets[index]!)) this.targets.splice(index, 1);
    }
    for (const entry of immediate) disposeObject(entry.target.marker);
    for (const target of waiting) this.queuedLaunches.push({ target });
    this.deps.onTargetsChanged();

    const now = this.deps.getClockMs();
    const cooldownMs = Math.max(0, this.deps.getLaunchCooldownMs(owner));
    for (const entry of immediate) {
      this.platformReadyAt.set(entry.platform.id, now + cooldownMs);
    }

    immediate.forEach((entry, index) => {
      this.pending.push({
        target: entry.target,
        platform: entry.platform,
        at: this.elapsed + index * 0.12,
      });
    });

    const parts: string[] = [];
    if (immediate.length > 0) {
      parts.push(
        `${immediate.length} MISSILE${immediate.length === 1 ? '' : 'S'} AWAY`,
      );
    }
    if (waiting.length > 0) {
      parts.push(
        `${waiting.length} LAUNCH${waiting.length === 1 ? '' : 'ES'} QUEUED`,
      );
    }
    if (held > 0) parts.push(`${held} HELD (${lastReason})`);
    return { ok: true, message: parts.join(' · ') };
  }

  reset(): void {
    for (const target of this.targets) disposeObject(target.marker);
    this.targets.length = 0;
    this.pending.length = 0;
    for (const launch of this.queuedLaunches) {
      disposeObject(launch.target.marker);
    }
    this.queuedLaunches.length = 0;
    this.platformReadyAt.clear();
    for (const missile of this.missiles) {
      disposeObject(missile.group);
      disposeObject(missile.track);
      disposeObject(missile.zone);
    }
    this.missiles.length = 0;
    for (const interceptor of this.interceptors) {
      disposeObject(interceptor.group);
      disposeObject(interceptor.track);
    }
    this.interceptors.length = 0;
    for (const effect of this.effects) disposeObject(effect.object);
    this.effects.length = 0;
    for (const scar of this.landScars) disposeObject(scar.object);
    this.landScars.length = 0;
    this.flashStrength = 0;
    this.flashRemaining = 0;
    this.deps.flashOverlay.style.opacity = '0';
    this.deps.onTargetsChanged();
  }

  update(deltaSeconds: number): void {
    const delta = Math.min(Math.max(deltaSeconds, 0), 0.1);
    this.elapsed += delta;
    this.updateFlash(delta);

    this.launchQueued();

    for (const launch of this.pending) {
      if (launch.at <= this.elapsed) {
        this.spawnMissile(launch.target, launch.platform);
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i -= 1) {
      if (this.pending[i].at <= this.elapsed) this.pending.splice(i, 1);
    }

    for (const missile of this.missiles) {
      if (missile.dead) continue;
      missile.progress = Math.min(1, missile.progress + delta / missile.duration);
      this.positionMissile(missile);

      if (!missile.interceptAttempted && missile.progress >= 0.56) {
        missile.interceptAttempted = true;
        this.tryIntercept(missile);
      }

      if (missile.progress >= 1 && !missile.dead) {
        this.impactMissile(missile);
      }
    }

    for (const interceptor of this.interceptors) {
      if (interceptor.done) continue;
      interceptor.progress = Math.min(
        1,
        interceptor.progress + delta / interceptor.duration,
      );
      interceptor.group.position.lerpVectors(
        interceptor.from,
        interceptor.to,
        interceptor.progress,
      );
      const direction = interceptor.to.clone().sub(interceptor.from).normalize();
      interceptor.group.quaternion.setFromUnitVectors(Y_AXIS, direction);
      if (interceptor.progress >= 1) {
        interceptor.done = true;
        const missile = this.missiles.find(
          (entry) => entry.id === interceptor.missileId && !entry.dead,
        );
        if (missile) this.interceptMissile(missile);
      }
    }

    for (const effect of this.effects) {
      effect.age += delta;
      const normalized = Math.min(1, effect.age / effect.duration);
      effect.update(normalized);
      if (normalized >= 1) {
        disposeObject(effect.object);
      }
    }

    this.updateLandScars();
    this.cleanup();
  }

  /** Dispatches waiting plan launches the moment a suitable platform is ready. */
  private launchQueued(): void {
    if (this.queuedLaunches.length === 0) return;
    const owner = this.deps.getPlayerNation();
    if (!owner) return;

    const now = this.deps.getClockMs();
    const cooldownMs = Math.max(0, this.deps.getLaunchCooldownMs(owner));
    const usedPlatforms = new Set<string>();
    let launched = 0;

    for (let index = 0; index < this.queuedLaunches.length; ) {
      const entry = this.queuedLaunches[index]!;
      const target = entry.target;
      if (!target.country || !this.deps.isAtWar(owner, target.country)) {
        index += 1;
        continue;
      }

      const platform = this.platformFor(
        target.item,
        target.lat,
        target.lon,
        owner,
        true,
        usedPlatforms,
      );
      if (!platform) {
        index += 1;
        continue;
      }

      usedPlatforms.add(platform.id);
      this.platformReadyAt.set(platform.id, now + cooldownMs);
      this.queuedLaunches.splice(index, 1);
      disposeObject(target.marker);
      this.pending.push({ target, platform, at: this.elapsed });
      launched += 1;
    }

    if (launched > 0) this.deps.onTargetsChanged();
  }

  private launchPlatforms(owner: string): Building[] {
    return this.deps
      .getBuildings()
      .filter(
        (building) =>
          building.country === owner && building.type === 'nuclearLaunchPlatform',
      );
  }

  private interceptorPlatforms(owner: string): Building[] {
    return this.deps
      .getBuildings()
      .filter(
        (building) =>
          building.country === owner && building.type === 'interceptorPlatform',
      );
  }

  private platformFor(
    item: ProductionItem,
    lat: number,
    lon: number,
    owner: string,
    requireReady = false,
    excluded?: ReadonlySet<string>,
  ): Building | null {
    if (!item.rangeKm) return null;
    const target = geoToWorld(lat, lon);
    const now = this.deps.getClockMs();
    let best: Building | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const platform of this.launchPlatforms(owner)) {
      if (excluded?.has(platform.id)) continue;
      if (
        requireReady &&
        (this.platformReadyAt.get(platform.id) ?? Number.NEGATIVE_INFINITY) > now
      ) {
        continue;
      }
      const distance = angularDistanceKm(
        geoToWorld(platform.lat, platform.lon),
        target,
      );
      if (distance <= item.rangeKm && distance < bestDistance) {
        best = platform;
        bestDistance = distance;
      }
    }
    return best;
  }

  private createTargetMarker(
    item: ProductionItem,
    lat: number,
    lon: number,
    color: number,
  ): THREE.Group {
    const normal = geoToWorld(lat, lon).normalize();
    const radii = effectRadii(item);
    const zone = Math.max(0.0045, angularRadius(radii.thermalKm * 0.55));
    const group = new THREE.Group();
    const ring = this.createSurfaceRing(
      normal,
      zone,
      color,
      0.72,
      0.005,
    );
    const innerRing = this.createSurfaceRing(
      normal,
      zone * 0.42,
      color,
      0.32,
      0.005,
    );
    group.add(
      ring,
      innerRing,
      this.createSurfaceCrosshair(normal, zone, color, 0.95, 0.0052),
    );
    return group;
  }

  private spawnMissile(target: QueuedTarget, platform: Building): void {
    const owner = platform.country;
    const color = owner === this.deps.getPlayerNation() ? FRIENDLY_COLOR : ENEMY_COLOR;
    const start = geoToWorld(platform.lat, platform.lon).normalize();
    const targetPoint = geoToWorld(target.lat, target.lon).normalize();
    const isICBM = (target.item.yieldMt ?? 0) > 1;
    const arc = isICBM ? 0.32 : 0.14;
    const duration = isICBM ? 8.2 : 5.4;
    const path: THREE.Vector3[] = [];
    const samples = 96;
    for (let step = 0; step <= samples; step += 1) {
      path.push(
        this.arcPoint(start, targetPoint, arc, step / samples, new THREE.Vector3()),
      );
    }

    const group = this.createMissileModel(target.item, color);
    group.position.copy(path[0]);
    const track = this.createTrajectoryLine(path, color, 0.52);
    const zone = this.createImpactZone(targetPoint, target.item, color);
    this.group.add(group, track, zone);

    const missile: Missile = {
      id: this.nextMissileId,
      item: target.item,
      target,
      platform,
      owner,
      color,
      start,
      targetPoint,
      path,
      group,
      track,
      zone,
      progress: 0,
      duration,
      arc,
      dead: false,
      interceptAttempted: false,
    };
    this.nextMissileId += 1;
    this.missiles.push(missile);
    this.positionMissile(missile);
  }

  private createMissileModel(item: ProductionItem, color: number): THREE.Group {
    const group = new THREE.Group();
    const isICBM = (item.yieldMt ?? 0) > 1;
    const material = new THREE.MeshBasicMaterial({
      color,
      toneMapped: false,
    });

    if (isICBM) {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0018, 0.0023, 0.014, 7),
        material,
      );
      body.position.y = -0.003;
      const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.0028, 0.008, 8),
        material,
      );
      nose.position.y = 0.008;
      const tail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003, 0.0019, 0.004, 7),
        material,
      );
      tail.position.y = -0.011;
      group.add(body, nose, tail);
      group.scale.setScalar(1 + Math.min(0.3, (item.yieldMt ?? 1) / 220));
    } else {
      const length = 0.0055 + Math.cbrt(item.yieldMt ?? 0.05) * 0.0065;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.0027, length, 8),
        material,
      );
      group.add(cone);
    }
    group.userData.baseScale = group.scale.x;

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.scale.setScalar(isICBM ? 0.05 : 0.036);
    group.add(glow);
    group.renderOrder = 5;
    return group;
  }

  private createTrajectoryLine(
    path: THREE.Vector3[],
    color: number,
    opacity: number,
  ): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints(path);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 3;
    return line;
  }

  private createImpactZone(
    targetPoint: THREE.Vector3,
    item: ProductionItem,
    color: number,
  ): THREE.Group {
    const group = new THREE.Group();
    const radii = effectRadii(item);
    const zone = Math.max(0.0045, angularRadius(radii.thermalKm * 0.55));
    group.add(
      this.createSurfaceRing(targetPoint, zone, color, 0.9, 0.0055),
      this.createSurfaceCrosshair(targetPoint, zone, color, 0.98, 0.0057),
    );
    return group;
  }

  private createSurfaceRing(
    normal: THREE.Vector3,
    radius: number,
    color: number,
    opacity: number,
    offset: number,
  ): THREE.LineLoop {
    const reference =
      Math.abs(normal.y) > 0.92
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3()
      .crossVectors(reference, normal)
      .normalize();
    const bitangent = new THREE.Vector3()
      .crossVectors(normal, tangent)
      .normalize();
    const points: THREE.Vector3[] = [];
    const segments = 72;
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const direction = normal
        .clone()
        .multiplyScalar(Math.cos(radius))
        .addScaledVector(tangent, Math.sin(radius) * Math.cos(angle))
        .addScaledVector(bitangent, Math.sin(radius) * Math.sin(angle))
        .normalize()
        .multiplyScalar(1 + offset);
      points.push(direction);
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const ring = new THREE.LineLoop(geometry, material);
    ring.renderOrder = 4;
    return ring;
  }

  private createSurfaceCrosshair(
    normal: THREE.Vector3,
    radius: number,
    color: number,
    opacity: number,
    offset: number,
  ): THREE.Group {
    const group = new THREE.Group();
    const reference =
      Math.abs(normal.y) > 0.92
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3()
      .crossVectors(reference, normal)
      .normalize();
    const bitangent = new THREE.Vector3()
      .crossVectors(normal, tangent)
      .normalize();
    const inner = Math.max(0.0008, radius * 0.34);
    const outer = Math.max(0.0024, radius * 1.2);
    const points: THREE.Vector3[] = [];

    const at = (
      axis: THREE.Vector3,
      angle: number,
      sign: number,
    ): THREE.Vector3 =>
      normal
        .clone()
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(axis, Math.sin(angle) * sign)
        .normalize()
        .multiplyScalar(1 + offset);

    for (const axis of [tangent, bitangent]) {
      for (const sign of [-1, 1]) {
        points.push(at(axis, inner, sign), at(axis, outer, sign));
      }
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 5;
    group.add(lines);
    group.add(
      this.createSurfaceRing(normal, radius * 0.5, color, opacity * 0.45, offset),
    );
    return group;
  }

  private arcPoint(
    start: THREE.Vector3,
    end: THREE.Vector3,
    altitude: number,
    t: number,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    const angle = Math.acos(clamp(start.dot(end), -1, 1));
    if (angle < 1e-5) {
      target.copy(start);
    } else {
      const sinAngle = Math.sin(angle);
      const startWeight = Math.sin((1 - t) * angle) / sinAngle;
      const endWeight = Math.sin(t * angle) / sinAngle;
      target
        .copy(start)
        .multiplyScalar(startWeight)
        .addScaledVector(end, endWeight)
        .normalize();
    }
    return target.multiplyScalar(1 + altitude * Math.sin(Math.PI * t));
  }

  private positionMissile(missile: Missile): void {
    const position = this.arcPoint(
      missile.start,
      missile.targetPoint,
      missile.arc,
      missile.progress,
      new THREE.Vector3(),
    );
    const next = this.arcPoint(
      missile.start,
      missile.targetPoint,
      missile.arc,
      Math.min(1, missile.progress + 0.004),
      new THREE.Vector3(),
    );
    const direction = next.sub(position);
    if (direction.lengthSq() < 1e-12) direction.copy(position).normalize();
    missile.group.position.copy(position);
    missile.group.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
    // Keep the warhead readable at globe scale, while shrinking it toward a
    // more plausible physical size when the camera is close to the surface.
    const baseScale = (missile.group.userData.baseScale as number | undefined) ?? 1;
    const viewScale = clamp(
      this.deps.camera.position.distanceTo(position) * 0.45,
      0.18,
      1.65,
    );
    missile.group.scale.setScalar(baseScale * viewScale);
  }

  private tryIntercept(missile: Missile): void {
    const defender = missile.target.country;
    if (!defender) return;
    const balance = this.deps.resources.forNation(defender);
    if (balance.interceptors < 1) return;

    const platforms = this.interceptorPlatforms(defender);
    if (platforms.length === 0) return;

    const targetPoint = geoToWorld(missile.target.lat, missile.target.lon);
    let platform = platforms[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of platforms) {
      const distance = angularDistanceKm(
        geoToWorld(candidate.lat, candidate.lon),
        targetPoint,
      );
      if (distance < bestDistance) {
        platform = candidate;
        bestDistance = distance;
      }
    }

    if (!this.deps.resources.spendCounter(defender, 'interceptors', 1)) return;

    const from = geoToWorld(platform.lat, platform.lon)
      .normalize()
      .multiplyScalar(EARTH_SURFACE);
    const to = missile.group.position.clone();
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color: INTERCEPTOR_COLOR,
      toneMapped: false,
    });
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.0018, 0.012, 7),
      material,
    );
    group.add(body);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: INTERCEPTOR_COLOR,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.scale.setScalar(0.03);
    group.add(glow);
    group.position.copy(from);
    const direction = to.clone().sub(from).normalize();
    group.quaternion.setFromUnitVectors(Y_AXIS, direction);

    const track = this.createTrajectoryLine(
      [from.clone(), to.clone()],
      INTERCEPTOR_COLOR,
      0.55,
    );
    this.group.add(group, track);
    this.interceptors.push({
      id: this.nextInterceptorId,
      missileId: missile.id,
      group,
      track,
      from,
      to,
      progress: 0,
      duration: 0.62,
      done: false,
    });
    this.nextInterceptorId += 1;
    this.deps.toast(
      `${defender.toUpperCase()} INTERCEPTOR AWAY · ${missile.item.yieldLabel}`,
    );
  }

  private interceptMissile(missile: Missile): void {
    if (missile.dead) return;
    missile.dead = true;
    this.spawnAirburst(missile.group.position.clone(), missile.item, missile.color);
    this.deps.toast(`${missile.item.name.toUpperCase()} INTERCEPTED IN THE SKY`);
  }

  private impactMissile(missile: Missile): void {
    if (missile.dead) return;
    missile.dead = true;

    const radii = effectRadii(missile.item);
    const ground = this.deps.isLand(missile.target.lat, missile.target.lon);
    const casualtyRadius = Math.max(radii.blastKm, radii.burnKm);
    const strike = ground
      ? this.deps.field.strike(
          missile.target.lat,
          missile.target.lon,
          casualtyRadius,
          (distanceKm) => fatalityRateAt(distanceKm, radii),
          radii.blastKm,
        )
      : null;
    if (ground) {
      this.spawnCrater(missile.targetPoint, radii);
      this.spawnPopulationBurst(missile.targetPoint, radii);
    }
    const impactPoint = missile.targetPoint
      .clone()
      .normalize()
      .multiplyScalar(EARTH_SURFACE);
    this.spawnGroundBurst(impactPoint, missile.item, radii, ground, missile.color);
    this.flashScreen(impactPoint, missile.item);
    const killed = strike?.killed ?? 0;
    const destroyed = this.deps.destroyBuildings(
      missile.target.lat,
      missile.target.lon,
      radii.blastKm,
    );
    this.deps.toast(
      `${missile.item.name.toUpperCase()} · ${missile.item.yieldLabel} IMPACT${
        killed > 0 ? ` · ${formatCount(killed)} EST. FATALITIES` : ''
      }${destroyed > 0 ? ` · ${destroyed} BUILDING${destroyed === 1 ? '' : 'S'} DESTROYED` : ''}`,
    );
  }

  private spawnCrater(normal: THREE.Vector3, radii: EffectRadii): void {
    const thermal = this.createLandScar(
      normal,
      radii.burnKm,
      0x21160e,
      0x453022,
      0.34,
    );
    thermal.renderOrder = 2;
    const crater = this.createLandScar(
      normal,
      radii.craterKm,
      0x050403,
      0x6b4a32,
      0.9,
    );
    crater.renderOrder = 3;
    this.scars.add(thermal, crater);
    const createdAt = this.deps.getClockMs();
    this.landScars.push(
      {
        object: thermal,
        material: thermal.material as THREE.ShaderMaterial,
        opacity: 0.34,
        createdAt,
      },
      {
        object: crater,
        material: crater.material as THREE.ShaderMaterial,
        opacity: 0.9,
        createdAt,
      },
    );
  }

  /**
   * A spherical surface cap whose fragment shader discards water pixels. A
   * plain circle at a coastal impact would paint a burn scar across the sea;
   * sampling the population field's land mask keeps every scar on land.
   */
  private createLandScar(
    normal: THREE.Vector3,
    radiusKm: number,
    coreColor: number,
    rimColor: number,
    opacity: number,
  ): THREE.Mesh {
    const center = normal.clone().normalize();
    const radius = Math.max(1e-7, angularRadius(radiusKm));
    const geometry = new THREE.SphereGeometry(
      1.0012,
      64,
      20,
      0,
      Math.PI * 2,
      0,
      Math.min(Math.PI, radius * 1.05),
    );
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uCenter: { value: center },
        uRadius: { value: radius },
        uCoreColor: { value: new THREE.Color(coreColor) },
        uRimColor: { value: new THREE.Color(rimColor) },
        uOpacity: { value: opacity },
        uLandMask: { value: this.landTexture },
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(mat3(modelMatrix) * position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uCenter;
        uniform float uRadius;
        uniform vec3 uCoreColor;
        uniform vec3 uRimColor;
        uniform float uOpacity;
        uniform sampler2D uLandMask;
        varying vec3 vNormal;
        const float PI = 3.141592653589793;

        void main() {
          vec3 n = normalize(vNormal);
          float angle = acos(clamp(dot(n, normalize(uCenter)), -1.0, 1.0));
          if (angle > uRadius) discard;

          float lon = atan(-n.z, n.x);
          float lat = asin(clamp(n.y, -1.0, 1.0));
          vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 + lat / PI);
          if (texture2D(uLandMask, uv).r < 0.35) discard;

          float d = angle / uRadius;
          float core = 1.0 - smoothstep(0.55, 0.9, d);
          float edge = 1.0 - smoothstep(0.9, 1.0, d);
          vec3 color = mix(uRimColor, uCoreColor, core);
          gl_FragColor = vec4(color, uOpacity * edge);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, center);
    return mesh;
  }

  /** A warm overlay on the population heatmap that fades without scarring it. */
  private spawnPopulationBurst(point: THREE.Vector3, radii: EffectRadii): void {
    const normal = point.clone().normalize();
    const radius = Math.max(0.0005, angularRadius(radii.blastKm * 1.08));
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(1.0028, 48, 16, 0, Math.PI * 2, 0, radius),
      new THREE.MeshBasicMaterial({
        color: 0xff5b3c,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    cap.quaternion.setFromUnitVectors(Y_AXIS, normal);
    cap.renderOrder = 4;
    const ring = this.createSurfaceRing(
      normal,
      radius * 1.12,
      0xffb078,
      0.72,
      0.0068,
    );
    this.populationBursts.add(cap, ring);

    const material = cap.material as THREE.MeshBasicMaterial;
    const ringMaterial = ring.material as THREE.LineBasicMaterial;
    this.effects.push({
      object: cap,
      age: 0,
      duration: 3.4,
      update: (normalized) => {
        material.opacity = 0.62 * Math.pow(1 - normalized, 1.45);
      },
    });
    this.effects.push({
      object: ring,
      age: 0,
      duration: 2.6,
      update: (normalized) => {
        ringMaterial.opacity = 0.72 * (1 - normalized);
      },
    });
  }

  private spawnGroundBurst(
    point: THREE.Vector3,
    item: ProductionItem,
    radii: EffectRadii,
    ground: boolean,
    color: number,
  ): void {
    const fireballRadius = Math.max(0.00001, angularRadius(radii.fireballKm));
    const normal = point.clone().normalize();
    const fireballCenter = point
      .clone()
      .addScaledVector(normal, fireballRadius * 1.45);
    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0xfff2c4,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    fireball.position.copy(fireballCenter);
    fireball.scale.setScalar(fireballRadius * 0.2);
    this.group.add(fireball);
    this.effects.push({
      object: fireball,
      age: 0,
      duration: 1.1,
      update: (normalized) => {
        const scale = fireballRadius * (0.25 + Math.sqrt(normalized) * 1.2);
        fireball.scale.setScalar(scale);
        const material = fireball.material as THREE.MeshBasicMaterial;
        material.opacity = Math.max(0, 1 - normalized * 1.05);
      },
    });

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    flash.position.copy(fireballCenter);
    flash.scale.setScalar(Math.max(0.00002, fireballRadius * 1.5));
    this.group.add(flash);
    this.effects.push({
      object: flash,
      age: 0,
      duration: 0.3,
      update: (normalized) => {
        const material = flash.material as THREE.MeshBasicMaterial;
        material.opacity = Math.max(0, 0.95 - normalized * 1.2);
      },
    });

    const ring = this.createSurfaceRing(
      point.clone().normalize(),
      Math.max(0.00015, angularRadius(radii.fireballKm * 1.5)),
      color,
      0.8,
      0.001,
    );
    this.group.add(ring);
    this.effects.push({
      object: ring,
      age: 0,
      duration: 1.4,
      update: (normalized) => {
        const material = (ring as THREE.LineLoop).material as THREE.LineBasicMaterial;
        material.opacity = Math.max(0, 0.8 * (1 - normalized));
      },
    });

    if (ground) this.spawnMushroom(point, item);
  }

  private spawnMushroom(point: THREE.Vector3, item: ProductionItem): void {
    const normal = point.clone().normalize();
    const yieldMt = Math.max(0.05, item.yieldMt ?? 0.05);
    // Real cloud tops are roughly 10–55 km, growing with the cube root of
    // yield. The model is built in Earth-radius units, so it stays correctly
    // scaled whether the camera is on the surface or across the globe.
    const cloudTopKm = clamp(20 * Math.cbrt(yieldMt), 10, 55);
    const cloudHeight = cloudTopKm / (EARTH_RADIUS_KM * 0.854);
    const group = new THREE.Group();
    const stemMaterial = new THREE.MeshBasicMaterial({
      color: 0xb3a18b,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    const capMaterial = new THREE.MeshBasicMaterial({
      color: 0xcdbb9f,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const emberMaterial = new THREE.MeshBasicMaterial({
      color: 0xff9b43,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.075, 0.58, 10, 1, true),
      stemMaterial,
    );
    stem.position.y = 0.29;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 10),
      capMaterial,
    );
    cap.scale.y = 0.55;
    cap.position.y = 0.7;
    const collar = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 8),
      capMaterial,
    );
    collar.scale.set(1.2, 0.72, 1.2);
    collar.position.y = 0.52;
    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      emberMaterial,
    );
    ember.position.y = 0.035;
    group.add(stem, cap, collar, ember);
    group.position.copy(normal.clone().multiplyScalar(1.002));
    group.quaternion.setFromUnitVectors(Y_AXIS, normal);
    group.scale.setScalar(cloudHeight * 0.12);
    this.group.add(group);

    this.effects.push({
      object: group,
      age: 0,
      duration: 7.5,
      update: (normalized) => {
        const rise = Math.min(1, normalized / 0.45);
        group.scale.setScalar(cloudHeight * (0.12 + 0.88 * Math.sqrt(rise)));
        const fade = normalized < 0.62 ? 1 : Math.max(0, 1 - (normalized - 0.62) / 0.38);
        stemMaterial.opacity = 0.58 * fade;
        capMaterial.opacity = 0.72 * fade;
        emberMaterial.opacity = 0.75 * fade * (1 - normalized * 0.7);
      },
    });
  }

  private spawnAirburst(
    point: THREE.Vector3,
    item: ProductionItem,
    color: number,
  ): void {
    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0xffe9a8,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    fireball.position.copy(point);
    const radius = Math.max(
      0.00001,
      angularRadius(effectRadii(item).fireballKm) * 1.15,
    );
    fireball.scale.setScalar(radius * 0.3);
    this.group.add(fireball);
    this.effects.push({
      object: fireball,
      age: 0,
      duration: 0.9,
      update: (normalized) => {
        fireball.scale.setScalar(radius * (0.3 + normalized * 1.4));
        (fireball.material as THREE.MeshBasicMaterial).opacity = 1 - normalized;
      },
    });

    const ring = this.createSurfaceRing(
      point.clone().normalize(),
      Math.max(0.00015, angularRadius(effectRadii(item).fireballKm)),
      color,
      0.55,
      0.001,
    );
    this.group.add(ring);
    this.effects.push({
      object: ring,
      age: 0,
      duration: 1.1,
      update: (normalized) => {
        (ring.material as THREE.LineBasicMaterial).opacity = 0.55 * (1 - normalized);
      },
    });

    this.flashScreen(point, item, 0.35);
  }

  private flashScreen(
    point: THREE.Vector3,
    item: ProductionItem,
    multiplier = 1,
  ): void {
    const distance = this.deps.camera.position.distanceTo(point);
    const proximity = clamp(2.8 / Math.max(0.4, distance), 0.12, 1);
    const facing = clamp(
      (point.clone().normalize().dot(this.deps.camera.position.clone().normalize()) +
        0.15) /
        1.15,
      0,
      1,
    );
    const yieldFactor = clamp(Math.cbrt(item.yieldMt ?? 1), 0.35, 4.6);
    const strength = clamp(
      (0.25 + yieldFactor * 0.15) * proximity * facing * multiplier,
      0.06,
      0.96,
    );
    this.flashStrength = Math.max(this.flashStrength, strength);
    this.flashRemaining = Math.max(this.flashRemaining, 0.34);
  }

  private updateFlash(delta: number): void {
    if (this.flashRemaining <= 0) {
      this.deps.flashOverlay.style.opacity = '0';
      return;
    }
    this.flashRemaining = Math.max(0, this.flashRemaining - delta);
    const fade = this.flashRemaining / 0.34;
    const opacity = this.flashStrength * fade * fade;
    this.deps.flashOverlay.style.opacity = opacity.toFixed(3);
    if (this.flashRemaining <= 0) {
      this.flashStrength = 0;
      this.deps.flashOverlay.style.opacity = '0';
    }
  }

  /** Blast scars cool and vanish over one simulated year. */
  private updateLandScars(): void {
    const now = this.deps.getClockMs();
    for (let index = this.landScars.length - 1; index >= 0; index -= 1) {
      const scar = this.landScars[index]!;
      const age = Math.min(
        1,
        Math.max(0, (now - scar.createdAt) / SCAR_LIFETIME_MS),
      );
      const opacity = scar.material.uniforms.uOpacity;
      if (opacity) opacity.value = scar.opacity * (1 - age);
      if (age >= 1) {
        disposeObject(scar.object);
        this.landScars.splice(index, 1);
      }
    }
  }

  private cleanup(): void {
    for (let index = this.missiles.length - 1; index >= 0; index -= 1) {
      const missile = this.missiles[index];
      if (!missile.dead) continue;
      disposeObject(missile.group);
      disposeObject(missile.track);
      disposeObject(missile.zone);
      this.missiles.splice(index, 1);
    }
    for (let index = this.interceptors.length - 1; index >= 0; index -= 1) {
      const interceptor = this.interceptors[index];
      if (!interceptor.done) continue;
      disposeObject(interceptor.group);
      disposeObject(interceptor.track);
      this.interceptors.splice(index, 1);
    }
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      if (effect.age / effect.duration >= 1) this.effects.splice(index, 1);
    }
  }
}

interface EffectRadii {
  blastKm: number;
  burnKm: number;
  fireballKm: number;
  craterKm: number;
  severeKm: number;
  thermalKm: number;
}

function effectRadii(item: ProductionItem): EffectRadii {
  const yieldMt = Math.max(0.01, item.yieldMt ?? 0.05);
  const cubeRoot = Math.cbrt(yieldMt);
  const yieldKt = Math.max(1, yieldMt * 1000);
  const burnKm = Math.max(2.5, 9.55 * cubeRoot);
  return {
    // Approximate 5 psi radius (roughly 50% lethality outdoors).
    blastKm: Math.max(3, 10 * cubeRoot),
    // Approximate third-degree-burn radius.
    burnKm,
    // Fireball radius from the standard airburst approximation
    // R(km) ≈ 0.1 · Y(kt)^0.4.
    fireballKm: 0.1 * Math.pow(yieldKt, 0.4),
    // Apparent surface-burst crater radius scales as Y(kt)^0.3; 1 kt leaves
    // roughly an 18 m radius crater in dry soil. The small floor keeps a
    // tactical crater from collapsing below the renderer's precision.
    craterKm: Math.max(0.12, 0.0183 * Math.pow(yieldKt, 0.3)),
    // Approximate 20 psi radius, where survival is exceptional.
    severeKm: Math.max(1, 4.7 * cubeRoot),
    // Third-degree burns are the realistic outer scar, not a map-sized
    // exaggeration. The scar mesh itself is clipped to land.
    thermalKm: burnKm,
  };
}

/** Expected immediate fatalities by distance, using blast and burn bands. */
function fatalityRateAt(distanceKm: number, radii: EffectRadii): number {
  if (distanceKm <= radii.severeKm) return 0.98;

  if (distanceKm <= radii.blastKm) {
    const span = Math.max(0.001, radii.blastKm - radii.severeKm);
    return 0.98 - 0.48 * ((distanceKm - radii.severeKm) / span);
  }

  const outer = Math.max(radii.blastKm, radii.burnKm);
  if (distanceKm <= outer) {
    const span = Math.max(0.001, outer - radii.blastKm);
    return 0.5 - 0.2 * ((distanceKm - radii.blastKm) / span);
  }

  return 0;
}
