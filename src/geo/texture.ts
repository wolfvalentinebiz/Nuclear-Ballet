import { PALETTE } from '../palette';
import { fillPolygons } from './raster';
import type { LakeData, LandData } from './types';

export function createTerrainCanvas(
  land: LandData,
  lakes: LakeData,
  width = 4096,
  height = 2048,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable.');

  ctx.fillStyle = PALETTE.terrainOcean;
  ctx.fillRect(0, 0, width, height);

  fillPolygons(ctx, land.polygons, width, height, PALETTE.terrainLand);
  fillPolygons(ctx, lakes.polygons, width, height, PALETTE.terrainOcean);

  return canvas;
}

/** 1 = land, 0 = water, at the grid resolution used by the population field. */
export function createLandMask(
  land: LandData,
  lakes: LakeData,
  width: number,
  height: number,
): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context is unavailable.');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  fillPolygons(ctx, land.polygons, width, height, '#ffffff');
  fillPolygons(ctx, lakes.polygons, width, height, '#000000');

  const pixels = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = pixels[i * 4] > 127 ? 1 : 0;
  }

  return mask;
}
