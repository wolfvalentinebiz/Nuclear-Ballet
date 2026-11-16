import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import { createLandMask, createTerrainCanvas } from './geo/texture';
import { createBorderCanvas } from './geo/borders';
import { addOutlyingIslands } from './geo/outlyingIslands';
import { createNaturalCanvas, createNaturalField, naturalRegionAt } from './geo/natural';
import { buildPopulationField } from './population/build';
import { countryAnnualGrowthRates } from './population/growth';
import type { StrikeResult } from './population/field';
import { Globe, type MapMode } from './globe/earth';
import { BorderLines, CountryOutline } from './globe/borderLines';
import { Starfield } from './globe/starfield';
import { CapitalLayer } from './globe/capitalLayer';
import { CityLayer } from './globe/cityLayer';
import { assignSecondaryCapitals } from './game/capitals';
import { findBuildingSites, findLeastPopulatedSites } from './game/sites';
import { Sun } from './globe/sun';
import { Atmosphere } from './globe/atmosphere';
import { Moon } from './globe/moon';
import { geoToWorld } from './globe/orientation';
import { CityLights } from './globe/cityLights';
import { CountryAtlas } from './geo/countries';
import { ClockPanel } from './ui/clockPanel';
import { BuildingLayer } from './game/buildingLayer';
import { isLandAt, isOceanCoastline } from './game/coastline';
import { BUILDING_SPECS, type Building, type BuildingType } from './game/buildings';
import { buildBuildingMenu } from './ui/buildingMenu';
import { SimulationClock, type TimeSpeed } from './sim/clock';
import { createEarthMoonSystem } from './sim/earthMoon';
import { ResourceLedger, formatResource } from './economy/resources';
import { InterceptorRanges } from './game/interceptorRanges';
import { ProductionSystem } from './game/production';
import {
  BASE_BUILD_DAYS,
  BUILDING_COST_COINS,
  ConstructionSystem,
} from './game/construction';
import { ResearchState } from './game/research';
import {
  DiplomacySystem,
  MAX_RELATION_ACTIONS,
  RELATION_ACTION_STEP,
  type RelationActionStatus,
  type RelationDirection,
  type TreatyType,
  type WarPreview,
  type WarRole,
} from './game/diplomacy';
import { WarfareSystem } from './game/warfare';
import { WarFrontOverlay } from './game/warFrontOverlay';
import {
  SIGHT_RADIUS_KM,
  countriesShareLandBorder,
  createSightVisibility,
  distanceToCountryBorderKm,
  invalidateSightCaches,
} from './game/sight';
import { ProductionPanel } from './ui/productionPanel';
import { Outliner } from './ui/outliner';
import { ResearchPanel } from './ui/researchPanel';
import { DiplomacyUi } from './ui/diplomacyUi';
import { NuclearSystem } from './game/nuclear';
import {
  NuclearUi,
  NUKE_PLANS,
  type NukePlan,
} from './ui/nuclearUi';
import { AIController } from './game/ai';
import { GodmodeUi } from './ui/godmodeUi';
import { PopulationCounter } from './ui/populationCounter';
import { nuclearItems, type ProductionItem } from './game/arsenal';
import { emptyCheatFlags } from './game/cheats';
import { subsolarPoint } from './solar';
import { PALETTE } from './palette';
import { HEAT_CLASSES } from './population/ramp';
import type {
  CitiesData,
  CountriesData,
  CountryData,
  LakeData,
  LandData,
} from './geo/types';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const CHEAT_RESOURCE_AMOUNT = 999_999_999;
const CHEAT_NUKE_STOCK = 9_999;
const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;

type ViewMode = 'earth' | 'system' | 'moon';
type GamePhase = 'menu' | 'nation-select' | 'playing';

interface CameraState {
  position: THREE.Vector3;
  target: THREE.Vector3;
  anchor: THREE.Vector3 | null;
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`The page layout is missing ${selector}.`);
  return element;
}

function greatCircleKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = lat1 * RAD;
  const phi2 = lat2 * RAD;
  const deltaPhi = (lat2 - lat1) * RAD;
  const deltaLon = (lon2 - lon1) * RAD;
  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

const stage = requireElement<HTMLElement>('#stage');
const canvas = requireElement<HTMLCanvasElement>('#world');
const boot = requireElement<HTMLElement>('#boot');
const bootFill = requireElement<HTMLElement>('#boot-fill');
const bootStatus = requireElement<HTMLElement>('#boot-status');
const legend = requireElement<HTMLElement>('#legend');
const legendRows = requireElement<HTMLElement>('#legend-rows');
const naturalLegend = requireElement<HTMLElement>('#natural-legend');
const overlayCanvas = requireElement<HTMLCanvasElement>('#overlay');
const capitalOverlay = requireElement<HTMLCanvasElement>('#capital-overlay');
const cityOverlay = requireElement<HTMLCanvasElement>('#city-overlay');
const outlinerElement = requireElement<HTMLElement>('#outliner');
const buildingButtons = requireElement<HTMLElement>('#building-buttons');
const buildNote = requireElement<HTMLElement>('#build-note');
const clockTime = requireElement<HTMLElement>('#clock-time');
const clockDate = requireElement<HTMLElement>('#clock-date');
const clockMeta = requireElement<HTMLElement>('#clock-meta');
const coinsValue = requireElement<HTMLElement>('#coins-value');
const researchValue = requireElement<HTMLElement>('#research-value');
const manpowerValue = requireElement<HTMLElement>('#manpower-value');
const interceptorsValue = requireElement<HTMLElement>('#interceptors-value');
const nukesValue = requireElement<HTMLElement>('#nukes-value');
const icbmsValue = requireElement<HTMLElement>('#icbms-value');
const nukeControls = requireElement<HTMLElement>('#nuke-controls');
const nukeFiles = requireElement<HTMLElement>('#nuke-files');
const nukeMenu = requireElement<HTMLElement>('#nuke-menu');
const nukeMenuList = requireElement<HTMLElement>('#nuke-menu-list');
const nukeMenuStatus = requireElement<HTMLElement>('#nuke-menu-status');
const nukePlatformStatus = requireElement<HTMLElement>('#nuke-platform-status');
const planetPopulationValue = requireElement<HTMLElement>('#planet-population-value');
const planetPopulationDelta = requireElement<HTMLElement>('#planet-population-delta');
const nationPopulation = requireElement<HTMLElement>('#nation-population');
const nationPopulationLabel = requireElement<HTMLElement>('#nation-population-label');
const nationPopulationValue = requireElement<HTMLElement>('#nation-population-value');
const nuclearFlash = requireElement<HTMLElement>('#nuclear-flash');
const godmodeToggle = requireElement<HTMLButtonElement>('#godmode-toggle');
const godmodeWindow = requireElement<HTMLElement>('#godmode-window');
const godmodeClose = requireElement<HTMLButtonElement>('#godmode-close');
const interceptorCursor = requireElement<HTMLElement>('#interceptor-cursor');
const hoverTooltip = requireElement<HTMLElement>('#hover-tooltip');
const researchOpen = requireElement<HTMLButtonElement>('#research-open');
const productionOpen = requireElement<HTMLButtonElement>('#production-open');
const productionWindow = requireElement<HTMLElement>('#production-window');
const productionClose = requireElement<HTMLButtonElement>('#production-close');
const productionTabs = requireElement<HTMLElement>('#production-tabs');
const productionFactoryLine = requireElement<HTMLElement>('#production-factory-line');
const productionItems = requireElement<HTMLElement>('#production-items');
const productionQueue = requireElement<HTMLElement>('#production-queue');
const productionInventory = requireElement<HTMLElement>('#production-inventory');
const productionMessage = requireElement<HTMLElement>('#production-message');
const researchWindow = requireElement<HTMLElement>('#research-window');
const researchClose = requireElement<HTMLButtonElement>('#research-close');
const researchSummary = requireElement<HTMLElement>('#research-summary');
const researchBranches = requireElement<HTMLElement>('#research-branches');
const researchPoints = requireElement<HTMLElement>('#research-points');
const researchMessage = requireElement<HTMLElement>('#research-message');
const nationMenu = requireElement<HTMLElement>('#nation-menu');
const nationMenuTitle = requireElement<HTMLElement>('#nation-menu-title');
const nationMenuStatus = requireElement<HTMLElement>('#nation-menu-status');
const improveOpinionButton = requireElement<HTMLButtonElement>('#improve-opinion');
const harmRelationsButton = requireElement<HTMLButtonElement>('#harm-relations');
const nationOpinion = requireElement<HTMLElement>('#nation-opinion');
const nationPower = requireElement<HTMLElement>('#nation-power');
const nationAcceptance = requireElement<HTMLElement>('#nation-acceptance');
const proposePact = requireElement<HTMLButtonElement>('#propose-pact');
const proposeAlliance = requireElement<HTMLButtonElement>('#propose-alliance');
const declareWar = requireElement<HTMLButtonElement>('#declare-war');
const warWindow = requireElement<HTMLElement>('#war-window');
const warClose = requireElement<HTMLButtonElement>('#war-close');
const warCancel = requireElement<HTMLButtonElement>('#war-cancel');
const warConfirm = requireElement<HTMLButtonElement>('#war-confirm');
const warTargetName = requireElement<HTMLElement>('#war-target-name');
const warEnemyList = requireElement<HTMLElement>('#war-enemy-list');
const warPlayerList = requireElement<HTMLElement>('#war-player-list');
const warUninvolved = requireElement<HTMLElement>('#war-uninvolved');
const activeWarButton = requireElement<HTMLButtonElement>('#war-open');
const activeWarCount = requireElement<HTMLElement>('#war-open-count');
const activeWarWindow = requireElement<HTMLElement>('#active-war-window');
const activeWarClose = requireElement<HTMLButtonElement>('#active-war-close');
const activeWarTabs = requireElement<HTMLElement>('#active-war-tabs');
const activeWarPanels = requireElement<HTMLElement>('#active-war-panels');
const activeWarNote = requireElement<HTMLElement>('#active-war-note');
const gameToast = requireElement<HTMLElement>('#game-toast');
const startMenu = requireElement<HTMLElement>('#start-menu');
const nationSelect = requireElement<HTMLElement>('#nation-select');
const menuNote = requireElement<HTMLElement>('#menu-note');
const playNationButton = requireElement<HTMLButtonElement>('#play-nation');
const nationBackButton = requireElement<HTMLButtonElement>('#nation-back');
const menuButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-menu-action]'),
);
const modeButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('.map-mode [data-mode]'),
);
const viewButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('.view-mode [data-view]'),
);
const timeButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('.time-controls button'),
);

function hideHoverTooltip(): void {
  hoverTooltip.hidden = true;
}

function positionHoverTooltip(
  clientX: number,
  clientY: number,
  offsetX = 16,
  offsetY = 16,
): void {
  const rect = stage.getBoundingClientRect();
  const scale = rect.width / STAGE_WIDTH;
  if (scale <= 0) return;

  const pointerX = (clientX - rect.left) / scale;
  const pointerY = (clientY - rect.top) / scale;
  const width = hoverTooltip.offsetWidth;
  const height = hoverTooltip.offsetHeight;
  let x = pointerX + offsetX;
  let y = pointerY + offsetY;

  if (x + width > STAGE_WIDTH - 12) x = pointerX - width - offsetX;
  if (y + height > STAGE_HEIGHT - 12) y = pointerY - height - offsetY;

  hoverTooltip.style.left = `${Math.max(12, x)}px`;
  hoverTooltip.style.top = `${Math.max(12, y)}px`;
}

function showHoverTooltip(
  message: string,
  clientX: number,
  clientY: number,
  kind: 'resource' | 'country' = 'resource',
): void {
  hoverTooltip.textContent = message;
  hoverTooltip.classList.toggle('hover-tooltip--country', kind === 'country');
  hoverTooltip.hidden = false;
  positionHoverTooltip(clientX, clientY);
}

function wireResourceTooltips(): void {
  const rows = document.querySelectorAll<HTMLElement>('.resource[data-tooltip]');
  for (const row of rows) {
    const message = row.dataset.tooltip;
    if (!message) continue;

    row.addEventListener('pointerenter', (event) => {
      showHoverTooltip(message, event.clientX, event.clientY);
    });
    row.addEventListener('pointermove', (event) => {
      if (!hoverTooltip.hidden) {
        positionHoverTooltip(event.clientX, event.clientY);
      }
    });
    row.addEventListener('pointerleave', hideHoverTooltip);
  }
}

function fitStage(): number {
  const scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
  stage.style.setProperty('--stage-scale', String(scale));
  return scale;
}

function setBoot(progress: number, status?: string): void {
  bootFill.style.width = `${Math.round(progress * 100)}%`;
  if (status) bootStatus.textContent = status;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    // A background tab does not deliver animation frames; boot should still
    // finish so the game is ready the moment the tab is shown again. Avoid a
    // timer here: hidden tabs throttle them, which can strand the boot screen.
    if (document.hidden) {
      resolve();
      return;
    }
    requestAnimationFrame(() => resolve());
  });
}

async function loadJson<T>(file: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!response.ok) throw new Error(`Unable to load ${file} (HTTP ${response.status}).`);
  return (await response.json()) as T;
}

function buildLegend(): void {
  for (const heatClass of HEAT_CLASSES) {
    const row = document.createElement('div');
    row.className = 'legend__row';

    const swatch = document.createElement('span');
    swatch.className = 'legend__swatch';
    swatch.style.backgroundColor = heatClass.swatch;

    const label = document.createElement('span');
    label.className = 'legend__label';
    label.textContent = heatClass.label;

    row.append(swatch, label);
    legendRows.append(row);
  }
}

async function start(): Promise<void> {
  fitStage();
  buildLegend();
  wireResourceTooltips();

  let buildType: BuildingType | null = null;
  let buildNoteTimer = 0;
  let syncInterceptorOverlay = (): void => {};
  let onBuildTypeChange = (): void => {};
  let constructionDaysForNote = (): number => BASE_BUILD_DAYS;
  const noteFor = (type: BuildingType | null): string => {
    const costAndTime = `${BUILDING_COST_COINS} COINS · ${Math.round(
      constructionDaysForNote(),
    )} DAYS`;
    if (!type) return costAndTime;
    return type === 'dockyard'
      ? `DOCKYARD · COASTAL LAND ONLY · ${costAndTime}`
      : `LAND ONLY · ${costAndTime}`;
  };
  const flashBuildNote = (message: string): void => {
    buildNote.textContent = message;
    window.clearTimeout(buildNoteTimer);
    buildNoteTimer = window.setTimeout(() => {
      if (buildType) buildNote.textContent = noteFor(buildType);
    }, 1600);
  };
  buildBuildingMenu(buildingButtons, (type) => {
    buildType = type;
    canvas.classList.toggle('building-mode', type !== null);
    window.clearTimeout(buildNoteTimer);
    buildNote.textContent = noteFor(type);
    onBuildTypeChange();
  });
  buildNote.textContent = noteFor(null);

  setBoot(0.06, 'ACQUIRING EARTH DATA');
  const [land, lakes, countries, cities] = await Promise.all([
    loadJson<LandData>('land.json'),
    loadJson<LakeData>('lakes.json'),
    loadJson<CountriesData>('countries.json'),
    loadJson<CitiesData>('cities.json'),
  ]);

  addOutlyingIslands(land, countries, cities);

  setBoot(0.28, 'RASTERIZING COASTLINES');
  await nextFrame();
  const terrainCanvas = createTerrainCanvas(land, lakes);

  setBoot(0.38, 'MAPPING NATURAL BARRIERS');
  await nextFrame();
  const naturalCanvas = createNaturalCanvas(land, lakes);

  setBoot(0.52, 'RESOLVING POPULATION DENSITY');
  await nextFrame();
  const field = buildPopulationField(land, lakes, countries, cities);
  const countryIndexByName = new Map(
    countries.countries.map((country, index) => [country.name, index]),
  );
  field.setCountryGrowthRates(countryAnnualGrowthRates(countries.countries));
  const populationCounter = new PopulationCounter({
    value: planetPopulationValue,
    delta: planetPopulationDelta,
  });
  populationCounter.setTotal(field.total);
  const populationForNation = (nation: string): number => {
    const index = countryIndexByName.get(nation);
    return index === undefined ? 0 : field.populationForCountry(index);
  };
  const naturalField = createNaturalField(land, lakes, field.width, field.height);
  const lakeMask = createLandMask(
    { polygons: lakes.polygons },
    { polygons: [] },
    field.width,
    field.height,
  );

  const sim = new SimulationClock(new Date(), 'play');
  const clockPanel = new ClockPanel({
    time: clockTime,
    date: clockDate,
    meta: clockMeta,
  });
  const activeCountries = (): CountryData[] =>
    countries.countries.filter((country) => country.polygons.length > 0);
  let atlas = new CountryAtlas({ countries: activeCountries() });
  const countryByName = new Map(
    activeCountries().map((country) => [country.name, country]),
  );
  const borderCanvas = createBorderCanvas(countries);

  assignSecondaryCapitals(
    countries.countries,
    cities.cities,
    field,
    (lat, lon) => atlas.find(lat, lon)?.country.name ?? null,
  );
  const reactorSites = findLeastPopulatedSites(
    field,
    countries.countries.length,
    (countryId, lat, lon) => {
      const match = atlas.find(lat, lon);
      return match?.country.name === countries.countries[countryId]?.name;
    },
  );

  const nearbyCountrySite = (
    country: CountryData,
  ): { lat: number; lon: number } | null => {
    if (country.capitalLat === null || country.capitalLon === null) return null;
    const latRadians = country.capitalLat * (Math.PI / 180);
    for (const distance of [0.2, 0.35, 0.55, 0.8, 1.1, 1.5, 2]) {
      for (let step = 0; step < 24; step += 1) {
        const angle = (step / 24) * Math.PI * 2;
        const lat = country.capitalLat + distance * Math.sin(angle);
        const lon =
          country.capitalLon +
          (distance * Math.cos(angle)) / Math.max(0.2, Math.cos(latRadians));
        if (lat < -85 || lat > 85) continue;
        const match = atlas.find(lat, lon);
        if (match?.country.name === country.name) {
          return {
            lat: Math.round(lat * 1000) / 1000,
            lon: Math.round(lon * 1000) / 1000,
          };
        }
      }
    }
    return null;
  };

  for (const country of activeCountries()) {
    if (country.secondaryCapitalLat == null || country.secondaryCapitalLon == null) {
      continue;
    }
    const secondaryCountry = atlas.find(
      country.secondaryCapitalLat,
      country.secondaryCapitalLon,
    )?.country.name;
    if (secondaryCountry === country.name) continue;
    const site =
      reactorSites[countries.countries.indexOf(country)] ?? nearbyCountrySite(country);
    if (!site) continue;
    country.secondaryCapitalLat = site.lat;
    country.secondaryCapitalLon = site.lon;
  }

  const buildingLayer = new BuildingLayer(overlayCanvas);
  const capitalLayer = new CapitalLayer(capitalOverlay);
  capitalLayer.setCountries(activeCountries());
  const dockyardSlot = BUILDING_SPECS.findIndex((spec) => spec.type === 'dockyard');
  const buildingSites = findBuildingSites(
    field,
    countries.countries.length,
    BUILDING_SPECS.length,
    new Set([dockyardSlot]),
    (lat, lon) => isOceanCoastline(field, lakeMask, lat, lon),
  );
  const initialBuildings: Building[] = [];
  for (const country of activeCountries()) {
    const countryIndex = countries.countries.indexOf(country);
    const sites = buildingSites[countryIndex] ?? [];
    const reactorSite = reactorSites[countryIndex] ?? null;
    const fallbackSite = reactorSite ?? nearbyCountrySite(country);
    const fallbackLat = fallbackSite?.lat ?? country.siteLat;
    const fallbackLon = fallbackSite?.lon ?? country.siteLon;
    const key = country.iso || country.name;

    for (let slot = 0; slot < BUILDING_SPECS.length; slot += 1) {
      const spec = BUILDING_SPECS[slot]!;
      const site = sites[slot] ?? fallbackSite;
      const lat = site?.lat ?? fallbackLat;
      const lon = site?.lon ?? fallbackLon;
      if (lat === null || lon === null) continue;
      initialBuildings.push({
        id: `${countryIndex}-${key}-${spec.type}`,
        type: spec.type,
        lat,
        lon,
        country: country.name,
      });
    }
  }
  buildingLayer.setBuildings(initialBuildings);

  const aiLandSites = new Map<string, Array<{ lat: number; lon: number }>>();
  const landSitesFor = (nation: string): Array<{ lat: number; lon: number }> => {
    const cached = aiLandSites.get(nation);
    if (cached) return cached;
    const countryIndex = countries.countries.findIndex(
      (country) => country.name === nation,
    );
    const sites: Array<{ lat: number; lon: number }> = [];
    if (countryIndex >= 0) {
      for (let cell = 0; cell < field.countryGrid.length; cell += 1) {
        if (field.countryGrid[cell] !== countryIndex || field.landMask[cell] !== 1) {
          continue;
        }
        const row = Math.floor(cell / field.width);
        const lat = 90 - (row + 0.5) * field.cellSize;
        if (lat < -60) continue;
        const col = cell - row * field.width;
        sites.push({ lat, lon: -180 + (col + 0.5) * field.cellSize });
      }
    }
    aiLandSites.set(nation, sites);
    return sites;
  };

  const chooseAIBuildingSite = (
    nation: string,
    type: BuildingType,
  ): { lat: number; lon: number } | null => {
    const country = countryByName.get(nation);
    if (!country) return null;
    const sites = landSitesFor(nation);
    if (sites.length === 0) return null;
    const countryBuildings = initialBuildings.filter(
      (building) => building.country === nation,
    );
    const constructionSites = ai?.getConstructionSites(nation) ?? [];
    const capitalLat = country.capitalLat ?? country.siteLat;
    const capitalLon = country.capitalLon ?? country.siteLon;
    const wantsCoast = type === 'dockyard';
    const wantsBorder =
      type === 'barracks' || type === 'interceptorPlatform';
    const wantsInterior = type === 'nuclearLaunchPlatform';
    const stride = Math.max(1, Math.floor(sites.length / 240));
    let best: { lat: number; lon: number } | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < sites.length; index += stride) {
      const site = sites[index]!;
      if (wantsCoast && !isOceanCoastline(field, lakeMask, site.lat, site.lon)) {
        continue;
      }
      if (
        [...countryBuildings, ...constructionSites].some(
          (building) =>
            greatCircleKm(site.lat, site.lon, building.lat, building.lon) < 30,
        )
      ) {
        continue;
      }
      const capitalDistance =
        capitalLat !== null && capitalLon !== null
          ? greatCircleKm(site.lat, site.lon, capitalLat, capitalLon)
          : 0;
      if (
        capitalLat !== null &&
        capitalLon !== null &&
        capitalDistance < 90
      ) {
        continue;
      }

      const borderDistance =
        wantsBorder || wantsInterior
          ? distanceToCountryBorderKm(country, site.lat, site.lon)
          : 0;
      const density = field.densityAt(site.lat, site.lon);
      let score = -capitalDistance * 0.05;
      if (wantsBorder) {
        score = -borderDistance * 0.8 + density * 0.2 - capitalDistance * 0.01;
      } else if (wantsInterior) {
        score = borderDistance * 1.2 - density * 0.5 - capitalDistance * 0.01;
      } else if (type === 'nuclearReactor' || type === 'researchCenter') {
        score = density * 0.6 - capitalDistance * 0.15;
      } else if (type === 'dockyard') {
        score = -capitalDistance * 0.03 + density * 0.05;
      }
      if (score > bestScore) {
        bestScore = score;
        best = site;
      }
    }
    return best;
  };

  const coastalCountryIds = new Set<number>();
  const rebuildCoastalCountries = (): void => {
    coastalCountryIds.clear();
    const { width, height, landMask } = field;
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const cell = row * width + col;
        if (landMask[cell] !== 1) continue;
        const countryId = field.countryGrid[cell];
        if (countryId === undefined || countryId < 0) continue;
        let touchesOcean = false;
        for (let dr = -1; dr <= 1 && !touchesOcean; dr += 1) {
          const sampleRow = row + dr;
          if (sampleRow < 0 || sampleRow >= height) continue;
          for (let dc = -1; dc <= 1; dc += 1) {
            const sampleCol = (col + dc + width) % width;
            const neighbor = sampleRow * width + sampleCol;
            if (landMask[neighbor] === 0 && lakeMask[neighbor] === 0) {
              touchesOcean = true;
              break;
            }
          }
        }
        if (touchesOcean) coastalCountryIds.add(countryId);
      }
    }
  };
  rebuildCoastalCountries();

  const isCoastalCountry = (nation: string): boolean => {
    const countryIndex = countries.countries.findIndex(
      (country) => country.name === nation,
    );
    return countryIndex >= 0 && coastalCountryIds.has(countryIndex);
  };

  const originalCountryState = new Map(
    countries.countries.map((country) => [
      country.name,
      { polygons: country.polygons, pop: country.pop },
    ]),
  );
  const originalCountryGrid = field.countryGrid.slice();
  const originalBuildingCountries = new Map(
    initialBuildings.map((building) => [building.id, building.country]),
  );
  const mergedCountryNames = new Set<string>();

  let playerNation: CountryData | null = null;
  let ai: AIController | null = null;
  const cheats = emptyCheatFlags();
  const resources = new ResourceLedger();
  const research = new ResearchState();
  const production = new ProductionSystem(
    resources,
    (techId) => research.isUnlocked(techId),
  );
  const construction = new ConstructionSystem(
    () => BASE_BUILD_DAYS * research.constructionTimeMultiplier(),
  );
  constructionDaysForNote = () => construction.durationDays;
  buildNote.textContent = noteFor(null);
  let nextBuiltBuildingId = 1;
  const diplomacy = new DiplomacySystem();
  const outliner = new Outliner(
    outlinerElement,
    production,
    construction,
    diplomacy,
    () => playerNation?.name ?? null,
  );
  const warfare = new WarfareSystem();
  warfare.setCountryCatalog(activeCountries());

  // A small national reserve lets a war function before a barracks network is
  // built. Barracks add the requested continuous manpower afterward.
  const seedStartingBalances = (): void => {
    for (const country of countries.countries) {
      resources.seedManpower(country.name, 15_000);
      resources.seedCoins(country.name, 1_000);
    }
  };
  seedStartingBalances();
  diplomacy.setStrengthProvider((nation) => resources.strengthScore(nation));

  const renderResources = (): void => {
    const balance = resources.forNation(playerNation?.name);
    coinsValue.textContent = formatResource(balance.coins);
    researchValue.textContent = formatResource(balance.research);
    manpowerValue.textContent = formatResource(balance.manpower);
    interceptorsValue.textContent = formatResource(balance.interceptors);
    nukesValue.textContent = formatResource(balance.nukes);
    icbmsValue.textContent = formatResource(balance.icbms);
  };

  setBoot(0.74, 'ASSEMBLING ORBITAL VIEW');
  await nextFrame();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(
    38,
    STAGE_WIDTH / STAGE_HEIGHT,
    0.02,
    2000,
  );
  // Face a point 40° east of the subsolar meridian: the opening view is
  // mostly daylit while the live terminator still crosses the disc.
  const initialSun = subsolarPoint(sim.date);
  camera.position
    .copy(geoToWorld(14, initialSun.lon + 40))
    .multiplyScalar(3.55);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  const EARTH_ROTATE_SPEED = 0.55;
  const EARTH_ROTATE_REFERENCE_DISTANCE = 3.55;
  controls.rotateSpeed = EARTH_ROTATE_SPEED;
  controls.zoomSpeed = 0.9;
  controls.autoRotateSpeed = 0.28;
  controls.enablePan = false;
  controls.minDistance = 1.22;
  controls.maxDistance = 12;
  controls.minPolarAngle = 0.06;
  controls.maxPolarAngle = Math.PI - 0.06;
  controls.target.set(0, 0, 0);
  controls.update();

  const cityLights = new CityLights(cities.cities);
  cityLights.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const cityLayer = new CityLayer(cityOverlay);
  cityLayer.setCities(cities.cities);

  const globe = new Globe(
    terrainCanvas,
    field.getHeatCanvas(),
    cityLights.canvas,
    borderCanvas,
    naturalCanvas,
    renderer.capabilities.getMaxAnisotropy(),
  );
  scene.add(globe.mesh);

  const borderLines = new BorderLines(countries, globe);
  scene.add(borderLines.mesh);

  const countryOutline = new CountryOutline();
  scene.add(countryOutline.mesh);

  const alliedOutline = new CountryOutline();
  alliedOutline.setColor(0x4bff8c, 0.95);
  scene.add(alliedOutline.mesh);

  const interceptorRanges = new InterceptorRanges();
  scene.add(interceptorRanges.group);

  const warOutline = new CountryOutline();
  warOutline.setColor(0xff2f2f, 1);
  scene.add(warOutline.mesh);

  const warFrontOverlay = new WarFrontOverlay(
    field,
    naturalField,
    countries.countries,
  );
  scene.add(warFrontOverlay.group);

  const warPreviewLayers: Record<
    'target' | 'enemy' | 'ally' | 'uninvolved',
    CountryOutline
  > = {
    target: new CountryOutline(),
    enemy: new CountryOutline(),
    ally: new CountryOutline(),
    uninvolved: new CountryOutline(),
  };
  warPreviewLayers.target.setColor(0xff2b2b, 1);
  warPreviewLayers.enemy.setColor(0xd14646, 1);
  warPreviewLayers.ally.setColor(0x39e07b, 1);
  warPreviewLayers.uninvolved.setColor(0x6b7280, 0.62);
  for (const layer of Object.values(warPreviewLayers)) {
    scene.add(layer.mesh);
    layer.mesh.renderOrder = 2;
  }

  let warPreviewOpen = false;
  let warPreviewRoles: ReadonlyMap<string, WarRole> | null = null;

  const atmosphere = new Atmosphere(1.024, PALETTE.atmosphere);
  scene.add(atmosphere.mesh);

  const starfield = new Starfield();
  scene.add(starfield.points);

  const sun = new Sun();
  scene.add(sun.group);

  const { gravity, moonBody } = createEarthMoonSystem();
  const moon = new Moon(moonBody.position);
  moon.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  moon.orbitTrack.visible = false;
  scene.add(moon.mesh);
  scene.add(moon.orbitTrack);

  field.onChange(() => {
    globe.refreshHeat(field.getHeatCanvas());
  });

  field.onStrike((strike) => {
    const extinguished = cityLights.blackout(
      strike.lat,
      strike.lon,
      strike.radiusKm,
    );
    if (extinguished > 0) globe.cityLightsTexture.needsUpdate = true;
    cityLayer.blackout(strike.lat, strike.lon, strike.radiusKm);
    populationCounter.showLoss(strike.killed, strike.remaining);
  });

  const sunDirection = new THREE.Vector3();
  const setLighting = (date: Date): void => {
    const position = subsolarPoint(date);
    geoToWorld(position.lat, position.lon, sunDirection);
    globe.setSunDirection(sunDirection);
    atmosphere.material.uniforms.uSunDirection.value.copy(sunDirection);
    sun.setDirection(sunDirection);
    moon.setSunDirection(sunDirection);
  };

  let currentMapMode: MapMode = 'terrain';
  let currentView: ViewMode = 'earth';
  let phase: GamePhase = 'menu';

  const syncGrabSensitivity = (): void => {
    if (currentView !== 'earth') {
      controls.rotateSpeed = 0.55;
      return;
    }
    const distance = camera.position.distanceTo(controls.target);
    const altitude = Math.max(0.04, distance - 1);
    const referenceAltitude = EARTH_ROTATE_REFERENCE_DISTANCE - 1;
    controls.rotateSpeed = THREE.MathUtils.clamp(
      (EARTH_ROTATE_SPEED * altitude) / referenceAltitude,
      0.04,
      2.5,
    );
  };
  controls.addEventListener('start', syncGrabSensitivity);
  controls.addEventListener('change', syncGrabSensitivity);

  const alliedNames = (): string[] => {
    const player = playerNation;
    if (!player) return [];
    const atWar = diplomacy.activeWars();
    return [...diplomacy.partnerSet(player.name, 'alliance')].filter(
      (name) => name !== player.name && !atWar.has(name) && countryByName.has(name),
    );
  };

  const syncWarOverlays = (): void => {
    const onEarth = currentView === 'earth';
    countryOutline.setVisible(onEarth && !warPreviewOpen);
    alliedOutline.setVisible(onEarth && !warPreviewOpen);
    warOutline.setVisible(onEarth && !warPreviewOpen);
    warFrontOverlay.setVisible(onEarth && !warPreviewOpen && phase === 'playing');
    cityLayer.setVisible(onEarth && !warPreviewOpen && phase !== 'menu');
    capitalLayer.setVisible(onEarth && !warPreviewOpen && phase !== 'menu');
    buildingLayer.setVisible(onEarth && !warPreviewOpen && phase === 'playing');
    for (const layer of Object.values(warPreviewLayers)) {
      layer.setVisible(onEarth && warPreviewOpen);
    }
  };

  const rebuildAlliedOutline = (): void => {
    const allies = alliedNames()
      .map((name) => countryByName.get(name))
      .filter((country): country is CountryData => Boolean(country));
    alliedOutline.setCountries(allies, mergedCountryNames);
    syncWarOverlays();
  };

  const rebuildWarOutline = (): void => {
    const atWar = diplomacy.activeWars();
    const warCountries = activeCountries().filter((country) => atWar.has(country.name));
    warOutline.setCountries(warCountries, mergedCountryNames);
    syncWarOverlays();
  };

  const applyWarPreview = (preview: WarPreview): void => {
    const byRole: Record<'target' | 'enemy' | 'ally' | 'uninvolved', CountryData[]> = {
      target: [],
      enemy: [],
      ally: [],
      uninvolved: [],
    };
    for (const country of activeCountries()) {
      const role = preview.roles.get(country.name) ?? 'uninvolved';
      byRole[role].push(country);
    }

    warPreviewOpen = true;
    warPreviewRoles = preview.roles;
    warPreviewLayers.target.setCountries(byRole.target, mergedCountryNames);
    warPreviewLayers.enemy.setCountries(byRole.enemy, mergedCountryNames);
    warPreviewLayers.ally.setCountries(byRole.ally, mergedCountryNames);
    warPreviewLayers.uninvolved.setCountries(byRole.uninvolved, mergedCountryNames);
    syncWarOverlays();
  };

  const clearWarPreview = (): void => {
    warPreviewOpen = false;
    warPreviewRoles = null;
    for (const layer of Object.values(warPreviewLayers)) layer.setVisible(false);
    syncWarOverlays();
    rebuildWarOutline();
  };

  const refreshLegend = (): void => {
    legend.hidden = currentView !== 'earth' || currentMapMode !== 'population';
    naturalLegend.hidden = currentView !== 'earth' || currentMapMode !== 'natural';
  };

  let applyNuclearPopulationMode = (_population: boolean): void => {};

  const setMode = (mode: MapMode): void => {
    currentMapMode = mode;
    globe.setMode(mode);
    applyNuclearPopulationMode(mode === 'population');
    refreshLegend();
    for (const button of modeButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
  };

  for (const button of modeButtons) {
    button.addEventListener('click', () => {
      const mode = button.dataset.mode;
      if (mode === 'terrain' || mode === 'population' || mode === 'natural') {
        setMode(mode);
      }
    });
  }

  const applySpeed = (speed: TimeSpeed): void => {
    sim.setSpeed(speed);
    for (const button of timeButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.speed === speed));
    }
  };

  for (const button of timeButtons) {
    button.addEventListener('click', () => {
      const speed = button.dataset.speed;
      if (
        speed === 'paused' ||
        speed === 'play' ||
        speed === 'fast' ||
        speed === 'quad'
      ) {
        applySpeed(speed);
      }
    });
  }
  applySpeed('paused');

  const viewStates = new Map<ViewMode, CameraState>();
  const lastMoonPosition = moon.position.clone();
  const worldUp = new THREE.Vector3(0, 1, 0);

  const setCameraRange = (view: ViewMode): void => {
    camera.near = view === 'system' ? 1 : 0.02;
    camera.far = 2000;
    camera.updateProjectionMatrix();
  };

  const setViewButtons = (view: ViewMode): void => {
    for (const button of viewButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    }
  };

  const setBorderLayer = (view: ViewMode): void => {
    const onEarth = view === 'earth';
    borderLines.mesh.visible = onEarth;
    buildingLayer.setVisible(onEarth && phase === 'playing');
    syncWarOverlays();
    syncInterceptorOverlay();
    globe.setBorderStrength(onEarth ? 0 : 1);
  };

  const setView = (view: ViewMode): void => {
    if (view === currentView) {
      setViewButtons(view);
      return;
    }

    const previous: CameraState = {
      position: camera.position.clone(),
      target: controls.target.clone(),
      anchor: null,
    };
    if (currentView === 'moon') previous.anchor = moon.position.clone();
    viewStates.set(currentView, previous);

    currentView = view;
    hideHoverTooltip();
    setViewButtons(view);
    setCameraRange(view);
    moon.orbitTrack.visible = view === 'system';
    setBorderLayer(view);

    const saved = viewStates.get(view);

    if (view === 'earth') {
      controls.minDistance = 1.22;
      controls.maxDistance = 12;

      if (saved) {
        camera.position.copy(saved.position);
        controls.target.copy(saved.target);
      } else {
        controls.target.set(0, 0, 0);
        const sunPosition = subsolarPoint(sim.date);
        camera.position
          .copy(geoToWorld(14, sunPosition.lon + 40))
          .multiplyScalar(3.55);
      }
    } else if (view === 'system') {
      controls.minDistance = 35;
      controls.maxDistance = 300;

      if (saved) {
        camera.position.copy(saved.position);
        controls.target.copy(saved.target);
      } else {
        // 200 Earth radii puts the whole 60-radii lunar orbit inside the
        // vertical field of view while keeping Earth at the screen center.
        controls.target.set(0, 0, 0);
        const moonDirection = moon.position.clone().normalize();
        const side = new THREE.Vector3().crossVectors(worldUp, moonDirection);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();
        if (side.dot(sunDirection) < 0) side.negate();

        const viewDirection = side
          .multiplyScalar(0.95)
          .addScaledVector(sunDirection, 0.5)
          .addScaledVector(worldUp, 0.3)
          .normalize();

        camera.position.copy(controls.target).addScaledVector(viewDirection, 200);
      }
    } else {
      controls.minDistance = 0.45;
      controls.maxDistance = 30;
      const moonPosition = moon.position;

      if (saved) {
        const anchor = saved.anchor ?? moonPosition;
        camera.position.copy(saved.position).add(moonPosition.clone().sub(anchor));
        controls.target.copy(moonPosition);
      } else {
        const moonDirection = moonPosition.clone().normalize();
        const side = new THREE.Vector3().crossVectors(worldUp, moonDirection);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();

        const viewDirection = sunDirection
          .clone()
          .multiplyScalar(0.8)
          .addScaledVector(side, 0.45)
          .addScaledVector(worldUp, 0.28)
          .normalize();

        controls.target.copy(moonPosition);
        camera.position.copy(moonPosition).addScaledVector(viewDirection, 1.35);
      }

      lastMoonPosition.copy(moonPosition);
    }

    refreshLegend();
    syncGrabSensitivity();
    controls.update();
  };

  for (const button of viewButtons) {
    button.addEventListener('click', () => {
      const view = button.dataset.view;
      if (view === 'earth' || view === 'system' || view === 'moon') {
        setView(view);
      }
    });
  }
  setViewButtons('earth');
  setCameraRange('earth');
  setBorderLayer('earth');

  let selectedCountry: CountryData | null = null;
  const selectCountry = (country: CountryData | null): void => {
    selectedCountry = country;
    clockPanel.setCountry(country);
    clockPanel.render(sim.date);
  };

  const nationPopulationFormatter = new Intl.NumberFormat('en-US');
  const updateNationPopulation = (): void => {
    const country = playerNation ?? selectedCountry;
    if (!country) {
      nationPopulation.hidden = true;
      return;
    }
    const index = countryIndexByName.get(country.name);
    const population = index === undefined ? 0 : field.populationForCountry(index);
    nationPopulation.hidden = false;
    nationPopulationLabel.textContent = `${country.name.toUpperCase()} POPULATION`;
    nationPopulationValue.textContent = nationPopulationFormatter.format(
      Math.max(0, Math.round(population)),
    );
  };

  let pendingNation: CountryData | null = null;

  const setPhase = (next: GamePhase): void => {
    phase = next;
    document.body.dataset.phase = next;
    controls.autoRotate = next === 'menu';
    hideHoverTooltip();
    setBorderLayer(currentView);
  };

  const resetNationChoice = (): void => {
    pendingNation = null;
    countryOutline.setCountry(null);
    playNationButton.disabled = true;
    playNationButton.textContent = 'PLAY';
  };

  const chooseNation = (country: CountryData): void => {
    pendingNation = country;
    countryOutline.setCountry(country);
    playNationButton.disabled = false;
    playNationButton.textContent = `PLAY (${country.name.toUpperCase()})`;
    selectCountry(country);
  };

  const showNationSelect = (): void => {
    playerNation = null;
    stopNuclearTargeting();
    nukeUi.closeMenu();
    nukeUi.setVisible(false);
    godmodeUi.close();
    resetNationChoice();
    selectCountry(null);
    startMenu.hidden = true;
    nationSelect.hidden = false;
    menuNote.textContent = '';
    setPhase('nation-select');
    applySpeed('paused');
  };

  const showStartMenu = (): void => {
    playerNation = null;
    diplomacyUi.closeActiveWarScreen();
    stopNuclearTargeting();
    nukeUi.closeMenu();
    nukeUi.setVisible(false);
    godmodeUi.close();
    nuclear.reset();
    ai?.reset();
    resetAnnexations();
    Object.assign(cheats, emptyCheatFlags());
    godmodeUi.setFlags(cheats);
    resources.reset();
    seedStartingBalances();
    diplomacy.reset();
    warfare.reset(null);
    construction.reset();
    buildingLayer.clearConstructionSites();
    alliedOutline.setCountries([]);
    warOutline.setCountries([]);
    warFrontOverlay.setFronts([], null, []);
    resetNationChoice();
    selectCountry(null);
    startMenu.hidden = false;
    nationSelect.hidden = true;
    setPhase('menu');
    applySpeed('paused');
    refreshSightVisibility();
  };

  const updateInterceptorLabel = (): void => {
    const rangeKm = Math.round(interceptorRanges.rangeKm());
    interceptorCursor.textContent = `GBI RANGE · ${rangeKm.toLocaleString('en-US')} KM`;
  };

  const applyResearchEffects = (): void => {
    interceptorRanges.setRangeFraction(research.gbiFraction());
    updateInterceptorLabel();
    buildNote.textContent = noteFor(buildType);
  };

  const refreshSightVisibility = (): void => {
    if (phase === 'playing' && playerNation) {
      const visible = new Set<string>();
      const sources = [
        playerNation,
        ...alliedNames()
          .map((name) => countryByName.get(name))
          .filter((country): country is CountryData => Boolean(country)),
      ];
      for (const country of sources) {
        for (const id of createSightVisibility(country, initialBuildings, SIGHT_RADIUS_KM)) {
          visible.add(id);
        }
      }
      buildingLayer.setVisibleBuildings(visible);
    } else {
      buildingLayer.setVisibleBuildings(null);
    }
  };

  const destroyBuildingsInBlast = (
    lat: number,
    lon: number,
    radiusKm: number,
  ): number => {
    let destroyed = 0;
    for (let index = initialBuildings.length - 1; index >= 0; index -= 1) {
      const building = initialBuildings[index]!;
      if (greatCircleKm(lat, lon, building.lat, building.lon) > radiusKm) {
        continue;
      }
      initialBuildings.splice(index, 1);
      buildingLayer.removeBuilding(building.id);
      destroyed += 1;
    }

    for (const building of construction.removeWithin(lat, lon, radiusKm)) {
      buildingLayer.removeConstructionSite(building.id);
      destroyed += 1;
    }

    for (const building of ai?.removeConstructionWithin(lat, lon, radiusKm) ?? []) {
      buildingLayer.removeConstructionSite(building.id);
      destroyed += 1;
    }

    if (destroyed > 0) {
      refreshSightVisibility();
      syncInterceptorOverlay();
      outliner.update();
    }
    return destroyed;
  };

  let contextNation: CountryData | null = null;
  let contextX = 0;
  let contextY = 0;
  let pendingWarTarget: CountryData | null = null;

  const activeRelationAction = (): RelationActionStatus | null => {
    if (!contextNation || !playerNation) return null;
    return diplomacy.relationAction(playerNation.name, contextNation.name);
  };

  const showNationContext = (country: CountryData, x: number, y: number): void => {
    contextNation = country;
    contextX = x;
    contextY = y;
    const playerName = playerNation?.name;
    diplomacyUi.showContext(country.name, x, y, {
      ...diplomacy.stats(country.name),
      hasPact: Boolean(playerName && diplomacy.hasPact(playerName, country.name)),
      hasAlliance: Boolean(
        playerName && diplomacy.hasAlliance(playerName, country.name),
      ),
      atWar: diplomacy.atWar(country.name),
      isSelf: Boolean(playerName && playerName === country.name),
      relationAction: activeRelationAction(),
    });
  };

  const toggleRelationAction = (direction: RelationDirection): void => {
    if (!contextNation || !playerNation) return;
    const target = contextNation;
    const current = diplomacy.relationAction(playerNation.name, target.name);
    if (current?.direction === direction) {
      diplomacy.cancelRelationAction(playerNation.name, target.name);
      showNationContext(target, contextX, contextY);
      diplomacyUi.setContextStatus(
        direction === 'improve'
          ? 'IMPROVE RELATIONS CANCELLED'
          : 'HARM RELATIONS CANCELLED',
      );
      return;
    }

    diplomacy.startRelationAction(playerNation.name, target.name, direction);
    showNationContext(target, contextX, contextY);
    diplomacyUi.setContextStatus(
      direction === 'improve'
        ? `IMPROVING RELATIONS · +${RELATION_ACTION_STEP}/DAY · MAX ${MAX_RELATION_ACTIONS} DAYS`
        : `HARMING RELATIONS · -${RELATION_ACTION_STEP}/DAY · MAX ${MAX_RELATION_ACTIONS} DAYS`,
    );
  };

  const proposeTreaty = (type: TreatyType): void => {
    if (!contextNation) return;
    const result = diplomacy.propose(contextNation.name, type);
    showNationContext(contextNation, contextX, contextY);
    diplomacyUi.setContextStatus(result.message);
    if (result.ok) {
      rebuildAlliedOutline();
      refreshSightVisibility();
      diplomacyUi.toast(result.message);
    }
  };

  const closeWarDeclaration = (): void => {
    pendingWarTarget = null;
    diplomacyUi.closeWarScreen();
    clearWarPreview();
  };

  const openWarDeclaration = (target: CountryData): void => {
    if (!playerNation || diplomacy.atWar(target.name)) return;
    pendingWarTarget = target;
    diplomacyUi.closeActiveWarScreen();
    const preview = diplomacy.warPreview(target.name, activeCountries());
    diplomacyUi.hideContext();
    diplomacyUi.openWarScreen(
      target.name,
      preview.enemySide,
      preview.playerSide,
      preview.uninvolvedCount,
      playerNation.name,
    );
    applyWarPreview(preview);
  };

  const renderWarStatus = (): void => {
    diplomacyUi.renderWarFronts(
      warfare.getFronts(),
      warfare.deploymentCap(research),
      resources.forNation(playerNation?.name).landingShips,
    );
  };

  const launchNavalInvasion = (enemy: string): void => {
    if (!playerNation) return;
    const result = warfare.launchNavalInvasion(enemy, resources, playerNation.name);
    if (result.ok) {
      warFrontOverlay.setFronts(warfare.getFronts(), playerNation.name, alliedNames());
      renderWarStatus();
      renderResources();
    }
    diplomacyUi.toast(result.message);
  };

  const confirmWarDeclaration = (): void => {
    if (!playerNation || !pendingWarTarget) return;
    const target = pendingWarTarget;
    const wars = diplomacy.declareWar(target.name, activeCountries());
    warfare.sync(playerNation.name, wars);
    pendingWarTarget = null;
    diplomacyUi.closeWarScreen();
    clearWarPreview();
    rebuildAlliedOutline();
    refreshSightVisibility();
    warFrontOverlay.setFronts(warfare.getFronts(), playerNation.name, alliedNames());
    renderWarStatus();
    diplomacyUi.toast(
      `WAR DECLARED ON ${target.name.toUpperCase()} · ${wars.size} NATION${wars.size === 1 ? '' : 'S'} ENGAGED`,
    );
  };

  const diplomacyUi = new DiplomacyUi(
    {
      nationMenu,
      nationMenuTitle,
      nationMenuStatus,
      improveOpinion: improveOpinionButton,
      harmRelations: harmRelationsButton,
      nationOpinion,
      nationPower,
      nationAcceptance,
      proposePact,
      proposeAlliance,
      declareWar,
      warWindow,
      warClose,
      warCancel,
      warConfirm,
      warTargetName,
      warEnemyList,
      warPlayerList,
      warUninvolved,
      activeWarButton,
      activeWarCount,
      activeWarWindow,
      activeWarClose,
      activeWarTabs,
      activeWarPanels,
      activeWarNote,
      toast: gameToast,
    },
    {
      onPropose: proposeTreaty,
      onImproveOpinion: () => toggleRelationAction('improve'),
      onHarmRelations: () => toggleRelationAction('harm'),
      onDeclare: () => {
        if (contextNation) openWarDeclaration(contextNation);
      },
      onConfirmWar: confirmWarDeclaration,
      onCancelWar: closeWarDeclaration,
      onNavalInvasion: launchNavalInvasion,
    },
  );

  const productionPanel = new ProductionPanel(
    {
      window: productionWindow,
      close: productionClose,
      tabs: productionTabs,
      factoryLine: productionFactoryLine,
      items: productionItems,
      queue: productionQueue,
      inventory: productionInventory,
      message: productionMessage,
    },
    production,
    research,
    () => resources.forNation(playerNation?.name),
  );

  let armedWarhead: ProductionItem | null = null;
  let pendingPlan: NukePlan | null = null;
  let nukeUi: NuclearUi;
  let nuclear: NuclearSystem;

  const stopNuclearTargeting = (): void => {
    armedWarhead = null;
    pendingPlan = null;
    nukeUi.setTargeting(null);
  };

  const refreshNukePlans = (): void => {
    const counts = new Map<string, number>();
    const queued = new Map<string, number>();
    for (const plan of NUKE_PLANS) {
      counts.set(plan.id, nuclear.targetCountForPlan(plan.id));
      queued.set(plan.id, nuclear.queuedCountForPlan(plan.id));
    }
    nukeUi.setPlanCounts(counts, queued);
  };

  nukeUi = new NuclearUi(
    {
      controls: nukeControls,
      files: nukeFiles,
      menu: nukeMenu,
      menuList: nukeMenuList,
      menuStatus: nukeMenuStatus,
      platformStatus: nukePlatformStatus,
    },
    {
      onAddTarget: (plan) => {
        if (pendingPlan?.id === plan.id && (armedWarhead || nukeUi.menuOpen)) {
          stopNuclearTargeting();
          nukeUi.closeMenu();
          return;
        }
        stopNuclearTargeting();
        if (nukeUi.menuOpen) {
          nukeUi.closeMenu();
        }
        if (!playerNation) {
          diplomacyUi.toast('SELECT A NATION FIRST');
          return;
        }
        pendingPlan = plan;
        nukeUi.openMenu(nuclear.availableWarheads());
      },
      onRemoveTarget: (plan) => {
        stopNuclearTargeting();
        nukeUi.closeMenu();
        diplomacyUi.toast(nuclear.removeLastTarget(plan.id).message);
        refreshNukePlans();
      },
      onDetonate: (plan) => {
        stopNuclearTargeting();
        nukeUi.closeMenu();
        const result = nuclear.detonate(plan.id);
        diplomacyUi.toast(result.message);
        renderResources();
        refreshNukePlans();
      },
      onCancelQueued: (plan) => {
        stopNuclearTargeting();
        nukeUi.closeMenu();
        const result = nuclear.cancelQueued(plan.id);
        diplomacyUi.toast(result.message);
        renderResources();
        refreshNukePlans();
      },
      onSelectWarhead: (stock) => {
        if (!pendingPlan) return;
        armedWarhead = stock.item;
        nukeUi.setTargeting(pendingPlan.id);
        diplomacyUi.toast(
          `${pendingPlan.label} PLAN · ${stock.item.name.toUpperCase()} ARMED · CLICK TARGET ON THE GLOBE`,
        );
      },
    },
  );

  nuclear = new NuclearSystem({
    scene,
    camera,
    field,
    production,
    resources,
    getBuildings: () => initialBuildings,
    getPlayerNation: () => playerNation?.name ?? null,
    getProductionForNation: (nation) => ai?.getProduction(nation) ?? null,
    countryAt: (lat, lon) => atlas.find(lat, lon)?.country.name ?? null,
    isAtWar: (a, b) => diplomacy.isAtWar(a, b),
    isLand: (lat, lon) => isLandAt(field, lat, lon),
    destroyBuildings: destroyBuildingsInBlast,
    flashOverlay: nuclearFlash,
    toast: (message) => diplomacyUi.toast(message),
    onTargetsChanged: refreshNukePlans,
    getClockMs: () => sim.timestamp,
    getLaunchCooldownMs: (owner) =>
      (owner && owner !== playerNation?.name
        ? ai?.getResearch(owner)?.launchCooldownHours() ?? 4
        : research.launchCooldownHours()) * 3_600_000,
  });
  refreshNukePlans();
  applyNuclearPopulationMode = (population: boolean): void => {
    nuclear.setPopulationMode(population);
  };
  applyNuclearPopulationMode(false);

  const formatCooldown = (milliseconds: number): string => {
    const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0
      ? `${hours}H ${String(minutes).padStart(2, '0')}M`
      : `${minutes}M`;
  };

  const refreshLaunchStatus = (): void => {
    const owner = playerNation?.name ?? null;
    const status = nuclear.launchStatus(owner);
    if (status.total === 0) {
      nukeUi.setPlatformStatus('NO LAUNCH PLATFORM');
      return;
    }
    if (status.ready === status.total) {
      nukeUi.setPlatformStatus(
        `LAUNCH PLATFORMS\n${status.ready}/${status.total} READY`,
      );
      return;
    }
    const prefix =
      status.ready > 0 ? `${status.ready}/${status.total} READY` : 'PLATFORM COOLDOWN';
    nukeUi.setPlatformStatus(
      `${prefix}\nNEXT ${formatCooldown(status.nextReadyInMs)}`,
      true,
    );
  };

  const researchPanel = new ResearchPanel(
    {
      window: researchWindow,
      close: researchClose,
      summary: researchSummary,
      branches: researchBranches,
      points: researchPoints,
      message: researchMessage,
    },
    research,
    () => resources.forNation(playerNation?.name).research,
    (id, cost) => {
      if (!playerNation) return { ok: false, message: 'NO NATION SELECTED' };
      if (!research.isAvailable(id)) {
        return { ok: false, message: 'PREREQUISITE NOT MET' };
      }
      if (!resources.spendResearch(playerNation.name, cost)) {
        return { ok: false, message: 'INSUFFICIENT RESEARCH' };
      }
      research.unlock(id);
      applyResearchEffects();
      renderResources();
      productionPanel.render();
      return { ok: true, message: 'RESEARCH COMPLETE' };
    },
  );

  const applyCheats = (): void => {
    const player = playerNation?.name;
    if (!player) return;
    if (cheats.unlimitedMoney) {
      resources.seedCoins(player, CHEAT_RESOURCE_AMOUNT);
    }
    if (cheats.unlimitedResearch) {
      resources.seedResearch(player, CHEAT_RESOURCE_AMOUNT);
    }
    if (cheats.unlimitedManpower) {
      resources.seedManpower(player, CHEAT_RESOURCE_AMOUNT);
    }
    if (cheats.infiniteInterceptors) {
      resources.seedCounter(player, 'interceptors', CHEAT_NUKE_STOCK);
    }
    if (cheats.unlimitedNukes) {
      for (const item of nuclearItems()) {
        const stock = production.itemCount(item.id);
        if (stock < CHEAT_NUKE_STOCK) {
          production.refundItem(item.id, CHEAT_NUKE_STOCK - stock);
        }
      }
      resources.seedCounter(player, 'nukes', CHEAT_NUKE_STOCK);
      resources.seedCounter(player, 'icbms', CHEAT_NUKE_STOCK);
    }
  };

  const godmodeUi = new GodmodeUi(
    { toggle: godmodeToggle, window: godmodeWindow, close: godmodeClose },
    (key, enabled) => {
      cheats[key] = enabled;
      applyCheats();
      renderResources();
      if (productionPanel.isOpen) productionPanel.update();
      if (researchPanel.isOpen) researchPanel.update();
    },
  );
  godmodeUi.setFlags(cheats);
  godmodeToggle.addEventListener('click', () => {
    if (!godmodeUi.isOpen) return;
    productionPanel.close();
    researchPanel.close();
    diplomacyUi.hideContext();
    applyCheats();
    renderResources();
  });

  const refreshCountryVisuals = (): void => {
    const active = activeCountries();
    atlas = new CountryAtlas({ countries: active });
    countryByName.clear();
    for (const country of active) countryByName.set(country.name, country);

    const nextBorderCanvas = createBorderCanvas(
      { countries: active },
      mergedCountryNames,
    );
    const borderContext = borderCanvas.getContext('2d');
    if (!borderContext) throw new Error('2D canvas context is unavailable.');
    borderContext.clearRect(0, 0, borderCanvas.width, borderCanvas.height);
    borderContext.drawImage(nextBorderCanvas, 0, 0);
    globe.borderTexture.needsUpdate = true;

    borderLines.setCountries(active, mergedCountryNames);
    capitalLayer.setCountries(active);
    warfare.setCountryCatalog(active);
  };

  const annexCountry = (victorName: string, defeatedName: string): boolean => {
    const player = playerNation?.name ?? null;
    const victor = countryByName.get(victorName);
    const defeated = countryByName.get(defeatedName);
    if (!victor || !defeated || victor === defeated) return false;

    const victorIndex = countries.countries.indexOf(victor);
    const defeatedIndex = countries.countries.indexOf(defeated);
    if (victorIndex < 0 || defeatedIndex < 0) return false;

    victor.polygons = [...victor.polygons, ...defeated.polygons];
    victor.pop =
      field.populationForCountry(victorIndex) +
      field.populationForCountry(defeatedIndex);
    defeated.polygons = [];
    defeated.pop = 0;
    mergedCountryNames.add(victor.name);
    field.mergeCountry(defeatedIndex, victorIndex);
    for (const building of initialBuildings) {
      if (building.country === defeatedName) building.country = victorName;
    }
    resources.absorb(defeatedName, victorName);
    diplomacy.removeNation(defeatedName);
    ai?.removeNation(defeatedName);
    aiLandSites.delete(victorName);
    aiLandSites.delete(defeatedName);
    if (coastalCountryIds.delete(defeatedIndex)) {
      coastalCountryIds.add(victorIndex);
    }

    if (contextNation?.name === defeatedName) {
      contextNation = null;
      diplomacyUi.hideContext();
    }
    if (pendingWarTarget?.name === defeatedName) {
      pendingWarTarget = null;
      diplomacyUi.closeWarScreen();
    }

    invalidateSightCaches();
    refreshCountryVisuals();
    if (player) warfare.sync(player, diplomacy.activeWars());
    else warfare.reset(null);
    warFrontOverlay.invalidate();
    warFrontOverlay.setFronts(
      warfare.getFronts(),
      player,
      alliedNames(),
    );

    if (selectedCountry?.name === defeatedName) selectCountry(null);
    if (playerNation) countryOutline.setCountry(playerNation, mergedCountryNames);
    rebuildAlliedOutline();
    rebuildWarOutline();
    refreshSightVisibility();
    renderResources();
    if (productionPanel.isOpen) productionPanel.update();
    renderWarStatus();
    diplomacyUi.toast(
      `${defeatedName.toUpperCase()} SURRENDERED · ANNEXED BY ${victorName.toUpperCase()}`,
    );
    return true;
  };

  const processSurrenders = (): void => {
    if (!playerNation) return;
    const surrendering = warfare
      .getFronts()
      .filter((front) => front.surrendered && diplomacy.atWar(front.enemy))
      .map((front) => front.enemy);
    for (const enemy of surrendering) {
      if (playerNation && diplomacy.atWar(enemy)) {
        annexCountry(playerNation.name, enemy);
      }
    }
  };

  const resetAnnexations = (): void => {
    aiLandSites.clear();
    if (mergedCountryNames.size === 0) return;

    for (const country of countries.countries) {
      const original = originalCountryState.get(country.name);
      if (!original) continue;
      country.polygons = original.polygons;
      country.pop = original.pop;
    }
    field.countryGrid.set(originalCountryGrid);
    field.reindexCountries();
    rebuildCoastalCountries();
    for (const building of initialBuildings) {
      const original = originalBuildingCountries.get(building.id);
      if (original) building.country = original;
    }
    mergedCountryNames.clear();
    invalidateSightCaches();
    refreshCountryVisuals();
    warFrontOverlay.invalidate();
    if (selectedCountry) selectCountry(null);
    countryOutline.setCountry(null);
    contextNation = null;
    diplomacyUi.hideContext();
  };

  researchOpen.addEventListener('click', () => {
    diplomacyUi.hideContext();
    productionPanel.close();
    godmodeUi.close();
    researchPanel.open();
  });

  productionOpen.addEventListener('click', () => {
    diplomacyUi.hideContext();
    researchPanel.close();
    godmodeUi.close();
    productionPanel.open();
  });

  activeWarButton.addEventListener('click', () => {
    diplomacyUi.hideContext();
    productionPanel.close();
    researchPanel.close();
    godmodeUi.close();
    diplomacyUi.openActiveWarScreen();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (armedWarhead || nukeUi.menuOpen) {
      stopNuclearTargeting();
      nukeUi.closeMenu();
      return;
    }
    if (diplomacyUi.warScreenOpen) {
      closeWarDeclaration();
      return;
    }
    if (diplomacyUi.activeWarScreenOpen) {
      diplomacyUi.closeActiveWarScreen();
      return;
    }
    if (godmodeUi.isOpen) {
      godmodeUi.close();
      return;
    }
    if (productionPanel.isOpen) productionPanel.close();
    if (researchPanel.isOpen) researchPanel.close();
    diplomacyUi.hideContext();
  });

  const beginSingleplayer = (): void => {
    if (!pendingNation) return;
    playerNation = pendingNation;
    stopNuclearTargeting();
    nukeUi.closeMenu();
    nukeUi.setVisible(true);
    refreshNukePlans();
    godmodeUi.close();
    applyCheats();
    diplomacy.setPlayer(playerNation.name);
    ai?.reset();
    warfare.reset(playerNation.name);
    startMenu.hidden = true;
    nationSelect.hidden = true;
    setPhase('playing');
    renderResources();
    updateNationPopulation();
    refreshSightVisibility();
    rebuildAlliedOutline();
    updateInterceptorLabel();
    warFrontOverlay.setFronts(warfare.getFronts(), playerNation.name, alliedNames());
    renderWarStatus();
    productionPanel.close();
    researchPanel.close();
    diplomacyUi.hideContext();
    applySpeed('play');
    outliner.update();
  };

  for (const button of menuButtons) {
    button.addEventListener('click', () => {
      const action = button.dataset.menuAction;
      if (action === 'singleplayer') {
        showNationSelect();
        return;
      }
      if (action === 'multiplayer' || action === 'settings' || action === 'credits') {
        menuNote.textContent = `${action.toUpperCase()} IS NOT AVAILABLE YET.`;
      }
    });
  }
  nationBackButton.addEventListener('click', showStartMenu);
  playNationButton.addEventListener('click', beginSingleplayer);

  const clearInterceptorPreview = (): void => {
    interceptorRanges.clearPreview();
    interceptorCursor.hidden = true;
  };

  syncInterceptorOverlay = (): void => {
    const active =
      phase === 'playing' &&
      currentView === 'earth' &&
      buildType === 'interceptorPlatform';
    const owner = playerNation?.name;
    interceptorRanges.setActive(active);
    if (active && owner) {
      interceptorRanges.setInterceptors(
        initialBuildings.filter((building) => building.country === owner),
      );
    } else {
      clearInterceptorPreview();
    }
  };

  onBuildTypeChange = (): void => {
    clearInterceptorPreview();
    syncInterceptorOverlay();
  };

  const finishConstruction = (buildings: Building[]): void => {
    if (buildings.length === 0) return;
    for (const building of buildings) {
      buildingLayer.removeConstructionSite(building.id);
      initialBuildings.push(building);
      buildingLayer.addBuilding(building);
      originalBuildingCountries.set(building.id, building.country);
    }
    refreshSightVisibility();
    syncInterceptorOverlay();
    outliner.update();
  };

  const handleAIWarDeclaration = (attacker: string, defender: string): void => {
    if (!playerNation) return;
    const playerInvolved =
      attacker === playerNation.name ||
      defender === playerNation.name ||
      diplomacy.atWar(attacker) ||
      diplomacy.atWar(defender);
    if (!playerInvolved) return;

    warfare.sync(playerNation.name, diplomacy.activeWars());
    rebuildAlliedOutline();
    rebuildWarOutline();
    refreshSightVisibility();
    warFrontOverlay.invalidate();
    warFrontOverlay.setFronts(
      warfare.getFronts(),
      playerNation.name,
      alliedNames(),
    );
    renderWarStatus();
    diplomacyUi.toast(
      `${attacker.toUpperCase()} DECLARED WAR ON ${defender.toUpperCase()}`,
    );
  };

  ai = new AIController({
    countries: activeCountries,
    resources,
    diplomacy,
    getBuildings: () => initialBuildings,
    getPlayerNation: () => playerNation?.name ?? null,
    getSimTime: () => sim.timestamp,
    isCoastalCountry,
    chooseBuildingSite: chooseAIBuildingSite,
    onConstructionStarted: (building) => buildingLayer.addConstructionSite(building),
    onConstructionCancelled: (building) =>
      buildingLayer.removeConstructionSite(building.id),
    onBuildingCompleted: (building) => finishConstruction([building]),
    onAnnex: annexCountry,
    onWarDeclared: handleAIWarDeclaration,
    launchNuke: (owner, itemId, lat, lon) =>
      nuclear.launchForNation(owner, itemId, lat, lon),
  });

  setPhase('menu');
  startMenu.hidden = false;
  nationSelect.hidden = true;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let press: { id: number; x: number; y: number; time: number } | null = null;

  canvas.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.button === 0) diplomacyUi.hideContext();
    if (!event.isPrimary || event.button !== 0) return;
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
  });

  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Node | null;
    if (target && !nationMenu.contains(target)) diplomacyUi.hideContext();
  });

  canvas.addEventListener('contextmenu', (event: MouseEvent) => {
    event.preventDefault();
    if (armedWarhead || nukeUi.menuOpen) {
      stopNuclearTargeting();
      nukeUi.closeMenu();
      diplomacyUi.hideContext();
      return;
    }
    if (
      phase !== 'playing' ||
      currentView !== 'earth' ||
      warPreviewOpen ||
      productionPanel.isOpen ||
      researchPanel.isOpen
    ) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(globe.mesh, false)[0];
    if (!hit) {
      diplomacyUi.hideContext();
      return;
    }

    const lat = THREE.MathUtils.radToDeg(
      Math.asin(THREE.MathUtils.clamp(hit.point.y, -1, 1)),
    );
    const lon = THREE.MathUtils.radToDeg(Math.atan2(-hit.point.z, hit.point.x));
    const match = atlas.find(lat, lon);
    if (!match) {
      diplomacyUi.hideContext();
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    if (stageRect.width === 0 || stageRect.height === 0) return;
    const x = ((event.clientX - stageRect.left) / stageRect.width) * STAGE_WIDTH;
    const y = ((event.clientY - stageRect.top) / stageRect.height) * STAGE_HEIGHT;
    showNationContext(match.country, x, y);
  });

  canvas.addEventListener('pointercancel', () => {
    press = null;
  });

  let hoveredCountry: CountryData | null = null;

  canvas.addEventListener('pointerleave', () => {
    hoveredCountry = null;
    hideHoverTooltip();
    clearInterceptorPreview();
  });

  canvas.addEventListener('pointermove', (event: PointerEvent) => {
    if (phase === 'menu' || currentView !== 'earth') {
      hoveredCountry = null;
      hideHoverTooltip();
      clearInterceptorPreview();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);

    const hit = raycaster.intersectObject(globe.mesh, false)[0];
    if (!hit) {
      hoveredCountry = null;
      hideHoverTooltip();
      clearInterceptorPreview();
      return;
    }

    const lat = THREE.MathUtils.radToDeg(
      Math.asin(THREE.MathUtils.clamp(hit.point.y, -1, 1)),
    );
    const lon = THREE.MathUtils.radToDeg(Math.atan2(-hit.point.z, hit.point.x));

    hoveredCountry = atlas.find(lat, lon)?.country ?? null;

    if (hoveredCountry) {
      const role = warPreviewOpen ? warPreviewRoles?.get(hoveredCountry.name) : null;
      const roleLabel =
        hoveredCountry.name === playerNation?.name
          ? 'YOUR NATION'
          : role === 'target'
            ? 'TARGET'
            : role === 'enemy'
              ? 'DEFENDER ALLY'
              : role === 'ally'
                ? 'YOUR ALLY'
                : role === 'uninvolved'
                  ? 'UNINVOLVED'
                  : null;
      showHoverTooltip(
        roleLabel
          ? `${hoveredCountry.name.toUpperCase()} · ${roleLabel}`
          : hoveredCountry.name.toUpperCase(),
        event.clientX,
        event.clientY,
        'country',
      );
    } else {
      hideHoverTooltip();
    }

    if (phase === 'playing' && buildType === 'interceptorPlatform') {
      interceptorRanges.setPreview(lat, lon);

      const stageRect = stage.getBoundingClientRect();
      if (stageRect.width === 0 || stageRect.height === 0) return;
      const x = ((event.clientX - stageRect.left) / stageRect.width) * STAGE_WIDTH;
      const y = ((event.clientY - stageRect.top) / stageRect.height) * STAGE_HEIGHT;
      interceptorCursor.style.left = `${Math.min(STAGE_WIDTH - 210, x + 18)}px`;
      interceptorCursor.style.top = `${Math.min(
        STAGE_HEIGHT - 44,
        y + (hoveredCountry ? 52 : 18),
      )}px`;
      interceptorCursor.hidden = false;
    } else {
      clearInterceptorPreview();
    }
  });

  canvas.addEventListener('pointerup', (event: PointerEvent) => {
    const start = press;
    press = null;
    if (!start || !event.isPrimary || event.pointerId !== start.id || event.button !== 0) {
      return;
    }

    const travel = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    const maxTravel = event.pointerType === 'touch' ? 12 : 6;
    if (travel > maxTravel || performance.now() - start.time > 800) return;
    if (phase === 'menu') return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);

    const hit = raycaster.intersectObject(globe.mesh, false)[0];
    if (!hit) return;

    const lat = THREE.MathUtils.radToDeg(
      Math.asin(THREE.MathUtils.clamp(hit.point.y, -1, 1)),
    );
    const lon = THREE.MathUtils.radToDeg(Math.atan2(-hit.point.z, hit.point.x));
    const match = atlas.find(lat, lon);
    if (phase === 'nation-select') {
      if (match) chooseNation(match.country);
      return;
    }
    if (armedWarhead && pendingPlan && phase === 'playing') {
      const item = armedWarhead;
      const result = nuclear.addTarget(
        item.id,
        lat,
        lon,
        pendingPlan.id,
        pendingPlan.colorHex,
      );
      diplomacyUi.toast(result.message);
      if (result.ok) {
        const remaining =
          nuclear.availableWarheads().find((stock) => stock.item.id === item.id)
            ?.count ?? 0;
        if (remaining <= 0) stopNuclearTargeting();
      }
      return;
    }
    if (buildType) {
      if (!playerNation || match?.country !== playerNation) {
        flashBuildNote('OUTSIDE YOUR BORDERS');
        return;
      }

      if (capitalLayer.blocksBuilding(lat, lon)) {
        flashBuildNote('CAPITAL SITE');
        return;
      }

      const valid =
        buildType === 'dockyard'
          ? isOceanCoastline(field, lakeMask, lat, lon)
          : isLandAt(field, lat, lon);
      if (!valid) {
        flashBuildNote(
          buildType === 'dockyard'
            ? 'DOCKYARD · COASTAL LAND REQUIRED'
            : 'LAND REQUIRED',
        );
        return;
      }

      if (buildingLayer.hasIconOverlap(lat, lon, camera)) {
        flashBuildNote('TOO CLOSE TO ANOTHER BUILDING');
        return;
      }

      if (!resources.spendCoins(playerNation.name, BUILDING_COST_COINS)) {
        flashBuildNote(`INSUFFICIENT COINS · ${BUILDING_COST_COINS} REQUIRED`);
        return;
      }

      const building: Building = {
        id: `built-${nextBuiltBuildingId}`,
        type: buildType,
        lat,
        lon,
        country: match?.country.name ?? 'Unclaimed',
      };
      nextBuiltBuildingId += 1;
      if (cheats.instantBuild) {
        finishConstruction([building]);
        flashBuildNote(`BUILT INSTANTLY · ${BUILDING_COST_COINS} COINS`);
      } else {
        construction.start(building);
        buildingLayer.addConstructionSite(building);
        flashBuildNote(
          `CONSTRUCTION STARTED · ${BUILDING_COST_COINS} COINS · ${Math.round(
            construction.durationDays,
          )} DAYS`,
        );
      }
      outliner.update();
      renderResources();
    }
    if (match) selectCountry(match.country);
  });

  const resize = (): void => {
    const scale = fitStage();
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio * scale));
    renderer.setPixelRatio(ratio);
    renderer.setSize(STAGE_WIDTH, STAGE_HEIGHT, false);
    starfield.setPixelRatio(ratio);
  };

  window.addEventListener('resize', resize);
  resize();
  setMode('terrain');
  setLighting(sim.date);
  clockPanel.render(sim.date);
  applyResearchEffects();
  renderResources();
  renderWarStatus();

  let lastFrame = performance.now();
  let lastClockPaint = 0;
  const scratch = new THREE.Vector3();

  const frame = (): void => {
    requestAnimationFrame(frame);

    const now = performance.now();
    const elapsed = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;

    const timestampBefore = sim.timestamp;
    sim.advance(elapsed);
    const simulatedSeconds = Math.max(0, (sim.timestamp - timestampBefore) / 1000);
    let completedBuildings: Building[] = [];
    if (simulatedSeconds > 0) {
      gravity.step(simulatedSeconds);
      moon.sync(moonBody.position);
      field.grow(simulatedSeconds);
      resources.advance(
        simulatedSeconds,
        initialBuildings,
        playerNation?.name ?? null,
        research.recruitmentMultiplier(),
        (nation) => ai?.getResearch(nation)?.recruitmentMultiplier() ?? 1,
        populationForNation,
      );
      if (phase === 'playing' && playerNation) {
        production.advance(simulatedSeconds, initialBuildings, playerNation.name);
        completedBuildings = construction.advance(simulatedSeconds, playerNation.name);
        warfare.advance(
          simulatedSeconds,
          resources,
          research,
          alliedNames(),
          (nation) => ai?.getResearch(nation) ?? null,
        );
        diplomacy.advanceRelationActions(simulatedSeconds / 86_400);
      }
    }
    finishConstruction(completedBuildings);
    if (phase === 'playing' && playerNation) {
      ai?.update(simulatedSeconds, sim.timestamp);
    }
    setLighting(sim.date);

    if (currentView === 'moon') {
      scratch.copy(moon.position).sub(lastMoonPosition);
      camera.position.add(scratch);
      controls.target.copy(moon.position);
      lastMoonPosition.copy(moon.position);
    }

    controls.update();
    const nuclearVisible = phase === 'playing' && currentView === 'earth';
    if (!nuclearVisible && (armedWarhead || pendingPlan)) stopNuclearTargeting();
    nukeUi.setVisible(nuclearVisible);
    nuclear.setPopulationMode(currentMapMode === 'population');
    nuclear.update(elapsed);
    populationCounter.update(elapsed);

    if (now - lastClockPaint >= 100) {
      clockPanel.render(sim.date);
      if (phase === 'playing') applyCheats();
      refreshLaunchStatus();
      renderResources();
      populationCounter.setPopulation(field.total);
      updateNationPopulation();
      if (productionPanel.isOpen) productionPanel.update();
      if (researchPanel.isOpen) researchPanel.update();
      outliner.update();
      if (contextNation && diplomacyUi.contextOpen) {
        diplomacyUi.updateContextMetrics(
          diplomacy.stats(contextNation.name),
          activeRelationAction(),
        );
      }
      warFrontOverlay.setFronts(
        warfare.getFronts(),
        playerNation?.name ?? null,
        alliedNames(),
      );
      processSurrenders();
      renderWarStatus();
      lastClockPaint = now;
    }

    renderer.render(scene, camera);
    buildingLayer.render(camera);
    cityLayer.render(camera);
    capitalLayer.render(camera);
  };

  setBoot(0.94, 'CALIBRATING ORBITAL LIGHT');
  await nextFrame();
  renderer.render(scene, camera);
  buildingLayer.render(camera);
  cityLayer.render(camera);
  capitalLayer.render(camera);
  setBoot(1, 'ONLINE');

  requestAnimationFrame(frame);
  boot.classList.add('boot--out');
  if (document.hidden) boot.remove();
  else window.setTimeout(() => boot.remove(), 800);

  if (import.meta.env.DEV) {
    Object.assign(window, {
      nuclearBallet: {
        field,
        globe,
        cityLights,
        sim,
        atlas,
        moon,
        gravity,
        moonBody,
        borderLines,
        countryOutline,
        alliedOutline,
        buildingLayer,
        cityLayer,
        interceptorRanges,
        warOutline,
        warFrontOverlay,
        capitalLayer,
        warPreviewLayers,
        warPreviewOpen: (): boolean => warPreviewOpen,
        buildings: initialBuildings,
        resources,
        research,
        production,
        nuclear,
        nukeUi,
        construction,
        outliner,
        diplomacy,
        warfare,
        ai,
        naturalRegionAt,
        allies: (): string[] => alliedNames(),
        productionPanel,
        researchPanel,
        diplomacyUi,
        gbiRangeKm: (): number => interceptorRanges.rangeKm(),
        visibleBuildings: (): number => buildingLayer.visibleBuildingCount,
        sightRadiusKm: SIGHT_RADIUS_KM,
        borderDistanceKm: (name: string, lat: number, lon: number): number | null => {
          const country = countries.countries.find((entry) => entry.name === name);
          return country ? distanceToCountryBorderKm(country, lat, lon) : null;
        },
        sharesBorder: (a: string, b: string): boolean | null => {
          const first = countries.countries.find((entry) => entry.name === a);
          const second = countries.countries.find((entry) => entry.name === b);
          return first && second ? countriesShareLandBorder(first, second) : null;
        },
        phase: (): GamePhase => phase,
        activeCountries: (): string[] => activeCountries().map((country) => country.name),
        annex: (victor: string, defeated: string): boolean => annexCountry(victor, defeated),
        processSurrenders,
        advanceConstruction(days: number): Building[] {
          if (!playerNation || !(days > 0)) return [];
          const completed = construction.advance(days * 86_400, playerNation.name);
          finishConstruction(completed);
          return completed;
        },
        pendingNation: (): string | null => pendingNation?.name ?? null,
        playerNation: (): string | null => playerNation?.name ?? null,
        isDockyardSite: (lat: number, lon: number): boolean =>
          isOceanCoastline(field, lakeMask, lat, lon),
        isLandSite: (lat: number, lon: number): boolean => isLandAt(field, lat, lon),
        camera,
        controls,
        setView,
        view: (): ViewMode => currentView,
        setMode,
        setSpeed: applySpeed,
        selectAt(
          lat: number,
          lon: number,
        ): { name: string; capital: string; timezone: string } | null {
          const match = atlas.find(lat, lon);
          if (!match) return null;
          selectCountry(match.country);
          return {
            name: match.country.name,
            capital: match.country.capital,
            timezone: match.country.timezone,
          };
        },
        selected: (): { name: string; capital: string; timezone: string } | null =>
          selectedCountry
            ? {
                name: selectedCountry.name,
                capital: selectedCountry.capital,
                timezone: selectedCountry.timezone,
              }
            : null,
        clearSelection(): void {
          selectCountry(null);
        },
        strike(lat: number, lon: number, radiusKm: number): StrikeResult {
          const result = field.strike(lat, lon, radiusKm);
          console.info(
            `[strike] ${Math.round(result.killed).toLocaleString()} killed, ${Math.round(
              result.remaining,
            ).toLocaleString()} remaining`,
          );
          return result;
        },
        populationInRadius: (lat: number, lon: number, radiusKm: number): number =>
          field.populationInRadius(lat, lon, radiusKm),
        subsolar: (): ReturnType<typeof subsolarPoint> => subsolarPoint(sim.date),
        clockText: (): {
          time: string | null;
          date: string | null;
          meta: string | null;
        } => ({
          time: clockTime.textContent,
          date: clockDate.textContent,
          meta: clockMeta.textContent,
        }),
      },
    });
  }
}

start().catch((error: unknown) => {
  console.error(error);
  bootStatus.textContent =
    error instanceof Error ? error.message.toUpperCase() : 'FAILED TO START';
  setBoot(1);
});
