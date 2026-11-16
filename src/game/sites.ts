import type { PopulationField } from '../population/field';

const RAD = Math.PI / 180;

export interface SitePoint {
  lat: number;
  lon: number;
}

/**
 * Chooses one low-population land cell per country for its initial reactor.
 * Density is latitude-corrected so polar cells are not selected just because
 * their geographic area is small.
 */
export function findLeastPopulatedSites(
  field: PopulationField,
  countryCount: number,
  isInsideCountry?: (countryId: number, lat: number, lon: number) => boolean,
): Array<SitePoint | null> {
  const bestDensity = new Float64Array(countryCount).fill(Infinity);
  const bestCell = new Int32Array(countryCount).fill(-1);

  for (let cell = 0; cell < field.countryGrid.length; cell += 1) {
    const countryId = field.countryGrid[cell];
    if (countryId === undefined || countryId < 0 || countryId >= countryCount) continue;
    if (field.landMask[cell] !== 1) continue;

    // Rasterized coastlines and borders can contain blended-color cells that
    // are nearest to an unrelated country. Require an interior cell so a
    // reactor is never placed on a neighbor's border.
    const cellRow = Math.floor(cell / field.width);
    const cellCol = cell - cellRow * field.width;
    let interior = true;
    for (let dr = -1; dr <= 1 && interior; dr += 1) {
      const row = cellRow + dr;
      if (row < 0 || row >= field.height) continue;
      for (let dc = -1; dc <= 1; dc += 1) {
        const col = (cellCol + dc + field.width) % field.width;
        const neighbor = row * field.width + col;
        if (field.landMask[neighbor] === 1 && field.countryGrid[neighbor] !== countryId) {
          interior = false;
          break;
        }
      }
    }
    if (!interior) continue;

    const row = cellRow;
    const lat = 90 - (row + 0.5) * field.cellSize;
    if (lat < -60) continue;

    const density =
      (field.grid[cell] ?? 0) / Math.max(0.02, Math.cos(lat * RAD));
    if (density < bestDensity[countryId]!) {
      bestDensity[countryId] = density;
      bestCell[countryId] = cell;
    }
  }

  const sites = Array.from({ length: countryCount }, (_, countryId) => {
    const cell = bestCell[countryId];
    if (cell === undefined || cell < 0) return null;
    const row = Math.floor(cell / field.width);
    const col = cell - row * field.width;
    return {
      lat: 90 - (row + 0.5) * field.cellSize,
      lon: -180 + (col + 0.5) * field.cellSize,
    };
  });

  if (!isInsideCountry) return sites;

  // A low-population cell can sit on a coastline whose centre falls just
  // outside the polygon. Retry those countries with polygon validation.
  for (let countryId = 0; countryId < countryCount; countryId += 1) {
    const site = sites[countryId];
    if (!site || isInsideCountry(countryId, site.lat, site.lon)) continue;

    let bestDensity = Infinity;
    let best: SitePoint | null = null;
    for (let cell = 0; cell < field.countryGrid.length; cell += 1) {
      if (field.countryGrid[cell] !== countryId || field.landMask[cell] !== 1) continue;
      const row = Math.floor(cell / field.width);
      const lat = 90 - (row + 0.5) * field.cellSize;
      if (lat < -60) continue;
      const col = cell - row * field.width;
      const lon = -180 + (col + 0.5) * field.cellSize;
      if (!isInsideCountry(countryId, lat, lon)) continue;
      const density = (field.grid[cell] ?? 0) / Math.max(0.02, Math.cos(lat * RAD));
      if (density < bestDensity) {
        bestDensity = density;
        best = { lat, lon };
      }
    }
    sites[countryId] = best;
  }

  return sites;
}

interface SiteCandidate {
  lat: number;
  lon: number;
  density: number;
  interior: boolean;
  x: number;
  y: number;
  z: number;
}

/**
 * Chooses a spread of land sites for a nation's starting infrastructure.
 * The first site is its least-populated interior cell (the reactor site); the
 * rest are picked to be far from the sites already chosen so the initial
 * building icons do not pile up. A coastal slot is reserved for the dockyard
 * whenever the nation has an ocean coast.
 */
export function findBuildingSites(
  field: PopulationField,
  countryCount: number,
  count: number,
  coastalSlots: ReadonlySet<number> = new Set(),
  isCoastal?: (lat: number, lon: number) => boolean,
): SitePoint[][] {
  const cellsByCountry: number[][] = Array.from(
    { length: countryCount },
    () => [],
  );

  for (let cell = 0; cell < field.countryGrid.length; cell += 1) {
    const countryId = field.countryGrid[cell];
    if (countryId === undefined || countryId < 0 || countryId >= countryCount) {
      continue;
    }
    if (field.landMask[cell] !== 1) continue;
    const row = Math.floor(cell / field.width);
    const lat = 90 - (row + 0.5) * field.cellSize;
    if (lat < -60) continue;
    cellsByCountry[countryId]!.push(cell);
  }

  return cellsByCountry.map((cells) => {
    if (cells.length === 0) return [];

    const candidates: SiteCandidate[] = cells.map((cell) => {
      const row = Math.floor(cell / field.width);
      const col = cell - row * field.width;
      const lat = 90 - (row + 0.5) * field.cellSize;
      const lon = -180 + (col + 0.5) * field.cellSize;
      let interior = true;
      for (let dr = -1; dr <= 1 && interior; dr += 1) {
        const sampleRow = row + dr;
        if (sampleRow < 0 || sampleRow >= field.height) continue;
        for (let dc = -1; dc <= 1; dc += 1) {
          const sampleCol = (col + dc + field.width) % field.width;
          const neighbor = sampleRow * field.width + sampleCol;
          if (
            field.landMask[neighbor] === 1 &&
            field.countryGrid[neighbor] !== field.countryGrid[cell]
          ) {
            interior = false;
            break;
          }
        }
      }
      const latRadians = lat * RAD;
      const lonRadians = lon * RAD;
      return {
        lat,
        lon,
        density:
          (field.grid[cell] ?? 0) / Math.max(0.02, Math.cos(latRadians)),
        interior,
        x: Math.cos(latRadians) * Math.cos(lonRadians),
        y: Math.sin(latRadians),
        z: Math.cos(latRadians) * Math.sin(lonRadians),
      };
    });

    const selected: SiteCandidate[] = [];
    const used = new Set<number>();
    const firstPool = candidates.some((candidate) => candidate.interior)
      ? candidates.filter((candidate) => candidate.interior)
      : candidates;
    const first = firstPool.reduce((best, candidate) =>
      candidate.density < best.density ? candidate : best,
    );
    selected.push(first);
    used.add(candidates.indexOf(first));

    for (let slot = 1; slot < count; slot += 1) {
      const needsCoast = coastalSlots.has(slot) && Boolean(isCoastal);
      let bestIndex = -1;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (let index = 0; index < candidates.length; index += 1) {
        if (used.has(index)) continue;
        const candidate = candidates[index]!;
        if (needsCoast && !isCoastal!(candidate.lat, candidate.lon)) continue;

        let nearestDot = 1;
        for (const site of selected) {
          const dot =
            candidate.x * site.x + candidate.y * site.y + candidate.z * site.z;
          if (dot < nearestDot) nearestDot = dot;
        }
        // Larger separation is better. A tiny interior bonus breaks ties
        // without pulling a later site away from a remote coast.
        const score = -nearestDot + (candidate.interior ? 1e-9 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }

      if (bestIndex < 0) {
        // Landlocked nations still get a dockyard. Use the remaining land
        // instead of leaving the building out of their starting kit.
        if (needsCoast) {
          for (let index = 0; index < candidates.length; index += 1) {
            if (used.has(index)) continue;
            const candidate = candidates[index]!;
            let nearestDot = 1;
            for (const site of selected) {
              const dot =
                candidate.x * site.x +
                candidate.y * site.y +
                candidate.z * site.z;
              if (dot < nearestDot) nearestDot = dot;
            }
            const score = -nearestDot + (candidate.interior ? 1e-9 : 0);
            if (score > bestScore) {
              bestScore = score;
              bestIndex = index;
            }
          }
        }
      }

      if (bestIndex < 0) break;
      selected.push(candidates[bestIndex]!);
      used.add(bestIndex);
    }

    if (selected.length === 0) return [];
    while (selected.length < count) {
      const last = selected[selected.length - 1]!;
      selected.push(last);
    }
    return selected.map((site) => ({ lat: site.lat, lon: site.lon }));
  });
}