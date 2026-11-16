export interface HeatClass {
  readonly label: string;
  readonly swatch: string;
}

export const HEAT_CLASSES: readonly HeatClass[] = [
  { label: '< 1', swatch: '#f6f0dc' },
  { label: '1 – 5', swatch: '#f8dfb5' },
  { label: '5 – 25', swatch: '#f3c184' },
  { label: '25 – 250', swatch: '#eb9358' },
  { label: '250 – 1000', swatch: '#d95a3d' },
  { label: '1000+', swatch: '#9e1a34' },
];

/** Log-spaced stops: [persons/km², r, g, b]. */
const STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.2, 248, 242, 222],
  [1, 249, 231, 197],
  [5, 248, 207, 154],
  [25, 240, 160, 94],
  [250, 224, 96, 55],
  [1000, 178, 33, 52],
  [4000, 112, 13, 37],
];

/** Writes an RGB color for a density in persons per square kilometre. */
export function heatColor(density: number, out: [number, number, number]): void {
  const value = Math.max(STOPS[0][0], density);

  let index = STOPS.length - 2;
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    if (value <= STOPS[i + 1][0]) {
      index = i;
      break;
    }
  }

  const a = STOPS[index];
  const b = STOPS[index + 1];
  const t = Math.min(
    1,
    Math.max(
      0,
      (Math.log10(value) - Math.log10(a[0])) / (Math.log10(b[0]) - Math.log10(a[0])),
    ),
  );

  out[0] = Math.round(a[1] + (b[1] - a[1]) * t);
  out[1] = Math.round(a[2] + (b[2] - a[2]) * t);
  out[2] = Math.round(a[3] + (b[3] - a[3]) * t);
}
