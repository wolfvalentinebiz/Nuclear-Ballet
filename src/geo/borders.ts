import { latToY, lonToX } from './raster';
import { isInternalCountryEdge } from './countries';
import type { CountriesData } from './types';

const BORDER_WIDTH = 2048;
const BORDER_HEIGHT = 1024;
const CENTERLINE_WIDTH = 1;
const MAX_DISTANCE = 64;
const SQRT2 = Math.SQRT2;

/**
 * Draws every admin-0 outline into an 8-bit distance field. Distance 0 is the
 * border centerline and 255 is MAX_DISTANCE texture pixels away. The globe
 * shader turns that field into a line whose width stays constant on screen at
 * every zoom level.
 */
export function createBorderCanvas(
  countries: CountriesData,
  merged: ReadonlySet<string> = new Set<string>(),
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = BORDER_WIDTH;
  canvas.height = BORDER_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable.');

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = CENTERLINE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const country of countries.countries) {
    for (const polygon of country.polygons) {
      for (const ring of polygon) {
        if (ring.length < 6) continue;

        let minLon = Infinity;
        let maxLon = -Infinity;
        for (let i = 0; i < ring.length; i += 2) {
          const lon = ring[i] ?? 0;
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
        }

        for (const shift of [-360, 0, 360]) {
          if (maxLon + shift < -180 || minLon + shift > 180) continue;

          if (merged.has(country.name)) {
            let path: Path2D | null = null;
            for (let i = 0; i < ring.length; i += 2) {
              const j = (i + 2) % ring.length;
              const lon1 = ring[i] ?? 0;
              const lat1 = ring[i + 1] ?? 0;
              const lon2 = ring[j] ?? 0;
              const lat2 = ring[j + 1] ?? 0;
              if (isInternalCountryEdge(country, lon1, lat1, lon2, lat2)) {
                if (path) {
                  ctx.stroke(path);
                  path = null;
                }
                continue;
              }
              const x1 = lonToX(lon1 + shift, BORDER_WIDTH);
              const y1 = latToY(lat1, BORDER_HEIGHT);
              const x2 = lonToX(lon2 + shift, BORDER_WIDTH);
              const y2 = latToY(lat2, BORDER_HEIGHT);
              if (!path) {
                path = new Path2D();
                path.moveTo(x1, y1);
              }
              path.lineTo(x2, y2);
            }
            if (path) ctx.stroke(path);
            continue;
          }

          const path = new Path2D();
          for (let i = 0; i < ring.length; i += 2) {
            const x = lonToX((ring[i] ?? 0) + shift, BORDER_WIDTH);
            const y = latToY(ring[i + 1] ?? 0, BORDER_HEIGHT);
            if (i === 0) path.moveTo(x, y);
            else path.lineTo(x, y);
          }
          path.closePath();
          ctx.stroke(path);
        }
      }
    }
  }

  const pixels = ctx.getImageData(0, 0, BORDER_WIDTH, BORDER_HEIGHT).data;
  const distances = new Float32Array(BORDER_WIDTH * BORDER_HEIGHT);

  for (let i = 0; i < distances.length; i += 1) {
    distances[i] = pixels[i * 4 + 3] > 8 ? 0 : MAX_DISTANCE;
  }

  // Two-pass chamfer distance transform. The x axis wraps at the antimeridian.
  for (let y = 0; y < BORDER_HEIGHT; y += 1) {
    const row = y * BORDER_WIDTH;
    for (let x = 0; x < BORDER_WIDTH; x += 1) {
      const index = row + x;
      const left = row + (x === 0 ? BORDER_WIDTH - 1 : x - 1);
      let distance = Math.min(distances[index], distances[left] + 1);

      if (y > 0) {
        const up = row - BORDER_WIDTH;
        const upLeft = up + (x === 0 ? BORDER_WIDTH - 1 : x - 1);
        const upRight = up + (x === BORDER_WIDTH - 1 ? 0 : x + 1);
        distance = Math.min(
          distance,
          distances[up + x] + 1,
          distances[upLeft] + SQRT2,
          distances[upRight] + SQRT2,
        );
      }

      distances[index] = distance;
    }
  }

  for (let y = BORDER_HEIGHT - 1; y >= 0; y -= 1) {
    const row = y * BORDER_WIDTH;
    for (let x = BORDER_WIDTH - 1; x >= 0; x -= 1) {
      const index = row + x;
      const right = row + (x === BORDER_WIDTH - 1 ? 0 : x + 1);
      let distance = Math.min(distances[index], distances[right] + 1);

      if (y < BORDER_HEIGHT - 1) {
        const down = row + BORDER_WIDTH;
        const downLeft = down + (x === 0 ? BORDER_WIDTH - 1 : x - 1);
        const downRight = down + (x === BORDER_WIDTH - 1 ? 0 : x + 1);
        distance = Math.min(
          distance,
          distances[down + x] + 1,
          distances[downLeft] + SQRT2,
          distances[downRight] + SQRT2,
        );
      }

      distances[index] = distance;
    }
  }

  const field = ctx.createImageData(BORDER_WIDTH, BORDER_HEIGHT);
  for (let i = 0; i < distances.length; i += 1) {
    const value = Math.round(
      (Math.min(MAX_DISTANCE, distances[i]) / MAX_DISTANCE) * 255,
    );
    field.data[i * 4] = value;
    field.data[i * 4 + 1] = value;
    field.data[i * 4 + 2] = value;
    field.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(field, 0, 0);

  return canvas;
}
