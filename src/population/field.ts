import { heatColor } from './ramp';

const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;
const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_YEAR = 365.2425 * SECONDS_PER_DAY;
const GLOBAL_ANNUAL_GROWTH = 0.0085;

export interface StrikeResult {
  /** People removed from the field by this strike. */
  killed: number;
  /** People remaining on the planet after the strike. */
  remaining: number;
  /** Share of the pre-strike world population killed by this strike. */
  fraction: number;
}

export interface StrikeEvent {
  lat: number;
  lon: number;
  /** Radius used for light blackout and the visible strike burst. */
  radiusKm: number;
  killed: number;
  remaining: number;
}

export type PopulationChangeListener = () => void;
export type StrikeListener = (event: StrikeEvent) => void;

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

/**
 * A mutable, fixed-resolution population raster. The field is the invisible
 * heatmap: it is rendered only in population mode, and every strike subtracts
 * the affected people so the map reflects the session's losses.
 */
export class PopulationField {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly grid: Float32Array;
  readonly landMask: Uint8Array;
  readonly countryGrid: Int16Array;
  /** Current national populations, indexed exactly like `countryGrid`. */
  readonly countryPopulation: Float64Array;

  private readonly rowArea: Float32Array;
  private readonly countryArea: Float64Array;
  private readonly listeners = new Set<PopulationChangeListener>();
  private readonly strikeListeners = new Set<StrikeListener>();
  private readonly heatCanvas: HTMLCanvasElement;
  private countryGrowthRates: Float32Array;
  private restPopulation = 0;
  private growthRemainder = 0;
  private heatDirty = true;
  private _total = 0;

  constructor(
    width: number,
    height: number,
    grid: Float32Array,
    landMask: Uint8Array,
    countryGrid: Int16Array,
  ) {
    this.width = width;
    this.height = height;
    this.cellSize = 180 / height;
    this.grid = grid;
    this.landMask = landMask;
    this.countryGrid = countryGrid;

    this.rowArea = new Float32Array(height);
    for (let row = 0; row < height; row += 1) {
      const latTop = 90 - row * this.cellSize;
      const latBottom = latTop - this.cellSize;
      this.rowArea[row] =
        EARTH_RADIUS_KM *
        EARTH_RADIUS_KM *
        this.cellSize *
        RAD *
        (Math.sin(latTop * RAD) - Math.sin(latBottom * RAD));
    }

    for (let i = 0; i < grid.length; i += 1) this._total += grid[i];

    let countryCount = 0;
    for (let i = 0; i < countryGrid.length; i += 1) {
      countryCount = Math.max(countryCount, countryGrid[i] + 1);
    }
    this.countryPopulation = new Float64Array(countryCount);
    this.countryArea = new Float64Array(countryCount);
    let assignedPopulation = 0;
    for (let row = 0; row < height; row += 1) {
      const area = this.rowArea[row];
      for (let col = 0; col < width; col += 1) {
        const index = row * width + col;
        const country = countryGrid[index]!;
        if (country < 0) continue;
        const population = grid[index]!;
        this.countryPopulation[country] += population;
        this.countryArea[country] += area;
        assignedPopulation += population;
      }
    }
    this.restPopulation = Math.max(0, this._total - assignedPopulation);
    this.countryGrowthRates = new Float32Array(countryCount).fill(
      GLOBAL_ANNUAL_GROWTH,
    );

    this.heatCanvas = document.createElement('canvas');
    this.heatCanvas.width = width;
    this.heatCanvas.height = height;
  }

  get total(): number {
    return this._total;
  }

  /** Annual growth rates indexed like `countryGrid`. */
  setCountryGrowthRates(rates: ArrayLike<number>): void {
    this.countryGrowthRates.fill(GLOBAL_ANNUAL_GROWTH);
    const count = Math.min(this.countryGrowthRates.length, rates.length);
    for (let index = 0; index < count; index += 1) {
      this.countryGrowthRates[index] = rates[index]!;
    }
  }

  populationForCountry(index: number): number {
    return this.countryPopulation[index] ?? 0;
  }

  /**
   * Grows national populations continuously. The raster is rebalanced once
   * per simulated day so denser urban cells gain somewhat faster than rural
   * cells without changing the national totals.
   */
  grow(seconds: number): void {
    if (!(seconds > 0)) return;
    const years = seconds / SECONDS_PER_YEAR;
    let added = 0;

    for (let country = 0; country < this.countryPopulation.length; country += 1) {
      const population = this.countryPopulation[country]!;
      if (!(population > 0)) continue;
      const rate = this.countryGrowthRates[country] ?? GLOBAL_ANNUAL_GROWTH;
      const next = population * Math.exp(rate * years);
      this.countryPopulation[country] = next;
      added += next - population;
    }

    if (this.restPopulation > 0) {
      const next = this.restPopulation * Math.exp(GLOBAL_ANNUAL_GROWTH * years);
      added += next - this.restPopulation;
      this.restPopulation = next;
    }

    this._total = Math.max(0, this._total + added);
    this.growthRemainder += seconds;
    const days = Math.floor(this.growthRemainder / SECONDS_PER_DAY);
    if (days <= 0) return;
    this.growthRemainder -= days * SECONDS_PER_DAY;
    this.syncRaster();
  }

  /** Merges a defeated nation's people and territory into the victor. */
  mergeCountry(from: number, to: number): void {
    if (from < 0 || to < 0 || from === to) return;
    if (from >= this.countryPopulation.length || to >= this.countryPopulation.length) {
      return;
    }
    this.countryPopulation[to] += this.countryPopulation[from]!;
    this.countryArea[to] += this.countryArea[from]!;
    this.countryPopulation[from] = 0;
    this.countryArea[from] = 0;
    for (let i = 0; i < this.countryGrid.length; i += 1) {
      if (this.countryGrid[i] === from) this.countryGrid[i] = to;
    }
  }

  /** Rebuilds national totals after country borders or ownership change. */
  reindexCountries(): void {
    this.countryPopulation.fill(0);
    this.countryArea.fill(0);
    let assigned = 0;
    for (let row = 0; row < this.height; row += 1) {
      const area = this.rowArea[row]!;
      for (let col = 0; col < this.width; col += 1) {
        const index = row * this.width + col;
        const country = this.countryGrid[index]!;
        if (country < 0 || country >= this.countryPopulation.length) continue;
        const population = this.grid[index]!;
        this.countryPopulation[country] += population;
        this.countryArea[country] += area;
        assigned += population;
      }
    }
    this.restPopulation = Math.max(0, this._total - assigned);
    this.heatDirty = true;
    for (const listener of this.listeners) listener();
  }

  onChange(listener: PopulationChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Fires after a strike has removed people, before the heatmap listeners run. */
  onStrike(listener: StrikeListener): () => void {
    this.strikeListeners.add(listener);
    return () => this.strikeListeners.delete(listener);
  }

  /** Persons per km² at a point, using the nearest cell. */
  densityAt(lat: number, lon: number): number {
    const row = Math.min(
      this.height - 1,
      Math.max(0, Math.floor((90 - lat) / this.cellSize)),
    );
    const col = wrap(Math.floor((lon + 180) / this.cellSize), this.width);
    return this.grid[row * this.width + col] / this.rowArea[row];
  }

  /** Population inside a great-circle radius. Cells are area-supersampled at local scales. */
  populationInRadius(lat: number, lon: number, radiusKm: number): number {
    let population = 0;
    this.forEachCellInCircle(lat, lon, radiusKm, (index, fraction) => {
      population += this.grid[index] * fraction;
    });
    return population;
  }

  /**
   * Removes people inside the radius from the session's heatmap and returns
   * the casualty count. Removal is proportional to each cell's coverage so it
   * matches populationInRadius for the same radius.
   */
  strike(
    lat: number,
    lon: number,
    radiusKm: number,
    fatalityRateAtDistance: (distanceKm: number) => number = () => 1,
    eventRadiusKm = radiusKm,
  ): StrikeResult {
    const before = this._total;
    let killed = 0;

    this.forEachCellInCircle(lat, lon, radiusKm, (index, fraction, distanceKm) => {
      const fatalityRate = Math.min(
        1,
        Math.max(0, fatalityRateAtDistance(distanceKm)),
      );
      const removed = this.grid[index] * fraction * fatalityRate;
      if (removed <= 0) return;
      this.grid[index] -= removed;
      killed += removed;

      const country = this.countryGrid[index]!;
      if (country >= 0 && country < this.countryPopulation.length) {
        this.countryPopulation[country] = Math.max(
          0,
          this.countryPopulation[country]! - removed,
        );
      } else {
        this.restPopulation = Math.max(0, this.restPopulation - removed);
      }
    });

    this._total = Math.max(0, this._total - killed);
    this.heatDirty = true;

    const event: StrikeEvent = {
      lat,
      lon,
      radiusKm: eventRadiusKm,
      killed,
      remaining: this._total,
    };
    for (const listener of this.strikeListeners) listener(event);
    for (const listener of this.listeners) listener();

    return {
      killed,
      remaining: this._total,
      fraction: before > 0 ? killed / before : 0,
    };
  }

  getHeatCanvas(): HTMLCanvasElement {
    if (!this.heatDirty) return this.heatCanvas;

    const ctx = this.heatCanvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is unavailable.');

    const image = ctx.createImageData(this.width, this.height);
    const data = image.data;
    const color: [number, number, number] = [0, 0, 0];
    let offset = 0;

    for (let row = 0; row < this.height; row += 1) {
      const area = this.rowArea[row];
      for (let col = 0; col < this.width; col += 1) {
        const density = this.grid[row * this.width + col] / area;
        heatColor(density, color);
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = 255;
        offset += 4;
      }
    }

    ctx.putImageData(image, 0, 0);
    this.heatDirty = false;
    return this.heatCanvas;
  }

  /** Rebalances the raster to the current national totals and urbanizes it. */
  private syncRaster(): void {
    const countrySum = new Float64Array(this.countryPopulation.length);
    const meanDensity = new Float64Array(this.countryPopulation.length);
    for (let country = 0; country < this.countryPopulation.length; country += 1) {
      const area = this.countryArea[country]!;
      if (area > 0) {
        meanDensity[country] = this.countryPopulation[country]! / area;
      }
    }

    let restSum = 0;
    for (let row = 0; row < this.height; row += 1) {
      const area = this.rowArea[row]!;
      for (let col = 0; col < this.width; col += 1) {
        const index = row * this.width + col;
        const country = this.countryGrid[index]!;
        const population = this.grid[index]!;
        if (country < 0) {
          restSum += population;
          continue;
        }
        if (!(this.countryPopulation[country]! > 0)) {
          this.grid[index] = 0;
          continue;
        }

        const density = population / area;
        const ratio = density / Math.max(1e-9, meanDensity[country]!);
        const urbanWeight = Math.max(
          0.38,
          Math.min(1.7, 0.75 + 0.45 * Math.log10(Math.max(0.01, ratio))),
        );
        const next = population * urbanWeight;
        this.grid[index] = next;
        countrySum[country] += next;
      }
    }

    for (let row = 0; row < this.height; row += 1) {
      for (let col = 0; col < this.width; col += 1) {
        const index = row * this.width + col;
        const country = this.countryGrid[index]!;
        if (country < 0) {
          if (restSum > 0) {
            this.grid[index] *= this.restPopulation / restSum;
          }
          continue;
        }
        const denominator = countrySum[country]!;
        this.grid[index] =
          denominator > 0
            ? this.grid[index]! * (this.countryPopulation[country]! / denominator)
            : 0;
      }
    }

    let total = this.restPopulation;
    for (let country = 0; country < this.countryPopulation.length; country += 1) {
      total += this.countryPopulation[country]!;
    }
    this._total = total;
    this.heatDirty = true;
    for (const listener of this.listeners) listener();
  }

  private forEachCellInCircle(
    lat: number,
    lon: number,
    radiusKm: number,
    visit: (index: number, fraction: number, distanceKm: number) => void,
  ): void {
    if (!(radiusKm > 0)) return;

    const latSpan = radiusKm / 111.195;
    const cosLat = Math.cos(lat * RAD);
    const lonSpan =
      latSpan >= 89.5 ? 180 : Math.min(180, latSpan / Math.max(0.01, Math.abs(cosLat)));

    const north = Math.min(90, lat + latSpan);
    const south = Math.max(-90, lat - latSpan);
    const rowStart = Math.max(0, Math.floor((90 - north) / this.cellSize));
    const rowEnd = Math.min(
      this.height - 1,
      Math.floor((90 - south) / this.cellSize),
    );

    let colStart = Math.floor((lon - lonSpan + 180) / this.cellSize);
    let colCount = Math.ceil((lonSpan * 2) / this.cellSize) + 1;
    if (lonSpan >= 180) {
      colStart = 0;
      colCount = this.width;
    }
    colCount = Math.min(colCount, this.width);
    colStart = wrap(colStart, this.width);

    const samples = radiusKm < 2500 ? 4 : 1;
    const sampleWeight = 1 / (samples * samples);
    const sampleStep = this.cellSize / samples;

    for (let row = rowStart; row <= rowEnd; row += 1) {
      const latTop = 90 - row * this.cellSize;
      for (let k = 0; k < colCount; k += 1) {
        const col = (colStart + k) % this.width;
        let hits = 0;
        let hitDistanceSum = 0;

        for (let sy = 0; sy < samples; sy += 1) {
          const sampleLat = latTop - (sy + 0.5) * sampleStep;
          for (let sx = 0; sx < samples; sx += 1) {
            const sampleLon = -180 + (col + (sx + 0.5) / samples) * this.cellSize;
            const distance = greatCircleKm(lat, lon, sampleLat, sampleLon);
            if (distance <= radiusKm) {
              hits += 1;
              hitDistanceSum += distance;
            }
          }
        }

        if (hits > 0) {
          // Use the mean distance of the covered samples. A cell centre can
          // lie outside a small tactical blast even when part of the cell is
          // inside it.
          visit(
            row * this.width + col,
            hits * sampleWeight,
            hitDistanceSum / hits,
          );
        }
      }
    }
  }
}
