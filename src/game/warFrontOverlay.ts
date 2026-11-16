import * as THREE from 'three';
import type { CountryData } from '../geo/types';
import { NATURAL_KIND_ORDER, NATURAL_MOVEMENT_COST } from '../geo/natural';
import type { PopulationField } from '../population/field';
import type { WarFront } from './warfare';

const OVERLAY_RADIUS = 1.0015;
const RED_FILL = [231, 43, 43, 104] as const;
const RED_FRONTIER = [255, 104, 104, 236] as const;
const RED_GLOW = [255, 74, 74, 34] as const;

interface Component {
  cells: number[];
  coastal: number[];
}

interface CountryShape {
  cells: number[];
  components: Component[];
}

interface OccupationPlan {
  cells: number[];
  totalEnemyCells: number;
  navalComponents: number;
  hasLandAccess: boolean;
}

class MinHeap {
  private readonly indices: number[] = [];
  private readonly costs: number[] = [];

  get size(): number {
    return this.indices.length;
  }

  push(index: number, cost: number): void {
    this.indices.push(index);
    this.costs.push(cost);
    let child = this.indices.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if ((this.costs[parent] ?? Infinity) <= cost) break;
      this.indices[child] = this.indices[parent] ?? 0;
      this.costs[child] = this.costs[parent] ?? Infinity;
      child = parent;
    }
    this.indices[child] = index;
    this.costs[child] = cost;
  }

  pop(): { index: number; cost: number } | null {
    if (this.indices.length === 0) return null;

    const index = this.indices[0] ?? 0;
    const cost = this.costs[0] ?? Infinity;
    const lastIndex = this.indices.pop() ?? 0;
    const lastCost = this.costs.pop() ?? Infinity;
    if (this.indices.length > 0) {
      let parent = 0;
      const length = this.indices.length;
      while (true) {
        let child = parent * 2 + 1;
        if (child >= length) break;
        const right = child + 1;
        if (right < length && (this.costs[right] ?? Infinity) < (this.costs[child] ?? Infinity)) {
          child = right;
        }
        if ((this.costs[child] ?? Infinity) >= lastCost) break;
        this.indices[parent] = this.indices[child] ?? 0;
        this.costs[parent] = this.costs[child] ?? Infinity;
        parent = child;
      }
      this.indices[parent] = lastIndex;
      this.costs[parent] = lastCost;
    }
    return { index, cost };
  }
}

/**
 * A war is drawn as a terrain-aware occupied-area raster. It is seeded from
 * the actual shared border, propagates only across contiguous enemy land, and
 * uses higher movement costs in mountains, jungles, wetlands, deserts and ice.
 * Detached enemy land has no land seeds until a naval invasion is launched.
 */
export class WarFrontOverlay {
  readonly group = new THREE.Group();
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  readonly mesh: THREE.Mesh;

  private readonly width: number;
  private readonly height: number;
  private readonly countryGrid: Int16Array;
  private readonly landMask: Uint8Array;
  private readonly naturalField: Uint8Array;
  private readonly countryIndex: Map<string, number>;
  private readonly capitalCells = new Map<number, number>();
  private readonly secondaryCapitalCells = new Map<number, number[]>();
  private readonly shapeCache = new Map<number, CountryShape>();
  private readonly planCache = new Map<string, OccupationPlan>();
  private readonly occupied: Uint8Array;
  private readonly owner: Int16Array;
  private readonly image: ImageData;
  private readonly ctx: CanvasRenderingContext2D;
  private coalitionKey = '';
  private lastPaint = 0;
  private _count = 0;

  constructor(
    field: PopulationField,
    naturalField: Uint8Array,
    countries: readonly CountryData[],
  ) {
    this.width = field.width;
    this.height = field.height;
    this.countryGrid = field.countryGrid;
    this.landMask = field.landMask;
    this.naturalField = naturalField;
    this.countryIndex = new Map(countries.map((country, index) => [country.name, index]));
    for (let index = 0; index < countries.length; index += 1) {
      const country = countries[index];
      if (!country) continue;
      const cell = this.findCapitalCell(
        country.capitalLat,
        country.capitalLon,
        index,
      );
      if (cell !== null) this.capitalCells.set(index, cell);
      const secondary = this.findCapitalCell(
        country.secondaryCapitalLat ?? null,
        country.secondaryCapitalLon ?? null,
        index,
      );
      if (secondary !== null && secondary !== cell) {
        this.secondaryCapitalCells.set(index, [secondary]);
      }
    }

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is unavailable.');
    this.ctx = ctx;
    this.image = ctx.createImageData(this.width, this.height);
    this.occupied = new Uint8Array(this.width * this.height);
    this.owner = new Int16Array(this.width * this.height);
    this.owner.fill(-1);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;

    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(OVERLAY_RADIUS, 192, 128),
      material,
    );
    this.mesh.renderOrder = 3;
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  get count(): number {
    return this._count;
  }

  /** Drops cached territories after an annexation changes country ownership. */
  invalidate(): void {
    this.shapeCache.clear();
    this.planCache.clear();
    this.lastPaint = 0;
  }

  /**
   * Recomputes front status and, at a bounded rate, the occupation raster.
   * Front objects are intentionally updated in place because the war status
   * panel reads them immediately after this call.
   */
  setFronts(
    fronts: readonly WarFront[],
    player: string | null,
    allies: readonly string[],
  ): void {
    this._count = fronts.length;
    const coalition = new Set<number>();
    if (player) {
      const playerId = this.countryIndex.get(player);
      if (playerId !== undefined) coalition.add(playerId);
    }
    for (const ally of allies) {
      const id = this.countryIndex.get(ally);
      if (id !== undefined) coalition.add(id);
    }

    const coalitionKey = [...coalition].sort((a, b) => a - b).join(',');
    if (coalitionKey !== this.coalitionKey) {
      this.coalitionKey = coalitionKey;
      this.planCache.clear();
    }

    const selected: number[] = [];
    this.owner.fill(-1);
    if (coalition.size > 0) {
      for (const front of fronts) {
        const enemyId = this.countryIndex.get(front.enemy);
        if (enemyId === undefined) continue;

        const plan = this.getPlan(enemyId, coalitionKey, coalition, front.navalInvaded);
        const capitalCell = this.capitalCells.get(enemyId) ?? -1;
        const secondaryCells = this.secondaryCapitalCells.get(enemyId) ?? [];
        const secondarySet = new Set(secondaryCells);
        let capitalOccupied = false;
        let secondaryCapitalsOccupied = 0;
        front.navalComponents = plan.navalComponents;
        front.navalRequired = plan.navalComponents > 0 && !front.navalInvaded;
        front.hasLandAccess = plan.hasLandAccess;
        for (const cell of plan.cells) {
          if (this.owner[cell] === -1) this.owner[cell] = enemyId;
        }

        const fraction = Math.max(0, Math.min(100, front.progress)) / 100;
        const target = Math.round(plan.cells.length * fraction);
        for (let i = 0; i < target; i += 1) {
          const cell = plan.cells[i];
          if (cell !== undefined) {
            selected.push(cell);
            this.owner[cell] = enemyId;
            if (cell === capitalCell) capitalOccupied = true;
            if (secondarySet.has(cell)) secondaryCapitalsOccupied += 1;
          }
        }

        front.occupiedPercent = plan.totalEnemyCells > 0
          ? (target / plan.totalEnemyCells) * 100
          : 0;
        front.warScore = Math.min(
          100,
          front.occupiedPercent + secondaryCapitalsOccupied * 15,
        );
        front.capitalOccupied = capitalOccupied;
        front.secondaryCapitalsOccupied = secondaryCapitalsOccupied;
        front.secondaryCapitalsTotal = secondaryCells.length;
        front.surrenderThreshold = capitalOccupied ? 75 : 95;
        front.surrendered = plan.totalEnemyCells > 0 &&
          front.warScore + 1e-9 >= front.surrenderThreshold;
        front.breakthrough = front.progress >= 100 && !front.navalRequired;
      }
    }

    const now = performance.now();
    if (now - this.lastPaint < 140 && this.lastPaint !== 0) return;
    this.lastPaint = now;
    this.paint(selected);
  }

  /** The field cell containing a capital, searching a few cells for coastlines. */
  private findCapitalCell(
    lat: number | null,
    lon: number | null,
    countryId: number,
  ): number | null {
    if (lat === null || lon === null) return null;

    const cellSize = 180 / this.height;
    const baseRow = Math.floor((90 - lat) / cellSize);
    const baseCol = Math.floor((lon + 180) / cellSize);
    let best: number | null = null;
    let bestDistance = Infinity;

    for (let dr = -3; dr <= 3; dr += 1) {
      const row = baseRow + dr;
      if (row < 0 || row >= this.height) continue;
      for (let dc = -3; dc <= 3; dc += 1) {
        const col = ((baseCol + dc) % this.width + this.width) % this.width;
        const cell = row * this.width + col;
        if (this.countryGrid[cell] !== countryId) continue;
        const distance = dr * dr + dc * dc;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = cell;
        }
      }
    }

    return best;
  }

  private getPlan(
    enemyId: number,
    coalitionKey: string,
    coalition: ReadonlySet<number>,
    navalInvaded: boolean,
  ): OccupationPlan {
    const key = `${enemyId}|${coalitionKey}|${navalInvaded ? 1 : 0}`;
    const cached = this.planCache.get(key);
    if (cached) return cached;

    const shape = this.getShape(enemyId);
    const accessible: Uint8Array = new Uint8Array(this.width * this.height);
    const seeds: number[] = [];
    const landComponents: number[] = [];
    const navalComponents: number[] = [];
    let includedCells = 0;

    for (const component of shape.components) {
      let hasLandAccess = false;
      for (const cell of component.cells) {
        if (this.hasCoalitionNeighbor(cell, coalition)) {
          hasLandAccess = true;
          break;
        }
      }

      if (hasLandAccess) {
        landComponents.push(1);
        includedCells += component.cells.length;
        for (const cell of component.cells) {
          accessible[cell] = 1;
          if (this.hasCoalitionNeighbor(cell, coalition)) seeds.push(cell);
        }
      } else if (component.coastal.length > 0) {
        navalComponents.push(1);
        includedCells += component.cells.length;
        if (navalInvaded) {
          for (const cell of component.cells) accessible[cell] = 1;
          for (const cell of component.coastal) seeds.push(cell);
        }
      }
    }

    const plan: OccupationPlan = {
      cells: [],
      totalEnemyCells: includedCells,
      navalComponents: navalComponents.length,
      hasLandAccess: landComponents.length > 0,
    };

    if (seeds.length === 0) {
      this.planCache.set(key, plan);
      return plan;
    }

    // Multi-source Dijkstra. The destination cell's terrain sets the movement
    // price, so advancing up a mountain is dramatically slower than crossing a
    // plain, while the front still grows as one continuous occupied shape.
    const costs = new Float32Array(this.width * this.height);
    costs.fill(Infinity);
    const heap = new MinHeap();
    for (const seed of seeds) {
      if (costs[seed] === 0) continue;
      costs[seed] = 0;
      heap.push(seed, 0);
    }

    while (heap.size > 0) {
      const entry = heap.pop();
      if (!entry) break;
      const current = entry.index;
      if (entry.cost > (costs[current] ?? Infinity) + 1e-6) continue;

      const row = Math.floor(current / this.width);
      const col = current - row * this.width;

      for (let dr = -1; dr <= 1; dr += 1) {
        const nextRow = row + dr;
        if (nextRow < 0 || nextRow >= this.height) continue;
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          const nextCol = (col + dc + this.width) % this.width;
          const next = nextRow * this.width + nextCol;
          if (accessible[next] !== 1) continue;

          const code = this.naturalField[next] ?? 0;
          const kind = code > 0 ? NATURAL_KIND_ORDER[code - 1] : undefined;
          const terrainCost = kind ? NATURAL_MOVEMENT_COST[kind] : 1;
          const step = dr !== 0 && dc !== 0 ? Math.SQRT2 : 1;
          const nextCost = entry.cost + step * terrainCost;
          if (nextCost + 1e-6 >= (costs[next] ?? Infinity)) continue;
          costs[next] = nextCost;
          heap.push(next, nextCost);
        }
      }
    }

    const accessibleCells: number[] = [];
    for (let i = 0; i < accessible.length; i += 1) {
      if (accessible[i] === 1 && Number.isFinite(costs[i])) accessibleCells.push(i);
    }
    accessibleCells.sort((a, b) => (costs[a] ?? Infinity) - (costs[b] ?? Infinity));
    plan.cells = accessibleCells;
    this.planCache.set(key, plan);
    return plan;
  }

  private getShape(countryId: number): CountryShape {
    const cached = this.shapeCache.get(countryId);
    if (cached) return cached;

    const cells: number[] = [];
    for (let i = 0; i < this.countryGrid.length; i += 1) {
      if (this.countryGrid[i] === countryId && this.landMask[i] === 1) cells.push(i);
    }

    const visited = new Uint8Array(this.width * this.height);
    const components: Component[] = [];

    for (const start of cells) {
      if (visited[start] === 1) continue;
      const componentCells: number[] = [];
      const queue = [start];
      visited[start] = 1;

      for (let head = 0; head < queue.length; head += 1) {
        const cell = queue[head];
        if (cell === undefined) continue;
        componentCells.push(cell);
        const row = Math.floor(cell / this.width);
        const col = cell - row * this.width;

        for (let dr = -1; dr <= 1; dr += 1) {
          const nextRow = row + dr;
          if (nextRow < 0 || nextRow >= this.height) continue;
          for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) continue;
            const nextCol = (col + dc + this.width) % this.width;
            const next = nextRow * this.width + nextCol;
            if (
              visited[next] === 1 ||
              this.countryGrid[next] !== countryId ||
              this.landMask[next] !== 1
            ) {
              continue;
            }
            visited[next] = 1;
            queue.push(next);
          }
        }
      }

      const coastal: number[] = [];
      for (const cell of componentCells) {
        const row = Math.floor(cell / this.width);
        const col = cell - row * this.width;
        let touchesWater = false;
        for (let dr = -1; dr <= 1 && !touchesWater; dr += 1) {
          const nextRow = row + dr;
          if (nextRow < 0 || nextRow >= this.height) {
            touchesWater = true;
            break;
          }
          for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) continue;
            const nextCol = (col + dc + this.width) % this.width;
            const next = nextRow * this.width + nextCol;
            if (this.landMask[next] === 0) {
              touchesWater = true;
              break;
            }
          }
        }
        if (touchesWater) coastal.push(cell);
      }

      components.push({ cells: componentCells, coastal });
    }

    const shape: CountryShape = { cells, components };
    this.shapeCache.set(countryId, shape);
    return shape;
  }

  private hasCoalitionNeighbor(cell: number, coalition: ReadonlySet<number>): boolean {
    const row = Math.floor(cell / this.width);
    const col = cell - row * this.width;
    for (let dr = -1; dr <= 1; dr += 1) {
      const nextRow = row + dr;
      if (nextRow < 0 || nextRow >= this.height) continue;
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const nextCol = (col + dc + this.width) % this.width;
        const next = nextRow * this.width + nextCol;
        if (this.landMask[next] === 1 && coalition.has(this.countryGrid[next] ?? -1)) {
          return true;
        }
      }
    }
    return false;
  }

  private paint(selected: readonly number[]): void {
    const data = this.image.data;
    data.fill(0);
    this.occupied.fill(0);
    for (const cell of selected) this.occupied[cell] = 1;

    for (const cell of selected) {
      const offset = cell * 4;
      data[offset] = RED_FILL[0];
      data[offset + 1] = RED_FILL[1];
      data[offset + 2] = RED_FILL[2];
      data[offset + 3] = RED_FILL[3];
    }

    // A brighter red frontier and a faint outside glow make the leading edge
    // readable without drawing a separate geometric line.
    for (const cell of selected) {
      const row = Math.floor(cell / this.width);
      const col = cell - row * this.width;
      const owner = this.owner[cell] ?? -1;
      let frontier = false;
      for (let dr = -1; dr <= 1; dr += 1) {
        const nextRow = row + dr;
        if (nextRow < 0 || nextRow >= this.height) {
          frontier = true;
          continue;
        }
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          const nextCol = (col + dc + this.width) % this.width;
          const next = nextRow * this.width + nextCol;
          if (this.occupied[next] === 1) continue;
          if (this.owner[next] === owner && this.landMask[next] === 1) {
            const offset = next * 4;
            if (data[offset + 3] === 0) {
              data[offset] = RED_GLOW[0];
              data[offset + 1] = RED_GLOW[1];
              data[offset + 2] = RED_GLOW[2];
              data[offset + 3] = RED_GLOW[3];
            }
          }
          frontier = true;
        }
      }
      if (frontier) {
        const offset = cell * 4;
        data[offset] = RED_FRONTIER[0];
        data[offset + 1] = RED_FRONTIER[1];
        data[offset + 2] = RED_FRONTIER[2];
        data[offset + 3] = RED_FRONTIER[3];
      }
    }

    this.ctx.putImageData(this.image, 0, 0);
    this.texture.needsUpdate = true;
  }
}
