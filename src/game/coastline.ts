import type { PopulationField } from '../population/field';

const COAST_RADIUS_CELLS = 1;

/** True when the clicked cell is land in the 1440×720 land mask. */
export function isLandAt(
  field: PopulationField,
  lat: number,
  lon: number,
): boolean {
  const { width, height, cellSize, landMask } = field;
  const row = Math.min(
    height - 1,
    Math.max(0, Math.floor((90 - lat) / cellSize)),
  );
  const col =
    ((Math.floor((lon + 180) / cellSize) % width) + width) % width;
  return landMask[row * width + col] === 1;
}

/**
 * True when a point is on land in the narrow band where land meets the open
 * ocean. Lake water is excluded, so an inland lake shore is not valid. The
 * test uses the same 1440×720 masks as the population field.
 */
export function isOceanCoastline(
  field: PopulationField,
  lakeMask: Uint8Array,
  lat: number,
  lon: number,
): boolean {
  const { width, height, cellSize, landMask } = field;
  const row = Math.min(
    height - 1,
    Math.max(0, Math.floor((90 - lat) / cellSize)),
  );
  const col =
    ((Math.floor((lon + 180) / cellSize) % width) + width) % width;

  if (landMask[row * width + col] !== 1) return false;

  let hasLand = false;
  let hasOcean = false;

  for (let dy = -COAST_RADIUS_CELLS; dy <= COAST_RADIUS_CELLS; dy += 1) {
    const sampleRow = Math.min(height - 1, Math.max(0, row + dy));
    for (let dx = -COAST_RADIUS_CELLS; dx <= COAST_RADIUS_CELLS; dx += 1) {
      const sampleCol = (col + dx + width) % width;
      const index = sampleRow * width + sampleCol;

      if (landMask[index] === 1) {
        hasLand = true;
      } else if (lakeMask[index] === 0) {
        hasOcean = true;
      }

      if (hasLand && hasOcean) return true;
    }
  }

  return false;
}
