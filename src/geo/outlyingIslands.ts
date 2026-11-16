import type {
  CitiesData,
  CountriesData,
  CountryData,
  FlatRing,
  LandData,
  Polygon,
  PolygonSet,
} from './types';

/**
 * [latitude, longitude, radius in degrees latitude].
 *
 * The radius is intentionally generous. Natural Earth's 1:50m land layer only
 * carries the larger islands, while the game rasterizes land at 0.25 degrees
 * per cell. At real atoll size almost every one of these islands would vanish
 * from the coast mask and the country grid. The shapes are therefore
 * cartographic symbols for real island locations, not survey geometry.
 */
type IslandSeed = readonly [lat: number, lon: number, radius?: number];

interface NationSeed {
  name: string;
  iso: string;
  capital: string;
  capitalLat: number;
  capitalLon: number;
  timezone: string;
  pop: number;
  seeds: readonly IslandSeed[];
}

interface TerritorySeed {
  owner: string;
  seeds: readonly IslandSeed[];
}

const DEFAULT_ISLAND_RADIUS = 0.38;
const MIN_ISLAND_RADIUS = 0.3;
const MAX_LAND_MATCH_DISTANCE = 1.05;
const CITY_SNAP_DISTANCE = 0.85;
const OFFSHORE_SNAP_REACH = 1.25;
const MIN_SYNTHETIC_RADIUS = 0.06;
const SYNTHETIC_GAP = 0.12;
const SYNTHETIC_WOBBLE_REACH = 1.2;
const CAPITAL_ISLAND_RADIUS = 0.32;

const GILBERT_ISLANDS: readonly IslandSeed[] = [
  [1.451, 172.971, 0.38], // Tarawa
  [1.85, 172.94],
  [2.02, 173.27],
  [3.08, 172.8],
  [3.38, 172.98],
  [0.4, 173.88],
  [-0.63, 174.43],
  [-1.35, 174.84, 0.55], // Tabiteuea
  [-1.35, 176.0],
  [-1.36, 176.46],
  [-1.86, 175.57],
  [-2.5, 175.99],
  [-2.64, 176.82],
];

const PHOENIX_ISLANDS: readonly IslandSeed[] = [
  [-2.81, -171.68, 0.38], // Kanton
  [-3.13, -171.08],
  [-3.72, -170.71],
  [-4.45, -171.25],
  [-3.58, -171.52],
  [-3.6, -174.12],
  [-4.68, -174.53],
];

const LINE_ISLANDS: readonly IslandSeed[] = [
  [1.87, -157.43, 0.7], // Kiritimati
  [3.87, -159.36, 0.38], // Tabuaeran
  [4.68, -160.38, 0.32], // Teraina
  [4.02, -154.93],
  [-5.62, -155.88],
  [9.95, -150.21],
  [-10.06, -152.31],
  [-11.43, -151.82],
];

const MARSHALL_ISLANDS: readonly IslandSeed[] = [
  [7.12, 171.19, 0.4], // Majuro
  [7.08, 171.65],
  [5.92, 169.64, 0.42], // Jaluit
  [6.13, 171.98],
  [5.62, 168.1],
  [4.6, 168.7],
  [9.43, 170.23],
  [8.75, 171.05],
  [9.19, 167.47, 0.55], // Kwajalein
  [11.16, 166.89],
  [11.6, 165.38],
  [11.5, 162.33, 0.4], // Enewetak
  [11.25, 169.85],
  [11.13, 166.4],
];

const CAROLINE_ISLANDS: readonly IslandSeed[] = [
  [6.92, 158.15, 0.35], // Palikir / Pohnpei
  [5.32, 162.98, 0.38], // Kosrae
  [7.45, 151.85, 0.38], // Weno / Chuuk
  [7.38, 151.88],
  [9.53, 138.13, 0.4], // Yap
  [10.02, 139.79],
  [9.77, 140.52],
  [8.45, 137.48],
  [7.35, 147.03],
  [7.5, 146.3],
  [7.38, 143.9, 0.34],
  [7.25, 144.45],
  [6.68, 143.05],
  [8.6, 144.53],
  [8.1, 140.4],
];

const PALAU_ISLANDS: readonly IslandSeed[] = [
  [7.5, 134.62, 0.55], // Babeldaob / Ngerulmud
  [7.34, 134.48],
  [7.0, 134.25],
  [6.9, 134.13],
  [8.08, 134.72],
  [5.33, 132.22],
  [3.0, 131.12],
];

const Nauru: readonly IslandSeed[] = [
  [-0.547, 166.919, 0.42], // Yaren
];

const TUVALU_ISLANDS: readonly IslandSeed[] = [
  [-8.52, 179.2, 0.4], // Funafuti
  [-5.68, 176.13],
  [-6.32, 176.48],
  [-6.12, 177.34],
  [-7.23, 177.16],
  [-7.48, 178.68],
  [-8.0, 178.38],
  [-9.38, 179.85],
  [-10.75, 179.5],
];

const SAMOA_ISLANDS: readonly IslandSeed[] = [
  [-13.83, -171.76, 0.45], // Apia / Upolu
  [-13.6, -172.35, 0.55], // Savai'i
  [-13.85, -172.1],
  [-13.82, -172.15],
];

const TONGA_ISLANDS: readonly IslandSeed[] = [
  [-21.14, -175.2, 0.45], // Nuku'alofa / Tongatapu
  [-21.38, -174.93],
  [-19.8, -174.35],
  [-18.65, -173.98, 0.45], // Neiafu / Vava'u
  [-18.7, -174.0],
  [-15.96, -173.78],
  [-15.85, -173.75],
  [-15.6, -175.63],
];

const COOK_ISLANDS: readonly IslandSeed[] = [
  [-21.21, -159.78, 0.42], // Rarotonga / Avarua
  [-18.85, -159.79, 0.35], // Aitutaki
  [-19.98, -158.12],
  [-21.92, -157.92],
  [-20.16, -157.34],
  [-19.85, -157.7],
  [-18.06, -163.17],
  [-9.0, -157.97, 0.38], // Penrhyn
  [-10.4, -161.0],
  [-10.05, -161.08],
  [-10.88, -165.83],
  [-11.56, -165.4],
  [-13.25, -163.08],
  [-19.8, -158.3],
];

const NIUE_ISLAND: readonly IslandSeed[] = [
  [-19.054, -169.917, 0.42], // Alofi
];

const MALDIVES_ISLANDS: readonly IslandSeed[] = [
  [4.175, 73.509, 0.38], // Male
  [4.21, 73.54],
  [4.37, 73.65],
  [4.44, 73.72],
  [4.26, 73.0],
  [4.43, 72.95],
  [4.21, 72.86],
  [3.53, 72.93],
  [3.47, 72.84],
  [3.5, 72.7],
  [3.47, 73.55],
  [2.92, 73.58],
  [2.18, 73.1],
  [1.83, 73.5],
  [0.53, 72.99],
  [0.06, 73.0],
  [-0.6, 73.08],
  [-0.3, 73.42],
  [-0.7, 73.15],
  [6.88, 73.11],
  [6.62, 73.07],
  [6.15, 73.29],
  [5.76, 73.41],
  [5.67, 73.03],
  [5.1, 73.07],
  [5.44, 73.36],
  [3.76, 72.97],
  [3.03, 72.92],
  [2.67, 72.89],
];

const SEYCHELLES_ISLANDS: readonly IslandSeed[] = [
  [-4.62, 55.45, 0.5], // Mahe / Victoria
  [-4.33, 55.73, 0.35], // Praslin
  [-4.36, 55.84],
  [-4.48, 55.24],
  [-4.58, 55.95],
  [-4.28, 55.73],
  [-4.61, 55.51],
  [-5.7, 53.68],
  [-7.18, 52.73],
  [-9.42, 46.35, 0.45], // Aldabra
  [-9.75, 46.5],
  [-10.08, 47.75],
  [-9.72, 47.6],
  [-10.0, 51.1],
  [-9.4, 51.0],
  [-7.13, 56.27],
  [-5.87, 55.38],
];

const MAURITIUS_ISLANDS: readonly IslandSeed[] = [
  [-20.2, 57.55, 0.55], // Port Louis / Mauritius
  [-19.7, 63.42, 0.35], // Rodrigues
  [-10.4, 56.6], // Agalega
  [-16.4, 59.6], // St Brandon
];

const COMOROS_ISLANDS: readonly IslandSeed[] = [
  [-11.6, 43.3, 0.5], // Grande Comore / Moroni
  [-12.2, 44.4, 0.4], // Anjouan
  [-12.3, 43.7, 0.35], // Moheli
];

const CAPE_VERDE_ISLANDS: readonly IslandSeed[] = [
  [14.93, -23.51, 0.38], // Praia / Santiago
  [16.75, -22.95, 0.35], // Sal
  [16.1, -22.8, 0.32], // Boa Vista
  [15.15, -23.2], // Maio
  [14.95, -24.35, 0.32], // Fogo
  [14.87, -24.7], // Brava
  [17.05, -25.17, 0.32], // Santo Antao
  [16.85, -24.98], // Sao Vicente
  [16.6, -24.35], // Sao Nicolau
  [16.76, -24.75], // Santa Luzia
];

const SAO_TOME_ISLANDS: readonly IslandSeed[] = [
  [0.336, 6.731, 0.38], // Sao Tome
  [1.6, 7.4, 0.38], // Principe
  [0.0, 6.52], // Rolas
  [1.55, 7.38],
];

const ANTIGUA_ISLANDS: readonly IslandSeed[] = [
  [17.12, -61.85, 0.35], // Antigua / St John's
  [17.63, -61.8, 0.25], // Barbuda
  [16.94, -62.35], // Redonda
];

const ST_KITTS_ISLANDS: readonly IslandSeed[] = [
  [17.3, -62.72, 0.3], // St Kitts / Basseterre
  [17.15, -62.6, 0.22], // Nevis
];

const DOMINICA_ISLAND: readonly IslandSeed[] = [[15.42, -61.35, 0.32]];
const ST_LUCIA_ISLAND: readonly IslandSeed[] = [[13.9, -60.97, 0.32]];
const BARBADOS_ISLAND: readonly IslandSeed[] = [[13.1, -59.6, 0.3]];

const GRENADA_ISLANDS: readonly IslandSeed[] = [
  [12.05, -61.75, 0.3], // Grenada / St George's
  [12.48, -61.45], // Carriacou
  [12.5, -61.38], // Petit Martinique
];

const ST_VINCENT_ISLANDS: readonly IslandSeed[] = [
  [13.16, -61.23, 0.32], // St Vincent / Kingstown
  [13.0, -61.23], // Bequia
  [12.88, -61.18],
  [12.7, -61.33],
  [12.6, -61.43],
  [12.63, -61.4],
];

const MALTA_ISLANDS: readonly IslandSeed[] = [
  [35.9, 14.5, 0.3], // Malta / Valletta
  [36.05, 14.25, 0.22], // Gozo
  [36.02, 14.33], // Comino
  [35.78, 14.42], // Filfla
];

const NEW_NATIONS: readonly NationSeed[] = [
  {
    name: 'Kiribati',
    iso: 'KI',
    capital: 'South Tarawa',
    capitalLat: 1.451,
    capitalLon: 172.971,
    timezone: 'Pacific/Tarawa',
    pop: 134_000,
    seeds: [...GILBERT_ISLANDS, ...PHOENIX_ISLANDS, ...LINE_ISLANDS],
  },
  {
    name: 'Marshall Islands',
    iso: 'MH',
    capital: 'Majuro',
    capitalLat: 7.12,
    capitalLon: 171.19,
    timezone: 'Pacific/Majuro',
    pop: 42_000,
    seeds: MARSHALL_ISLANDS,
  },
  {
    name: 'Micronesia',
    iso: 'FM',
    capital: 'Palikir',
    capitalLat: 6.92,
    capitalLon: 158.15,
    timezone: 'Pacific/Pohnpei',
    pop: 113_000,
    seeds: CAROLINE_ISLANDS,
  },
  {
    name: 'Palau',
    iso: 'PW',
    capital: 'Ngerulmud',
    capitalLat: 7.5,
    capitalLon: 134.62,
    timezone: 'Pacific/Palau',
    pop: 18_000,
    seeds: PALAU_ISLANDS,
  },
  {
    name: 'Nauru',
    iso: 'NR',
    capital: 'Yaren',
    capitalLat: -0.547,
    capitalLon: 166.919,
    timezone: 'Pacific/Nauru',
    pop: 12_000,
    seeds: Nauru,
  },
  {
    name: 'Tuvalu',
    iso: 'TV',
    capital: 'Funafuti',
    capitalLat: -8.52,
    capitalLon: 179.2,
    timezone: 'Pacific/Funafuti',
    pop: 11_000,
    seeds: TUVALU_ISLANDS,
  },
  {
    name: 'Samoa',
    iso: 'WS',
    capital: 'Apia',
    capitalLat: -13.83,
    capitalLon: -171.76,
    timezone: 'Pacific/Apia',
    pop: 218_000,
    seeds: SAMOA_ISLANDS,
  },
  {
    name: 'Tonga',
    iso: 'TO',
    capital: "Nuku'alofa",
    capitalLat: -21.14,
    capitalLon: -175.2,
    timezone: 'Pacific/Tongatapu',
    pop: 104_000,
    seeds: TONGA_ISLANDS,
  },
  {
    name: 'Cook Islands',
    iso: 'CK',
    capital: 'Avarua',
    capitalLat: -21.21,
    capitalLon: -159.78,
    timezone: 'Pacific/Rarotonga',
    pop: 17_000,
    seeds: COOK_ISLANDS,
  },
  {
    name: 'Niue',
    iso: 'NU',
    capital: 'Alofi',
    capitalLat: -19.054,
    capitalLon: -169.917,
    timezone: 'Pacific/Niue',
    pop: 1_600,
    seeds: NIUE_ISLAND,
  },
  {
    name: 'Maldives',
    iso: 'MV',
    capital: 'Male',
    capitalLat: 4.175,
    capitalLon: 73.509,
    timezone: 'Indian/Maldives',
    pop: 515_000,
    seeds: MALDIVES_ISLANDS,
  },
  {
    name: 'Seychelles',
    iso: 'SC',
    capital: 'Victoria',
    capitalLat: -4.62,
    capitalLon: 55.45,
    timezone: 'Indian/Mahe',
    pop: 100_000,
    seeds: SEYCHELLES_ISLANDS,
  },
  {
    name: 'Mauritius',
    iso: 'MU',
    capital: 'Port Louis',
    capitalLat: -20.16,
    capitalLon: 57.5,
    timezone: 'Indian/Mauritius',
    pop: 1_260_000,
    seeds: MAURITIUS_ISLANDS,
  },
  {
    name: 'Comoros',
    iso: 'KM',
    capital: 'Moroni',
    capitalLat: -11.7,
    capitalLon: 43.25,
    timezone: 'Indian/Comoro',
    pop: 850_000,
    seeds: COMOROS_ISLANDS,
  },
  {
    name: 'Cape Verde',
    iso: 'CV',
    capital: 'Praia',
    capitalLat: 14.93,
    capitalLon: -23.51,
    timezone: 'Atlantic/Cape_Verde',
    pop: 560_000,
    seeds: CAPE_VERDE_ISLANDS,
  },
  {
    name: 'Sao Tome and Principe',
    iso: 'ST',
    capital: 'Sao Tome',
    capitalLat: 0.336,
    capitalLon: 6.731,
    timezone: 'Africa/Sao_Tome',
    pop: 220_000,
    seeds: SAO_TOME_ISLANDS,
  },
  {
    name: 'Antigua and Barbuda',
    iso: 'AG',
    capital: "St John's",
    capitalLat: 17.12,
    capitalLon: -61.85,
    timezone: 'America/Antigua',
    pop: 97_000,
    seeds: ANTIGUA_ISLANDS,
  },
  {
    name: 'St Kitts and Nevis',
    iso: 'KN',
    capital: 'Basseterre',
    capitalLat: 17.3,
    capitalLon: -62.72,
    timezone: 'America/St_Kitts',
    pop: 53_000,
    seeds: ST_KITTS_ISLANDS,
  },
  {
    name: 'Dominica',
    iso: 'DM',
    capital: 'Roseau',
    capitalLat: 15.3,
    capitalLon: -61.39,
    timezone: 'America/Dominica',
    pop: 72_000,
    seeds: DOMINICA_ISLAND,
  },
  {
    name: 'St Lucia',
    iso: 'LC',
    capital: 'Castries',
    capitalLat: 14.01,
    capitalLon: -60.99,
    timezone: 'America/St_Lucia',
    pop: 183_000,
    seeds: ST_LUCIA_ISLAND,
  },
  {
    name: 'Barbados',
    iso: 'BB',
    capital: 'Bridgetown',
    capitalLat: 13.1,
    capitalLon: -59.62,
    timezone: 'America/Barbados',
    pop: 287_000,
    seeds: BARBADOS_ISLAND,
  },
  {
    name: 'Grenada',
    iso: 'GD',
    capital: "St George's",
    capitalLat: 12.05,
    capitalLon: -61.75,
    timezone: 'America/Grenada',
    pop: 114_000,
    seeds: GRENADA_ISLANDS,
  },
  {
    name: 'St Vincent and Grenadines',
    iso: 'VC',
    capital: 'Kingstown',
    capitalLat: 13.16,
    capitalLon: -61.23,
    timezone: 'America/St_Vincent',
    pop: 110_000,
    seeds: ST_VINCENT_ISLANDS,
  },
  {
    name: 'Malta',
    iso: 'MT',
    capital: 'Valletta',
    capitalLat: 35.9,
    capitalLon: 14.51,
    timezone: 'Europe/Malta',
    pop: 520_000,
    seeds: MALTA_ISLANDS,
  },
];

const TERRITORY_CHAINS: readonly TerritorySeed[] = [
  {
    owner: 'United States of America',
    seeds: [
      // Hawaii's main islands are already in the US polygon; the smaller
      // islands continue the chain northwest toward Midway.
      [19.6, -155.5, 0.55],
      [20.8, -156.33, 0.45],
      [21.47, -157.98, 0.35],
      [22.08, -159.5, 0.32],
      [21.13, -157.02],
      [20.83, -156.92],
      [21.9, -160.1],
      [20.55, -156.6],
      [23.06, -161.92],
      [23.58, -164.7],
      [23.75, -166.2],
      [25.0, -168.0],
      [25.77, -171.73],
      [26.07, -173.97],
      [27.8, -175.85],
      [28.2, -177.37],
      [28.42, -178.33],
      [19.3, 166.62], // Wake
      [16.73, -169.53], // Johnston
      [5.88, -162.08], // Palmyra
      [6.38, -162.42], // Kingman
      [-0.37, -160.02], // Jarvis
      [0.2, -176.48], // Baker
      [0.8, -176.62], // Howland
      [13.45, 144.78, 0.34], // Guam
      [15.18, 145.75], // Saipan
      [15.0, 145.63],
      [14.15, 145.2],
      [-14.3, -170.7, 0.34], // Tutuila / American Samoa
      [-14.29, -170.56],
      [-14.18, -169.67],
      [-14.18, -169.62],
      [-14.23, -169.47],
      [-11.05, -171.08], // Swains
      [52.9, 173.0], // Aleutians
      [51.97, 177.5],
      [51.5, 179.0],
      [51.95, 179.6],
      [51.8, -176.6],
      [52.1, -174.6],
      [53.6, -166.7],
      [53.2, -168.5],
      [54.8, -164.2],
    ],
  },
  {
    owner: 'France',
    seeds: [
      // Society Islands
      [-17.65, -149.45, 0.45], // Tahiti
      [-17.53, -149.83, 0.35], // Moorea
      [-16.5, -151.74, 0.3], // Bora Bora
      [-16.73, -151.03],
      [-16.83, -151.44],
      [-16.63, -151.5],
      [-16.45, -152.25],
      // Tuamotu Archipelago
      [-15.13, -147.65, 0.42], // Rangiroa
      [-16.3, -145.62, 0.38], // Fakarava
      [-15.0, -148.17],
      [-14.88, -148.67],
      [-15.83, -148.25],
      [-18.07, -140.9, 0.38], // Hao
      [-17.8, -140.75],
      [-21.83, -138.92],
      [-22.23, -138.75],
      // Gambier Islands
      [-23.1, -134.97],
      // Marquesas Islands
      [-8.87, -140.1, 0.42],
      [-9.75, -139.0, 0.38],
      [-9.4, -140.07],
      [-9.93, -139.1],
      [-10.5, -138.63],
      // Austral Islands
      [-23.37, -149.48],
      [-22.47, -151.34],
      [-22.65, -152.8],
      [-23.87, -147.67],
      [-27.6, -144.33],
      // Wallis and Futuna
      [-13.28, -176.2, 0.34],
      [-14.3, -178.15],
      [-14.34, -178.05],
      // Clipperton Island
      [10.3, -109.22],
    ],
  },
  {
    owner: 'New Caledonia',
    seeds: [
      [-21.3, 165.5, 0.9], // Grande Terre
      [-20.9, 167.25], // Lifou
      [-21.52, 168.03], // Mare
      [-20.43, 166.5], // Ouvea
      [-22.62, 167.48], // Ile des Pins
    ],
  },
  {
    owner: 'New Zealand',
    seeds: [
      [-29.27, -177.92], // Kermadec Islands
      [-30.23, -178.43],
      [-30.32, -178.45],
      [-30.55, -178.55],
      [-43.95, -176.55, 0.35], // Chatham Islands
      [-44.28, -176.22],
      [-50.7, 166.1], // Auckland Islands
      [-52.55, 169.15], // Campbell Island
      [-49.68, 178.77], // Antipodes
      [-47.75, 179.05], // Bounty Islands
      [-46.9, 167.9, 0.4], // Stewart Island
      [-8.55, -172.5], // Tokelau
      [-9.2, -171.85],
      [-9.38, -171.25],
    ],
  },
  {
    owner: 'Chile',
    seeds: [
      [-27.12, -109.37, 0.38], // Easter Island
      [-26.47, -105.36],
      [-33.64, -78.85], // Juan Fernandez
      [-33.75, -80.78],
      [-26.3, -80.1],
      [-26.35, -79.88],
    ],
  },
  {
    owner: 'Ecuador',
    seeds: [
      [-0.5, -91.1, 0.65], // Isabela
      [-0.62, -90.35, 0.4], // Santa Cruz
      [-0.37, -91.55, 0.45], // Fernandina
      [-0.25, -90.87, 0.32], // Santiago
      [-0.88, -89.5, 0.38], // San Cristobal
      [-1.3, -90.45], // Floreana
      [0.33, -90.5],
      [-1.38, -89.68],
      [0.58, -90.75],
      [0.32, -89.95],
      [-0.45, -90.27],
      [-0.4, -90.28],
      [-0.28, -90.55],
    ],
  },
  {
    owner: 'Mexico',
    seeds: [
      [18.8, -110.97, 0.32], // Socorro
      [19.3, -110.8],
      [19.0, -112.08],
      [18.37, -114.7],
    ],
  },
  {
    owner: 'Costa Rica',
    seeds: [[5.53, -87.06]],
  },
  {
    owner: 'Colombia',
    seeds: [[4.0, -81.6]],
  },
  {
    owner: 'United Kingdom',
    seeds: [
      [-25.07, -130.1], // Pitcairn
      [-24.37, -128.33],
      [-23.93, -130.73],
      [-24.68, -124.8],
    ],
  },
  {
    owner: 'Australia',
    seeds: [
      [-29.03, 167.95], // Norfolk Island
      [-31.55, 159.08], // Lord Howe Island
      [-31.75, 159.25],
    ],
  },
  {
    owner: 'Japan',
    seeds: [
      [27.1, 142.2], // Ogasawara Islands
      [26.65, 142.17],
      [24.78, 141.32],
      [25.43, 141.28],
      [24.23, 141.46],
      [34.75, 139.4], // Izu Islands
      [33.1, 139.78],
      [32.45, 139.77],
      [34.08, 139.53],
      [33.87, 139.6],
      [25.83, 131.23], // Daito Islands
      [25.95, 131.3],
      [24.47, 131.18],
      [20.42, 136.08], // Okinotorishima
    ],
  },
  {
    owner: 'Russia',
    seeds: [
      [55.0, 166.27], // Commander Islands
      [54.7, 167.7],
      [50.75, 156.4], // Kuril Islands
      [50.4, 155.6, 0.4],
      [50.85, 155.55],
      [49.45, 154.75],
      [46.98, 152.0],
      [45.9, 150.0, 0.4],
      [45.0, 147.8, 0.45],
      [44.1, 145.8, 0.38],
    ],
  },
  {
    owner: 'United Kingdom',
    seeds: [
      // British Indian Ocean Territory / Chagos
      [-7.32, 72.42, 0.35], // Diego Garcia
      [-5.4, 71.8],
      [-5.32, 72.25],
      [-6.5, 71.35],
      [-5.68, 72.3],
      // Atlantic overseas territories
      [32.3, -64.78, 0.22], // Bermuda
      [21.47, -71.14], // Turks and Caicos
      [21.78, -72.28],
      [21.9, -71.98],
      [21.8, -71.75],
      [21.5, -71.52],
      [19.33, -81.24], // Cayman Islands
      [19.72, -79.82],
      [19.68, -80.05],
      [18.22, -63.07], // Anguilla
      [18.58, -63.42],
      [16.74, -62.2], // Montserrat
      [18.42, -64.62], // British Virgin Islands
      [18.48, -64.4],
      [18.73, -64.33],
      [18.45, -64.75],
      [-15.95, -5.72], // St Helena
      [-7.95, -14.37], // Ascension
      [-37.1, -12.3], // Tristan da Cunha
      [-40.3, -9.9], // Gough Island
      [-54.4, -36.5], // South Georgia
      [-57.5, -26.5], // South Sandwich Islands
      [-58.4, -26.4],
      [-59.0, -26.5],
    ],
  },
  {
    owner: 'France',
    seeds: [
      [-21.1, 55.5, 0.5], // Reunion
      [-12.85, 45.15, 0.4], // Mayotte
      [-12.78, 45.28],
      [-12.93, 45.18],
      [-12.7, 45.07],
      [46.78, -56.17], // Saint Pierre and Miquelon
      [47.1, -56.38],
      [47.08, -56.3],
      [16.0, -61.72, 0.38], // Guadeloupe
      [16.25, -61.55],
      [15.94, -61.27],
      [15.86, -61.63],
      [16.32, -61.05],
      [14.65, -61.0, 0.35], // Martinique
      [17.9, -62.83], // Saint Barthelemy
      [18.07, -63.06], // Saint Martin
    ],
  },
  {
    owner: 'Netherlands',
    seeds: [
      [12.52, -69.97, 0.25], // Aruba
      [12.17, -69.0, 0.3], // Curacao
      [12.2, -68.25, 0.25], // Bonaire
      [17.63, -63.24], // Saba
      [17.49, -62.97], // Sint Eustatius
    ],
  },
  {
    owner: 'United States of America',
    seeds: [
      [18.34, -64.93], // US Virgin Islands
      [18.33, -64.73],
      [17.73, -64.8],
      [25.1, -80.45], // Florida Keys
      [24.72, -81.08],
      [24.55, -81.78],
      [33.39, -118.42], // Channel Islands
      [34.0, -119.72],
      [33.98, -120.1],
      [57.4, -153.5, 0.45], // Alaska islands
      [58.0, -152.8],
      [63.3, -170.2],
      [57.2, -170.3],
      [56.6, -169.6],
    ],
  },
  {
    owner: 'Spain',
    seeds: [
      [28.3, -16.6, 0.4], // Canary Islands
      [28.1, -15.6, 0.35],
      [29.0, -13.6],
      [28.4, -14.0],
      [28.7, -17.85],
      [28.1, -17.23],
      [27.75, -18.0],
      [35.95, -3.0], // Alboran Island
    ],
  },
  {
    owner: 'Portugal',
    seeds: [
      [37.75, -25.5, 0.35], // Azores
      [38.73, -27.2],
      [38.47, -28.3],
      [38.53, -28.7],
      [38.65, -28.1],
      [39.05, -28.0],
      [39.45, -31.2],
      [39.7, -31.1],
      [36.97, -25.1],
      [32.75, -16.95, 0.35], // Madeira
      [33.07, -16.33],
      [32.5, -16.5],
      [30.1, -15.9], // Savage Islands
    ],
  },
  {
    owner: 'Italy',
    seeds: [
      [36.8, 12.0], // Pantelleria
      [35.5, 12.6], // Lampedusa
      [35.87, 12.87],
      [35.55, 12.32],
      [42.78, 10.3, 0.3], // Elba
      [42.36, 10.9],
      [40.55, 14.23], // Capri
      [40.73, 13.9], // Ischia
      [40.9, 12.96],
      [40.8, 13.43],
      [38.47, 14.95], // Aeolian Islands
      [38.57, 14.85],
      [38.8, 15.2],
      [38.7, 13.2],
      [37.93, 12.33],
    ],
  },
  {
    owner: 'Norway',
    seeds: [
      [70.98, -8.5, 0.3], // Jan Mayen
      [74.5, 19.0, 0.35], // Bear Island
      [-54.42, 3.36, 0.3], // Bouvet Island
    ],
  },
  {
    owner: 'Denmark',
    seeds: [
      [62.0, -6.8, 0.3], // Faroe Islands
      [62.2, -7.0],
      [62.1, -6.6],
      [61.95, -6.55],
      [62.3, -6.35],
      [61.7, -6.75],
    ],
  },
  {
    owner: 'Iceland',
    seeds: [
      [63.42, -20.27], // Vestmannaeyjar
      [63.3, -20.6],
      [66.55, -18.0], // Grimsey
      [65.5, -13.6], // Papey
    ],
  },
  {
    owner: 'Brazil',
    seeds: [
      [-3.85, -32.42, 0.3], // Fernando de Noronha
      [-20.5, -29.3], // Trindade
      [-20.47, -28.85], // Martin Vaz
      [-3.85, -33.8], // Rocas Atoll
      [-18.0, -38.7], // Abrolhos
      [0.92, -29.35], // St Peter and St Paul
    ],
  },
  {
    owner: 'Argentina',
    seeds: [
      [-54.78, -64.3, 0.4], // Isla de los Estados
      [-55.0, -66.5],
    ],
  },
  {
    owner: 'India',
    seeds: [
      [13.3, 92.8, 0.4], // Andaman Islands
      [12.5, 92.9, 0.35],
      [11.7, 92.7],
      [10.7, 92.5],
      [9.15, 92.77], // Nicobar Islands
      [7.95, 93.55],
      [7.95, 93.38],
      [7.3, 93.65],
      [7.0, 93.8, 0.45],
      [10.57, 72.64], // Lakshadweep
      [10.85, 72.19],
      [8.28, 73.05],
      [11.12, 72.73],
      [10.81, 73.68],
      [10.08, 73.65],
    ],
  },
  {
    owner: 'Yemen',
    seeds: [
      [12.5, 54.0, 0.7], // Socotra
      [12.2, 52.25], // Abd al Kuri
      [12.15, 53.0],
      [12.1, 53.3],
    ],
  },
  {
    owner: 'Oman',
    seeds: [
      [20.5, 58.8, 0.35], // Masirah
      [20.5, 56.0], // Al Hallaniyah
    ],
  },
  {
    owner: 'Tanzania',
    seeds: [
      [-6.13, 39.32, 0.4], // Zanzibar
      [-5.1, 39.8, 0.35], // Pemba
      [-7.8, 39.8, 0.35], // Mafia
    ],
  },
  {
    owner: 'Kenya',
    seeds: [
      [-2.27, 40.85], // Lamu
      [-2.3, 40.85],
      [-2.1, 41.0],
    ],
  },
  {
    owner: 'Mozambique',
    seeds: [
      [-21.65, 35.47], // Bazaruto
      [-21.85, 35.45],
      [-21.97, 35.42],
      [-12.35, 40.6], // Quirimbas
      [-12.2, 40.6],
      [-11.82, 40.65],
    ],
  },
  {
    owner: 'South Africa',
    seeds: [
      [-46.6, 37.95], // Prince Edward Islands
      [-46.9, 37.75],
    ],
  },
  {
    owner: 'Australia',
    seeds: [
      [-10.49, 105.63, 0.3], // Christmas Island
      [-12.19, 96.83, 0.28], // Cocos (Keeling)
      [-12.12, 96.9],
      [-12.1, 96.85],
      [-12.25, 123.1], // Ashmore and Cartier
      [-12.5, 123.5],
      [-14.1, 121.8], // Scott Reef
      [-13.85, 126.0],
      [-53.1, 73.5, 0.4], // Heard Island
      [-53.05, 72.6], // McDonald Islands
      [-54.5, 158.9, 0.35], // Macquarie Island
    ],
  },
  {
    owner: 'Fr. S. Antarctic Lands',
    seeds: [
      [-46.4, 51.8, 0.4], // Crozet Islands
      [-46.5, 51.7],
      [-37.85, 77.55, 0.3], // Amsterdam Island
      [-38.7, 77.5], // St Paul Island
      [-22.37, 40.36], // Europa Island
      [-21.48, 39.68], // Bassas da India
      [-17.05, 42.72], // Juan de Nova
      [-11.55, 47.28], // Glorioso Islands
      [-15.88, 54.52], // Tromelin
    ],
  },
  {
    owner: 'Japan',
    seeds: [
      [26.5, 127.9, 0.35], // Ryukyu Islands
      [28.3, 129.4],
      [24.8, 125.3],
      [24.4, 124.2],
      [24.45, 123.0],
      [26.35, 126.75],
      [24.35, 123.8],
      [36.2, 133.3], // Oki Islands
      [34.3, 129.3], // Tsushima
      [38.0, 138.4], // Sado
      [34.4, 134.8], // Awaji
      [45.4, 141.0], // Rebun
      [45.18, 141.25], // Rishiri
      [42.15, 139.5], // Okushiri
    ],
  },
  {
    owner: 'South Korea',
    seeds: [
      [33.38, 126.55, 0.4], // Jeju
      [33.5, 126.95],
      [37.5, 130.9], // Ulleung
      [37.24, 131.87], // Dokdo
    ],
  },
  {
    owner: 'Taiwan',
    seeds: [
      [23.57, 119.58], // Penghu
      [24.44, 118.32], // Kinmen
      [26.16, 119.95], // Matsu
      [22.66, 121.49], // Green Island
      [22.05, 121.55], // Orchid Island
      [22.34, 120.38], // Little Liuqiu
    ],
  },
  {
    owner: 'Vietnam',
    seeds: [
      [10.2, 103.96], // Phu Quoc
      [8.68, 106.6], // Con Dao
      [15.38, 109.15], // Ly Son
    ],
  },
  {
    owner: 'Thailand',
    seeds: [
      [7.98, 98.4], // Phuket
      [9.5, 100.0], // Samui
      [9.75, 100.0],
      [10.1, 99.83],
      [8.65, 97.65], // Similan
      [6.6, 99.65], // Tarutao
    ],
  },
  {
    owner: 'Myanmar',
    seeds: [
      [14.1, 93.4], // Coco Islands
      [14.8, 93.65], // Preparis
    ],
  },
  {
    owner: 'Malaysia',
    seeds: [
      [6.35, 99.8], // Langkawi
      [2.8, 104.17], // Tioman
      [4.11, 118.63], // Sipadan
      [4.24, 118.6],
      [7.37, 113.85], // Layang-Layang
    ],
  },
  {
    owner: 'Indonesia',
    seeds: [
      [1.35, 98.9, 0.35], // Mentawai
      [-2.0, 99.7],
      [-2.7, 100.1],
      [1.1, 97.6, 0.35], // Nias
      [2.6, 96.1, 0.35], // Simeulue
      [3.9, 108.1], // Natuna
      [3.0, 106.0], // Anambas
      [-5.6, 132.7], // Kei Islands
      [-7.0, 131.5], // Tanimbar
      [-6.2, 134.5], // Aru
      [-0.2, 130.8, 0.45], // Raja Ampat
      [-0.9, 130.6],
      [-1.1, 130.8],
      [-1.9, 130.0],
      [-4.5, 129.9], // Banda Islands
      [-6.1, 105.4], // Krakatoa
    ],
  },
  {
    owner: 'Philippines',
    seeds: [
      [20.45, 121.97], // Batanes
      [20.78, 121.85],
      [19.5, 121.95], // Babuyan
      [10.85, 121.0], // Cuyo
      [6.05, 121.0], // Sulu chain
      [5.2, 120.0],
      [6.5, 122.0],
      [9.17, 124.7], // Camiguin
      [9.85, 126.05], // Siargao
      [10.1, 125.6], // Dinagat
    ],
  },
  {
    owner: 'Russia',
    seeds: [
      [75.0, 57.0, 0.7], // Novaya Zemlya
      [79.5, 97.0, 0.8], // Severnaya Zemlya
      [75.0, 140.0, 0.7], // New Siberian Islands
      [71.2, 179.5, 0.4], // Wrangel Island
      [80.5, 55.0, 0.7], // Franz Josef Land
      [65.0, 35.7], // Solovetsky Islands
      [76.0, 137.0], // Kotelny
      [73.5, 113.0], // Lena Delta islands
    ],
  },
  {
    owner: 'Mexico',
    seeds: [
      [29.0, -118.3, 0.3], // Guadalupe Island
      [28.2, -115.2, 0.35], // Cedros Island
      [29.0, -112.4, 0.45], // Tiburon Island
    ],
  },
  {
    owner: 'Panama',
    seeds: [
      [7.5, -81.7, 0.35], // Coiba
      [8.3, -79.0], // Pearl Islands
      [9.3, -79.8], // Bocas del Toro
    ],
  },
  {
    owner: 'Colombia',
    seeds: [
      [12.5, -81.7], // San Andres
      [13.35, -81.37], // Providencia
      [4.0, -81.6],
    ],
  },
  {
    owner: 'Venezuela',
    seeds: [
      [11.85, -66.75], // Los Roques
      [15.67, -63.62], // Isla de Aves
      [11.0, -64.0], // Margarita
    ],
  },
  {
    owner: 'Honduras',
    seeds: [
      [16.3, -86.5], // Bay Islands
      [16.4, -85.9],
    ],
  },
  {
    owner: 'Nicaragua',
    seeds: [[12.2, -83.05]], // Corn Islands
  },
  {
    owner: 'Cuba',
    seeds: [
      [21.7, -82.8, 0.4], // Isle of Youth
      [22.4, -77.8], // Sabana-Camaguey keys
    ],
  },
  {
    owner: 'Haiti',
    seeds: [
      [19.8, -72.6, 0.3], // Tortuga
      [18.8, -73.0, 0.35], // Gonave
    ],
  },
  {
    owner: 'Dominican Rep.',
    seeds: [
      [18.1, -68.7], // Saona
      [18.2, -69.0], // Catalina
    ],
  },
  {
    owner: 'Jamaica',
    seeds: [
      [17.0, -77.8], // Pedro Cays
      [17.4, -75.0], // Morant Cays
    ],
  },
  {
    owner: 'Puerto Rico',
    seeds: [
      [18.12, -65.45], // Vieques
      [18.3, -65.3], // Culebra
      [18.08, -67.9], // Mona
    ],
  },
  {
    owner: 'Trinidad and Tobago',
    seeds: [
      [11.15, -60.8, 0.35], // Tobago
      [10.7, -61.0], // Monos
    ],
  },
  {
    owner: 'Bahamas',
    seeds: [
      [25.0, -77.5], // Andros
      [24.5, -76.0], // Exuma
      [26.5, -77.0], // Abaco
      [22.0, -74.3], // Long Island
      [23.0, -75.0],
    ],
  },
  {
    owner: 'Canada',
    seeds: [
      [43.93, -59.9], // Sable Island
      [47.2, -60.15], // St Paul Island
      [49.5, -63.0, 0.45], // Anticosti
      [73.0, -80.0, 1.0], // Baffin Island
      [80.0, -80.0, 1.1], // Ellesmere Island
      [70.0, -110.0, 1.0], // Victoria Island
      [63.0, -90.0, 0.7], // Southampton Island
    ],
  },
  {
    owner: 'Greenland',
    seeds: [
      [69.5, -52.0], // Disko Island
      [70.5, -22.0], // Scoresby Sund islands
      [83.6, -30.0], // Kaffeklubben Island
    ],
  },
];

interface LandCandidate {
  polygon: Polygon;
  centerLat: number;
  centerLon: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

function pointInRing(ring: FlatRing, lon: number, lat: number): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i] ?? 0;
    const yi = ring[i + 1] ?? 0;
    const xj = ring[j] ?? 0;
    const yj = ring[j + 1] ?? 0;
    const crosses = yi > lat !== yj > lat;

    if (crosses && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(polygon: Polygon, lon: number, lat: number): boolean {
  for (const shift of [0, 360, -360]) {
    let inside = false;
    for (const ring of polygon) {
      if (pointInRing(ring, lon + shift, lat)) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

function countryContains(country: CountryData, lat: number, lon: number): boolean {
  for (const polygon of country.polygons) {
    if (pointInPolygon(polygon, lon, lat)) return true;
  }
  return false;
}

function polygonSetsContain(polygons: PolygonSet, lat: number, lon: number): boolean {
  return polygons.some((polygon) => pointInPolygon(polygon, lon, lat));
}

function polygonCenter(polygon: Polygon): {
  lat: number;
  lon: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
} {
  const ring = polygon[0] ?? [];
  if (ring.length < 6) {
    return { lat: 0, lon: 0, minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
  }

  let referenceLon = ring[0] ?? 0;
  let sumLon = 0;
  let sumLat = 0;
  let count = 0;
  let minLat = 90;
  let maxLat = -90;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (let i = 0; i < ring.length; i += 2) {
    let lon = ring[i] ?? 0;
    const lat = ring[i + 1] ?? 0;
    while (lon - referenceLon > 180) lon -= 360;
    while (lon - referenceLon < -180) lon += 360;
    referenceLon = lon;
    sumLon += lon;
    sumLat += lat;
    count += 1;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  return {
    lat: sumLat / Math.max(1, count),
    lon: sumLon / Math.max(1, count),
    minLat,
    maxLat,
    minLon,
    maxLon,
  };
}

function distanceDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  let dLon = Math.abs(lon1 - lon2);
  if (dLon > 180) dLon = 360 - dLon;
  const cosLat = Math.cos(((lat1 + lat2) * 0.5 * Math.PI) / 180);
  return Math.hypot(dLon * cosLat, lat2 - lat1);
}

function normalizeLongitude(lon: number): number {
  let normalized = lon;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function buildLandCandidates(polygons: PolygonSet): LandCandidate[] {
  return polygons.map((polygon) => {
    const center = polygonCenter(polygon);
    return {
      polygon,
      centerLat: center.lat,
      centerLon: center.lon,
      minLat: center.minLat,
      maxLat: center.maxLat,
      minLon: center.minLon,
      maxLon: center.maxLon,
    };
  });
}

/**
 * Returns the real Natural Earth polygon at or very near a seed. Many small
 * islands are already in the land layer but are absent from the low-resolution
 * country layer; reusing the real shape keeps those chains detailed instead of
 * covering them with synthetic blobs.
 */
function findLandPolygon(
  candidates: readonly LandCandidate[],
  seed: IslandSeed,
  nearestSeedByCandidate: ReadonlyMap<LandCandidate, IslandSeed>,
): Polygon | null {
  const lat = seed[0];
  const lon = seed[1];
  const radius = seed[2] ?? DEFAULT_ISLAND_RADIUS;
  const reach = Math.min(MAX_LAND_MATCH_DISTANCE, Math.max(0.55, radius + 0.35));
  let best: Polygon | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    if (lat < candidate.minLat - reach || lat > candidate.maxLat + reach) continue;

    const seedDistance = distanceDeg(
      lat,
      lon,
      candidate.centerLat,
      candidate.centerLon,
    );

    // Dense archipelagos can put two political seeds within a fraction of a
    // degree of each other. Do not let one island claim a neighbour's real
    // polygon when the neighbour's seed is closer to its centre.
    if (nearestSeedByCandidate.get(candidate) !== seed) continue;

    if (pointInPolygon(candidate.polygon, lon, lat)) return candidate.polygon;

    if (seedDistance <= reach && seedDistance < bestDistance) {
      bestDistance = seedDistance;
      best = candidate.polygon;
    }
  }

  return best;
}

function createIslandRing(seed: IslandSeed, radiusOverride?: number): FlatRing {
  const lat = seed[0];
  const lon = seed[1];
  const radius =
    radiusOverride ?? Math.max(MIN_ISLAND_RADIUS, seed[2] ?? DEFAULT_ISLAND_RADIUS);
  const latitude = (lat * Math.PI) / 180;
  const lonRadius = radius / Math.max(0.35, Math.cos(latitude));
  const phase = Math.abs(lat * 1.7 + lon * 2.3);
  const ring: FlatRing = [];
  const vertices = 14;

  for (let i = 0; i < vertices; i += 1) {
    const angle = (i / vertices) * Math.PI * 2;
    const wobble =
      1 +
      0.12 * Math.sin(angle * 3 + phase) +
      0.06 * Math.cos(angle * 5 - phase * 0.5);
    ring.push(
      Math.round((lon + Math.cos(angle) * lonRadius * wobble) * 1000) / 1000,
      Math.round((lat + Math.sin(angle) * radius * wobble) * 1000) / 1000,
    );
  }

  return ring;
}

interface SyntheticIsland {
  seed: IslandSeed;
  polygon: Polygon;
  isCapital: boolean;
  baseRadius: number;
}

function addSyntheticIsland(
  seed: IslandSeed,
  isCapital: boolean,
  land: LandData,
  islandPolygons: Set<Polygon>,
  syntheticIslands: SyntheticIsland[],
): Polygon {
  const polygon: Polygon = [createIslandRing(seed)];
  land.polygons.push(polygon);
  islandPolygons.add(polygon);
  syntheticIslands.push({
    seed,
    polygon,
    isCapital,
    baseRadius: Math.max(MIN_ISLAND_RADIUS, seed[2] ?? DEFAULT_ISLAND_RADIUS),
  });
  return polygon;
}

function addSeed(
  owner: CountryData,
  seed: IslandSeed,
  land: LandData,
  landCandidates: readonly LandCandidate[],
  nearestSeedByCandidate: ReadonlyMap<LandCandidate, IslandSeed>,
  islandPolygons: Set<Polygon>,
  syntheticIslands: SyntheticIsland[],
): { synthetic: boolean; added: boolean } {
  if (countryContains(owner, seed[0], seed[1])) {
    for (const polygon of owner.polygons) {
      if (pointInPolygon(polygon, seed[1], seed[0])) {
        islandPolygons.add(polygon);
        break;
      }
    }
    return { synthetic: false, added: false };
  }

  const real = findLandPolygon(landCandidates, seed, nearestSeedByCandidate);
  if (real) {
    if (!owner.polygons.includes(real)) {
      owner.polygons.push(real);
      islandPolygons.add(real);
      return { synthetic: false, added: true };
    }
    islandPolygons.add(real);
    return { synthetic: false, added: false };
  }

  const polygon = addSyntheticIsland(
    seed,
    false,
    land,
    islandPolygons,
    syntheticIslands,
  );
  owner.polygons.push(polygon);
  return { synthetic: true, added: true };
}

function isOnLand(land: LandData, lon: number, lat: number): boolean {
  for (const polygon of land.polygons) {
    if (pointInPolygon(polygon, lon, lat)) return true;
  }
  return false;
}

function nearestIslandSeed(
  lat: number,
  lon: number,
  allSeeds: readonly IslandSeed[],
): IslandSeed | null {
  let nearest: IslandSeed | null = null;
  let nearestDistance = Infinity;

  for (const seed of allSeeds) {
    const distance = distanceDeg(lat, lon, seed[0], seed[1]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = seed;
    }
  }

  return nearestDistance <= CITY_SNAP_DISTANCE ? nearest : null;
}

function pointOnIsland(
  islandPolygons: ReadonlySet<Polygon>,
  lon: number,
  lat: number,
): boolean {
  for (const polygon of islandPolygons) {
    if (pointInPolygon(polygon, lon, lat)) return true;
  }
  return false;
}

/**
 * A centred marker can still land in an atoll lagoon. Walk outward across the
 * island footprint and use the first actual polygon point instead.
 */
function findIslandPoint(
  islandPolygons: ReadonlySet<Polygon>,
  seed: IslandSeed,
  preferredLat: number,
  preferredLon: number,
  cityIndex: number,
): { lat: number; lon: number } | null {
  if (pointOnIsland(islandPolygons, preferredLon, preferredLat)) {
    return { lat: preferredLat, lon: preferredLon };
  }

  const radius = Math.max(MIN_ISLAND_RADIUS, seed[2] ?? DEFAULT_ISLAND_RADIUS);
  const cosLat = Math.max(0.35, Math.cos((seed[0] * Math.PI) / 180));
  let dLat = preferredLat - seed[0];
  let dLon = (preferredLon - seed[1]) * cosLat;
  let baseAngle = Math.atan2(dLat, dLon);
  if (!Number.isFinite(baseAngle)) baseAngle = (cityIndex * 2.399963) % (Math.PI * 2);

  for (let step = 0; step < 32; step += 1) {
    // Alternate clockwise and counter-clockwise from the marker's bearing so
    // the corrected point stays as close to the original dot as possible.
    const direction = step % 2 === 0 ? 1 : -1;
    const angle = baseAngle + direction * Math.ceil(step / 2) * (Math.PI / 16);
    for (const fraction of [0.18, 0.28, 0.38, 0.5, 0.62, 0.74, 0.86, 0.96]) {
      const lat = seed[0] + Math.sin(angle) * radius * fraction;
      const lon = seed[1] + (Math.cos(angle) * radius * fraction) / cosLat;
      if (pointOnIsland(islandPolygons, lon, lat)) return { lat, lon };
    }
  }

  return null;
}

/**
 * Populated-place points are often stored just offshore of a generalized
 * coastline. On the tiny supplemental islands that reads as a city floating
 * beside its island, so snap those points a short distance onto the island
 * footprint while preserving their direction from the island centre.
 */
function snapIslandCities(
  cities: CitiesData,
  land: LandData,
  allSeeds: readonly IslandSeed[],
  islandPolygons: ReadonlySet<Polygon>,
): number {
  let snapped = 0;

  for (let i = 0; i + 2 < cities.cities.length; i += 3) {
    const lat = cities.cities[i]!;
    const lon = cities.cities[i + 1]!;
    const seed = nearestIslandSeed(lat, lon, allSeeds);
    if (!seed) continue;

    let onIsland = false;
    for (const polygon of islandPolygons) {
      if (pointInPolygon(polygon, lon, lat)) {
        onIsland = true;
        break;
      }
    }
    if (!onIsland && isOnLand(land, lon, lat)) continue;

    const radius = Math.max(MIN_ISLAND_RADIUS, seed[2] ?? DEFAULT_ISLAND_RADIUS);
    const cosLat = Math.max(0.35, Math.cos((seed[0] * Math.PI) / 180));
    let offsetLat = lat - seed[0];
    let offsetLon = (lon - seed[1]) * cosLat;
    let length = Math.hypot(offsetLat, offsetLon);

    if (length < 1e-5) {
      const angle = (i / 3) * 2.399963;
      offsetLat = Math.sin(angle);
      offsetLon = Math.cos(angle);
      length = 1;
    }

    // Keep the marker comfortably inside the visible blob; the ring wobble
    // never brings the coastline closer than about 0.8 of its nominal radius.
    const targetOffset = Math.min(0.12, radius * 0.32);
    const scale = targetOffset / length;
    const preferredLat = seed[0] + offsetLat * scale;
    const preferredLon = seed[1] + (offsetLon * scale) / cosLat;
    const destination = findIslandPoint(
      islandPolygons,
      seed,
      preferredLat,
      preferredLon,
      i / 3,
    );
    if (!destination) continue;

    cities.cities[i] = Math.round(destination.lat * 1000) / 1000;
    cities.cities[i + 1] = Math.round(normalizeLongitude(destination.lon) * 1000) / 1000;
    snapped += 1;
  }

  return snapped;
}

function isPointOnLand(
  candidates: readonly LandCandidate[],
  lon: number,
  lat: number,
): boolean {
  for (const candidate of candidates) {
    if (lat < candidate.minLat || lat > candidate.maxLat) continue;

    let inLonRange = false;
    for (const shift of [0, 360, -360]) {
      const shifted = lon + shift;
      if (shifted >= candidate.minLon && shifted <= candidate.maxLon) {
        inLonRange = true;
        break;
      }
    }
    if (!inLonRange) continue;
    if (pointInPolygon(candidate.polygon, lon, lat)) return true;
  }

  return false;
}

interface LandVertexHit {
  polygon: Polygon;
  lat: number;
  lon: number;
  centerLat: number;
  centerLon: number;
}

function nearestLandVertex(
  candidates: readonly LandCandidate[],
  lat: number,
  lon: number,
): LandVertexHit | null {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let nearest: LandVertexHit | null = null;
  let nearestDistance = OFFSHORE_SNAP_REACH * OFFSHORE_SNAP_REACH;

  for (const candidate of candidates) {
    if (
      lat < candidate.minLat - OFFSHORE_SNAP_REACH ||
      lat > candidate.maxLat + OFFSHORE_SNAP_REACH
    ) {
      continue;
    }

    for (const ring of candidate.polygon) {
      for (let i = 0; i + 1 < ring.length; i += 2) {
        const vertexLat = ring[i + 1] ?? 0;
        const vertexLon = ring[i] ?? 0;
        const dLat = vertexLat - lat;
        let dLon = vertexLon - lon;
        if (dLon > 180) dLon -= 360;
        if (dLon < -180) dLon += 360;
        const distance = dLat * dLat + (dLon * cosLat) ** 2;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = {
            polygon: candidate.polygon,
            lat: vertexLat,
            lon: vertexLon,
            centerLat: candidate.centerLat,
            centerLon: candidate.centerLon,
          };
        }
      }
    }
  }

  return nearest;
}

function nudgeInsidePolygon(hit: LandVertexHit): { lat: number; lon: number } {
  const cosLat = Math.max(0.25, Math.cos((hit.lat * Math.PI) / 180));
  let dLat = hit.centerLat - hit.lat;
  let dLon = hit.centerLon - hit.lon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const length = Math.hypot(dLat, dLon * cosLat);

  if (length > 1e-6) {
    dLat /= length;
    dLon /= length;
    for (const step of [0.012, 0.024, 0.04, 0.06, 0.09, 0.13, 0.18, 0.25]) {
      const lat = hit.lat + dLat * step;
      const lon = hit.lon + (dLon * step) / cosLat;
      if (pointInPolygon(hit.polygon, lon, lat)) return { lat, lon };
    }
  }

  // The polygon centre can lie in a lagoon or outside a crescent-shaped ring.
  // Fall back to probing around the coastline vertex in every direction.
  for (let step = 0; step < 16; step += 1) {
    const angle = (step * Math.PI) / 8;
    for (const distance of [0.012, 0.025, 0.045, 0.07]) {
      const lat = hit.lat + Math.sin(angle) * distance;
      const lon = hit.lon + (Math.cos(angle) * distance) / cosLat;
      if (pointInPolygon(hit.polygon, lon, lat)) return { lat, lon };
    }
  }

  return { lat: hit.lat, lon: hit.lon };
}

/** Pull any remaining populated-place dots that sit in water onto the coast. */
function snapOffshoreCities(cities: CitiesData, land: LandData): number {
  const candidates = buildLandCandidates(land.polygons);
  let snapped = 0;

  for (let i = 0; i + 2 < cities.cities.length; i += 3) {
    const lat = cities.cities[i]!;
    const lon = cities.cities[i + 1]!;
    if (isPointOnLand(candidates, lon, lat)) continue;

    const hit = nearestLandVertex(candidates, lat, lon);
    if (!hit) continue;

    const destination = nudgeInsidePolygon(hit);
    cities.cities[i] = Math.round(destination.lat * 1000) / 1000;
    cities.cities[i + 1] = Math.round(normalizeLongitude(destination.lon) * 1000) / 1000;
    snapped += 1;
  }

  return snapped;
}

/**
 * The source data has many islands only a few kilometres apart. Drawing every
 * one at the old fixed radius turns those chains into a single overlapping
 * mass. Shrink each islet to the space between its neighbours, then relax the
 * remaining overlaps so the chain keeps its line while becoming readable.
 * National capitals stay put and remain large enough to anchor the country.
 */
function spaceSyntheticIslands(
  islands: readonly SyntheticIsland[],
  allSeeds: readonly IslandSeed[],
): number {
  interface Slot {
    lat: number;
    lon: number;
    originalLat: number;
    originalLon: number;
    radius: number;
    isCapital: boolean;
  }

  const slots: Slot[] = [];
  for (const island of islands) {
    let nearest = Infinity;
    for (const seed of allSeeds) {
      if (seed === island.seed) continue;
      const distance = distanceDeg(
        island.seed[0],
        island.seed[1],
        seed[0],
        seed[1],
      );
      if (distance < nearest) nearest = distance;
    }

    const spacingRadius =
      (nearest - SYNTHETIC_GAP) / (2 * SYNTHETIC_WOBBLE_REACH);
    const radius = island.isCapital
      ? Math.min(island.baseRadius, CAPITAL_ISLAND_RADIUS)
      : Math.max(
          MIN_SYNTHETIC_RADIUS,
          Math.min(island.baseRadius, spacingRadius),
        );

    slots.push({
      lat: island.seed[0],
      lon: island.seed[1],
      originalLat: island.seed[0],
      originalLon: island.seed[1],
      radius,
      isCapital: island.isCapital,
    });
  }

  for (let iteration = 0; iteration < 40; iteration += 1) {
    for (let i = 0; i < slots.length; i += 1) {
      const a = slots[i]!;
      for (let j = i + 1; j < slots.length; j += 1) {
        const b = slots[j]!;
        let dLon = b.lon - a.lon;
        while (dLon > 180) dLon -= 360;
        while (dLon < -180) dLon += 360;
        const cosLat = Math.cos((((a.lat + b.lat) * 0.5) * Math.PI) / 180);
        const dx = dLon * cosLat;
        const dy = b.lat - a.lat;
        const distance = Math.hypot(dx, dy);
        const required =
          (a.radius + b.radius) * SYNTHETIC_WOBBLE_REACH + SYNTHETIC_GAP;
        if (distance >= required || distance < 1e-6) continue;

        const overlap = required - distance;
        const nx = dx / distance;
        const ny = dy / distance;
        const aFixed = a.isCapital;
        const bFixed = b.isCapital;
        const aShare = aFixed ? 0 : bFixed ? 1 : 0.5;
        const bShare = bFixed ? 0 : aFixed ? 1 : 0.5;
        const aCos = Math.cos((a.lat * Math.PI) / 180);
        const bCos = Math.cos((b.lat * Math.PI) / 180);

        a.lat -= ny * overlap * aShare;
        a.lon -= (nx * overlap * aShare) / Math.max(0.3, aCos);
        b.lat += ny * overlap * bShare;
        b.lon += (nx * overlap * bShare) / Math.max(0.3, bCos);
      }
    }

    // A light spring keeps islands near the real chain axis while the pairwise
    // pushes create gaps. Capital markers are anchored to their real sites.
    for (const slot of slots) {
      if (slot.isCapital) continue;
      slot.lat += (slot.originalLat - slot.lat) * 0.015;
      slot.lon += (slot.originalLon - slot.lon) * 0.015;
    }

    for (const slot of slots) {
      if (slot.isCapital) continue;
      let dLat = slot.lat - slot.originalLat;
      let dLon = slot.lon - slot.originalLon;
      while (dLon > 180) dLon -= 360;
      while (dLon < -180) dLon += 360;
      const cosLat = Math.cos((slot.originalLat * Math.PI) / 180);
      const shift = Math.hypot(dLat, dLon * cosLat);
      if (shift > 1.1) {
        const scale = 1.1 / shift;
        dLat *= scale;
        dLon *= scale;
        slot.lat = slot.originalLat + dLat;
        slot.lon = slot.originalLon + dLon;
      }
      slot.lon = normalizeLongitude(slot.lon);
    }
  }

  // If a displacement cap left two islands touching, shrink the non-capital
  // one to its final gap rather than letting the polygons overlap again.
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i]!;
    if (slot.isCapital) continue;
    let nearest = Infinity;
    for (let j = 0; j < slots.length; j += 1) {
      if (i === j) continue;
      const distance = distanceDeg(
        slot.lat,
        slot.lon,
        slots[j]!.lat,
        slots[j]!.lon,
      );
      if (distance < nearest) nearest = distance;
    }
    const fit =
      (nearest - SYNTHETIC_GAP) / (2 * SYNTHETIC_WOBBLE_REACH);
    slot.radius = Math.max(
      MIN_SYNTHETIC_RADIUS,
      Math.min(slot.radius, fit),
    );
  }

  let changed = 0;
  for (let i = 0; i < islands.length; i += 1) {
    const island = islands[i]!;
    const slot = slots[i]!;
    const moved = distanceDeg(
      island.seed[0],
      island.seed[1],
      slot.lat,
      slot.lon,
    );
    const radiusChanged =
      Math.abs(slot.radius - island.baseRadius) > 0.005;
    if (moved < 0.005 && !radiusChanged) continue;

    island.polygon[0] = createIslandRing(
      [slot.lat, slot.lon, slot.radius],
      slot.radius,
    );
    changed += 1;
  }

  return changed;
}

/**
 * Extends the map with the small-island chains that are too small for the
 * 1:110m admin layer. Existing sovereign states that were omitted are appended
 * as countries; dependent chains are folded into their parent country so they
 * remain clickable, conquerable and usable for construction.
 */
export function addOutlyingIslands(
  land: LandData,
  countries: CountriesData,
  cities: CitiesData,
): void {
  const countryByName = new Map(
    countries.countries.map((country) => [country.name, country]),
  );
  const landCandidates = buildLandCandidates(land.polygons);
  const islandPolygons = new Set<Polygon>();
  const syntheticIslands: SyntheticIsland[] = [];
  const allSeeds: readonly IslandSeed[] = [
    ...TERRITORY_CHAINS.flatMap((territory) => territory.seeds),
    ...NEW_NATIONS.flatMap((nation) => nation.seeds),
  ];
  const nearestSeedByCandidate = new Map<LandCandidate, IslandSeed>();
  for (const candidate of landCandidates) {
    let nearest: IslandSeed | undefined;
    let nearestDistance = Infinity;
    for (const seed of allSeeds) {
      const distance = distanceDeg(
        seed[0],
        seed[1],
        candidate.centerLat,
        candidate.centerLon,
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = seed;
      }
    }
    if (nearest) nearestSeedByCandidate.set(candidate, nearest);
  }
  let synthetic = 0;
  let territoryIslands = 0;

  const addTerritoryChain = (territory: TerritorySeed): void => {
    const owner = countryByName.get(territory.owner);
    if (!owner) {
      console.warn(`[pacific] missing territory owner: ${territory.owner}`);
      return;
    }

    for (const seed of territory.seeds) {
      const result = addSeed(
        owner,
        seed,
        land,
        landCandidates,
        nearestSeedByCandidate,
        islandPolygons,
        syntheticIslands,
      );
      if (result.synthetic) synthetic += 1;
      if (result.added) territoryIslands += 1;
    }
  };

  for (const territory of TERRITORY_CHAINS) addTerritoryChain(territory);

  let nationIslands = 0;
  for (const nation of NEW_NATIONS) {
    const polygons: PolygonSet = [];

    for (const seed of nation.seeds) {
      const real = findLandPolygon(landCandidates, seed, nearestSeedByCandidate);
      if (real) {
        if (!polygons.includes(real)) polygons.push(real);
        continue;
      }

      const polygon = addSyntheticIsland(
        seed,
        false,
        land,
        islandPolygons,
        syntheticIslands,
      );
      polygons.push(polygon);
      synthetic += 1;
      nationIslands += 1;
    }

    // A small country whose real land is already occupied by another polygon
    // could otherwise have no country grid cells at all. The synthetic capital
    // islet guarantees a viable capital site and a selectable map footprint.
    if (!polygonSetsContain(polygons, nation.capitalLat, nation.capitalLon)) {
      const polygon = addSyntheticIsland(
        [nation.capitalLat, nation.capitalLon, CAPITAL_ISLAND_RADIUS],
        true,
        land,
        islandPolygons,
        syntheticIslands,
      );
      polygons.push(polygon);
      synthetic += 1;
      nationIslands += 1;
    }

    countries.countries.push({
      name: nation.name,
      iso: nation.iso,
      capital: nation.capital,
      capitalLat: nation.capitalLat,
      capitalLon: nation.capitalLon,
      siteLat: nation.capitalLat,
      siteLon: nation.capitalLon,
      timezone: nation.timezone,
      pop: nation.pop,
      polygons,
    });
    for (const polygon of polygons) islandPolygons.add(polygon);
  }

  const spacedIslands = spaceSyntheticIslands(syntheticIslands, allSeeds);

  const snappedIslandCities = snapIslandCities(
    cities,
    land,
    allSeeds,
    islandPolygons,
  );
  const snappedOffshoreCities = snapOffshoreCities(cities, land);

  console.info(
    `[islands] added ${NEW_NATIONS.length} island nations, ${territoryIslands} territory islands, ${nationIslands} national islands (${synthetic} synthesized, ${spacedIslands} spaced, ${snappedIslandCities} island and ${snappedOffshoreCities} offshore city markers snapped)`,
  );
}
