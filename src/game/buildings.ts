export type BuildingType =
  | 'nuclearReactor'
  | 'interceptorPlatform'
  | 'dockyard'
  | 'spaceLaunchPlatform'
  | 'nuclearLaunchPlatform'
  | 'interceptorFactory'
  | 'nuclearMissileFactory'
  | 'spaceshipFactory'
  | 'barracks'
  | 'armsIndustry'
  | 'researchCenter';

export interface BuildingSpec {
  type: BuildingType;
  name: string;
  accent: string;
}

export interface Building {
  id: string;
  type: BuildingType;
  lat: number;
  lon: number;
  country: string;
}

export const BUILDING_SPECS: readonly BuildingSpec[] = [
  { type: 'nuclearReactor', name: 'Nuclear Reactor', accent: '#ffffff' },
  { type: 'interceptorPlatform', name: 'Interceptor Platform', accent: '#ffffff' },
  { type: 'dockyard', name: 'Dockyard', accent: '#ffffff' },
  { type: 'spaceLaunchPlatform', name: 'Space Launch Platform', accent: '#ffffff' },
  { type: 'nuclearLaunchPlatform', name: 'Nuclear Launch Platform', accent: '#ffffff' },
  { type: 'interceptorFactory', name: 'Interceptor Factory', accent: '#ffffff' },
  { type: 'nuclearMissileFactory', name: 'Nuclear Missile Factory', accent: '#ffffff' },
  { type: 'spaceshipFactory', name: 'Spaceship Factory', accent: '#ffffff' },
  { type: 'barracks', name: 'Barracks', accent: '#ffffff' },
  { type: 'armsIndustry', name: 'Arms Industry', accent: '#ffffff' },
  { type: 'researchCenter', name: 'Research Center', accent: '#ffffff' },
];

const ICON_SIZE = 16;
const ART_SIZE = 12;
const ART_OFFSET = 2;

interface SpriteSpec {
  rows: readonly string[];
  palette: Readonly<Record<string, string>>;
}

const SPRITES: Record<Exclude<BuildingType, 'nuclearReactor'>, SpriteSpec> = {
  interceptorPlatform: {
    rows: [
      '............',
      '.........###',
      '........#rr#',
      '.......#www#',
      '......#www#.',
      '.....#www#..',
      '....#www#...',
      '...#www#....',
      '..#ooo#.....',
      '.#oo#.......',
      '.##.........',
      '............',
    ],
    palette: {
      '#': '#000000',
      w: '#ffffff',
      r: '#ffffff',
      o: '#ffffff',
    },
  },
  dockyard: {
    rows: [
      '....ccc.....',
      '....c.c.....',
      '....c..c....',
      '....c...c...',
      '....c..ccc..',
      '....c.......',
      '..c.c.......',
      '..c.c.......',
      '..#########.',
      '.#hhhhhhhhh#',
      '.#hhhhhhhhh#',
      '..#########.',
    ],
    palette: {
      '#': '#000000',
      c: '#ffffff',
      h: '#ffffff',
    },
  },
  spaceLaunchPlatform: {
    rows: [
      '.....##.....',
      '....#rr#....',
      '....#ww#....',
      '....#ww#....',
      '....#ww#....',
      '....#ww#....',
      '...#wwww#...',
      '..#wwwwww#..',
      '..##wwww##..',
      '...######...',
      '..oyyooyyo..',
      '..oooooooo..',
    ],
    palette: {
      '#': '#000000',
      w: '#ffffff',
      r: '#ffffff',
      o: '#ffffff',
      y: '#ffffff',
    },
  },
  nuclearLaunchPlatform: {
    rows: [
      '.....##.....',
      '....#ww#....',
      '....#ww#....',
      '....#ww#....',
      '...##ww##...',
      '...##ww##...',
      '..##wwww##..',
      '.##########.',
      '.#wwwwwwww#.',
      '.#w#w#w#w#w.',
      '.#wwwwwwww#.',
      '.##########.',
    ],
    palette: {
      '#': '#000000',
      w: '#ffffff',
    },
  },
  interceptorFactory: {
    rows: [
      '......#.....',
      '.....#w#....',
      '.....#w#....',
      '....#www#...',
      '....#www#...',
      '...#wwwww#..',
      '..#########.',
      '..#w#w#w#w#.',
      '..#wwwwwww#.',
      '..#w#w#w#w#.',
      '..#wwwwwww#.',
      '..#########.',
    ],
    palette: {
      '#': '#000000',
      w: '#ffffff',
    },
  },
  nuclearMissileFactory: {
    rows: [
      '.....##.....',
      '....#ww#....',
      '....#ww#....',
      '....#ww#....',
      '...#wwww#...',
      '..#wwwwww#..',
      '.#########..',
      '.#w#w#w#w#..',
      '.#wwwwwww#..',
      '.#w#w#w#w#..',
      '.#wwwwwww#..',
      '.#########..',
    ],
    palette: {
      '#': '#000000',
      w: '#ffffff',
    },
  },
  spaceshipFactory: {
    rows: [
      '.....##.....',
      '....#ww#....',
      '...#wwww#...',
      '..##wwww##..',
      '.#########..',
      '.#wwwwwww#..',
      '.#w#w#w#w#..',
      '.#########..',
      '..########..',
      '..#w#w#w#...',
      '..#wwwww#...',
      '..#######...',
    ],
    palette: {
      '#': '#000000',
      w: '#ffffff',
    },
  },
  barracks: {
    rows: [
      '............',
      '..##.....#..',
      '..#w#....#..',
      '..#ww#...#..',
      '.######..##.',
      '.#wwww#..#..',
      '.#w##w#..#..',
      '.#wwww#...#.',
      '.######..##.',
      '.#wwww#.....',
      '.######.....',
      '............',
    ],
    palette: {
      '#': '#000000',
      w: '#ffffff',
    },
  },
  armsIndustry: {
    rows: [
      '....##..##..',
      '....##..##..',
      '...####.####',
      '.....#..#...',
      '..#########.',
      '..#wwwwwww#.',
      '..#waa.aa.#.',
      '..#wwwwwww#.',
      '..#waa.aa.#.',
      '..#wwwwwww#.',
      '..#wwwwwww#.',
      '..#########.',
    ],
    palette: {
      '#': '#000000',
      w: '#ffffff',
      a: '#000000',
    },
  },
  researchCenter: {
    rows: [
      '....wwww....',
      '....w..w....',
      '....w..w....',
      '...w....w...',
      '...w.ww.w...',
      '..w..ww..w..',
      '..w......w..',
      '.w...ww...w.',
      '.w........w.',
      '.w........w.',
      '.w..wwww..w.',
      '.wwwwwwwwww.',
    ],
    palette: {
      w: '#ffffff',
    },
  },
};

const iconCache = new Map<BuildingType, HTMLCanvasElement>();
const invertedIconCache = new Map<BuildingType, HTMLCanvasElement>();

function drawReactor(ctx: CanvasRenderingContext2D): void {
  const bladeCenters = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];

  for (let y = 0; y < ART_SIZE; y += 1) {
    for (let x = 0; x < ART_SIZE; x += 1) {
      const dx = x - 5.5;
      const dy = y - 5.5;
      const radius = Math.hypot(dx, dy);
      if (radius > 5.2) continue;

      let color = '#ffffff';
      if (radius > 4.35) {
        color = '#000000';
      } else {
        let blade = radius < 1.25;
        if (!blade && radius < 4.0) {
          const angle = Math.atan2(dy, dx);
          for (const center of bladeCenters) {
            let delta = angle - center;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            if (Math.abs(delta) < Math.PI / 6) {
              blade = true;
              break;
            }
          }
        }
        if (blade) color = '#000000';
      }

      ctx.fillStyle = color;
      ctx.fillRect(ART_OFFSET + x, ART_OFFSET + y, 1, 1);
    }
  }
}

function drawSprite(ctx: CanvasRenderingContext2D, spec: SpriteSpec): void {
  if (spec.rows.length !== ART_SIZE) {
    throw new Error(`Building icon must have ${ART_SIZE} rows`);
  }

  for (let y = 0; y < ART_SIZE; y += 1) {
    const row = spec.rows[y];
    if (!row || row.length !== ART_SIZE) {
      throw new Error(`Building icon row ${y} must have ${ART_SIZE} pixels`);
    }

    for (let x = 0; x < ART_SIZE; x += 1) {
      const key = row.charAt(x);
      if (key === '.') continue;
      const color = spec.palette[key];
      if (!color) throw new Error(`Unknown building icon palette key: ${key}`);
      ctx.fillStyle = color;
      ctx.fillRect(ART_OFFSET + x, ART_OFFSET + y, 1, 1);
    }
  }
}

export function createBuildingIcon(type: BuildingType): HTMLCanvasElement {
  const spec = BUILDING_SPECS.find((entry) => entry.type === type);
  if (!spec) throw new Error(`Unknown building type: ${type}`);

  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create building icon');

  ctx.imageSmoothingEnabled = false;

  // A single-pixel offset shadow keeps the token readable over bright terrain.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(2, 2, 14, 14);

  // Monochrome keyline keeps the pixel symbol readable on any terrain.
  ctx.fillStyle = spec.accent;
  ctx.fillRect(1, 1, 14, 14);
  ctx.fillStyle = '#000000';
  ctx.fillRect(2, 2, 12, 12);

  ctx.clearRect(1, 1, 1, 1);
  ctx.clearRect(14, 1, 1, 1);
  ctx.clearRect(1, 14, 1, 1);
  ctx.clearRect(14, 14, 1, 1);

  if (type === 'nuclearReactor') {
    drawReactor(ctx);
  } else {
    drawSprite(ctx, SPRITES[type]);
  }

  return canvas;
}

/** Shared offscreen icon for the map layer. Legend rows use fresh canvases. */
export function getBuildingIcon(type: BuildingType): HTMLCanvasElement {
  let icon = iconCache.get(type);
  if (!icon) {
    icon = createBuildingIcon(type);
    iconCache.set(type, icon);
  }
  return icon;
}

/** The same pixel icon with its opaque colours inverted for construction sites. */
export function getInvertedBuildingIcon(type: BuildingType): HTMLCanvasElement {
  let icon = invertedIconCache.get(type);
  if (icon) return icon;

  const source = getBuildingIcon(type);
  icon = document.createElement('canvas');
  icon.width = source.width;
  icon.height = source.height;
  const ctx = icon.getContext('2d');
  if (!ctx) throw new Error('Could not create inverted building icon');

  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, icon.width, icon.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  ctx.putImageData(image, 0, 0);
  invertedIconCache.set(type, icon);
  return icon;
}
