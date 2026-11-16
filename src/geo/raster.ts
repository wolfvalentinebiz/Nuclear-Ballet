import type { PolygonSet } from './types';

export const lonToX = (lon: number, width: number): number => ((lon + 180) / 360) * width;
export const latToY = (lat: number, height: number): number => ((90 - lat) / 180) * height;

/**
 * Fills polygons into an equirectangular canvas. Longitudes are already made
 * seam-continuous by the bake step; each polygon is painted at -360°, 0° and
 * +360° so shapes that cross the seam wrap correctly.
 *
 * Do not re-unwrap here: Antarctica is a pole-enclosing ring whose ±180°
 * seam points must stay in place for the fill to include the interior.
 */
export function fillPolygons(
  ctx: CanvasRenderingContext2D,
  polygons: PolygonSet,
  width: number,
  height: number,
  color: string,
): void {
  ctx.fillStyle = color;

  for (const polygon of polygons) {
    if (polygon.length === 0) continue;

    let minLon = Infinity;
    let maxLon = -Infinity;

    for (const ring of polygon) {
      if (ring.length < 6) continue;
      for (let i = 0; i < ring.length; i += 2) {
        const lon = ring[i];
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      }
    }

    if (!Number.isFinite(minLon)) continue;

    for (const shift of [-360, 0, 360]) {
      if (maxLon + shift < -180 || minLon + shift > 180) continue;

      const path = new Path2D();
      for (const ring of polygon) {
        if (ring.length < 6) continue;
        for (let i = 0; i < ring.length; i += 2) {
          const x = lonToX(ring[i] + shift, width);
          const y = latToY(ring[i + 1], height);
          if (i === 0) path.moveTo(x, y);
          else path.lineTo(x, y);
        }
        path.closePath();
      }

      // Separate fills per shift: overlapping copies of seam-spanning rings
      // must paint over each other rather than cancel under even-odd.
      ctx.fill(path, 'evenodd');
    }
  }
}
