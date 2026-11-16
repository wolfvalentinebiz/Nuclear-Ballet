import type { CountryData } from '../geo/types';
import type { SitePoint } from './sites';
import type { Building, BuildingType } from './buildings';
import { BUILDING_COST_COINS, BASE_BUILD_DAYS, ConstructionSystem } from './construction';
import { ProductionSystem } from './production';
import {
  ResearchState,
  TECHS,
  type TechDefinition,
} from './research';
import type { ResourceLedger } from '../economy/resources';
import type { DiplomacySystem } from './diplomacy';
import {
  BASE_DEPLOYMENT_PER_DAY,
  BASE_ENEMY_DEPLOYMENT_PER_DAY,
} from './warfare';
import { countriesShareLandBorder, sharedBorderPoint } from './sight';
import {
  NATURAL_DEFENSE_MULTIPLIER,
  naturalRegionAt,
} from '../geo/natural';
import { nuclearItems, type ProductionTab } from './arsenal';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const DECISION_INTERVAL_MS = 4 * HOUR_MS;
const ECONOMY_INTERVAL_MS = 4 * HOUR_MS;
const WAR_INTERVAL_MS = 4 * HOUR_MS;
const MAX_AI_WARS = 2;
const SECONDS_PER_DAY = 86_400;

type NuclearLaunch = (
  owner: string,
  itemId: string,
  lat: number,
  lon: number,
) => { ok: boolean; message: string };

interface AIDependencies {
  countries: () => readonly CountryData[];
  resources: ResourceLedger;
  diplomacy: DiplomacySystem;
  getBuildings: () => readonly Building[];
  getPlayerNation: () => string | null;
  getSimTime: () => number;
  isCoastalCountry?: (nation: string) => boolean;
  chooseBuildingSite: (nation: string, type: BuildingType) => SitePoint | null;
  onConstructionStarted: (building: Building) => void;
  onConstructionCancelled: (building: Building) => void;
  onBuildingCompleted: (building: Building) => void;
  onAnnex: (victor: string, defeated: string) => boolean;
  onWarDeclared: (attacker: string, defender: string) => void;
  launchNuke: NuclearLaunch;
}

interface AINation {
  name: string;
  research: ResearchState;
  production: ProductionSystem;
  construction: ConstructionSystem;
  aggression: number;
  pendingSeconds: number;
  nextEconomyAt: number;
  nextDecisionAt: number;
  nextWarAt: number;
}

interface AIFront {
  key: string;
  attacker: string;
  defender: string;
  progress: number;
  navalInvaded: boolean;
  terrainMultiplier: number;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function warKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/**
 * Per-nation strategic AI. Each nation owns the same research, production and
 * construction systems as the player; the controller chooses sites, projects
 * power, negotiates, and launches warheads on a simulation-time cadence.
 */
export class AIController {
  private readonly nations = new Map<string, AINation>();
  private readonly fronts = new Map<string, AIFront>();
  private initialized = false;
  private initializedPlayer: string | null = null;
  private nextBuildingId = 1;
  private pendingWarSeconds = 0;
  private nextWarTickAt = 0;

  constructor(private readonly deps: AIDependencies) {}

  get nationCount(): number {
    return this.nations.size;
  }

  reset(): void {
    this.nations.clear();
    this.fronts.clear();
    this.initialized = false;
    this.initializedPlayer = null;
    this.nextBuildingId = 1;
    this.pendingWarSeconds = 0;
    this.nextWarTickAt = 0;
  }

  getResearch(nation: string): ResearchState | undefined {
    return this.nations.get(nation)?.research;
  }

  getProduction(nation: string): ProductionSystem | undefined {
    return this.nations.get(nation)?.production;
  }

  getConstructionSites(nation: string): Building[] {
    return this.nations
      .get(nation)
      ?.construction.view(nation)
      .map((entry) => entry.order.building) ?? [];
  }

  removeConstructionWithin(
    lat: number,
    lon: number,
    radiusKm: number,
  ): Building[] {
    const destroyed: Building[] = [];
    for (const nation of this.nations.values()) {
      destroyed.push(...nation.construction.removeWithin(lat, lon, radiusKm));
    }
    return destroyed;
  }

  removeNation(name: string): void {
    const nation = this.nations.get(name);
    if (nation) {
      for (const entry of nation.construction.view(name)) {
        this.deps.onConstructionCancelled(entry.order.building);
      }
    }
    this.nations.delete(name);
    for (const [key, front] of this.fronts) {
      if (front.attacker === name || front.defender === name) {
        this.fronts.delete(key);
      }
    }
  }

  update(seconds: number, now: number): void {
    if (!(seconds > 0)) return;
    this.ensureInitialized();
    if (this.nations.size === 0) return;

    for (const nation of this.nations.values()) {
      nation.pendingSeconds += seconds;
      if (now >= nation.nextEconomyAt) {
        const elapsed = nation.pendingSeconds;
        nation.pendingSeconds = 0;
        nation.nextEconomyAt = now + ECONOMY_INTERVAL_MS + (hashString(nation.name) % HOUR_MS);
        for (const building of nation.construction.advance(elapsed, nation.name)) {
          this.deps.onBuildingCompleted(building);
        }
        nation.production.advance(elapsed, this.deps.getBuildings(), nation.name);
      }

      if (now >= nation.nextDecisionAt) {
        nation.nextDecisionAt =
          now + DECISION_INTERVAL_MS + (hashString(`${nation.name}:decision`) % (2 * HOUR_MS));
        this.think(nation, now);
      }
    }

    this.pendingWarSeconds += seconds;
    if (now >= this.nextWarTickAt) {
      const elapsed = this.pendingWarSeconds;
      this.pendingWarSeconds = 0;
      this.nextWarTickAt = now + WAR_INTERVAL_MS;
      this.syncWars();
      this.resolveWars(elapsed);
    }
  }

  private ensureInitialized(): void {
    const player = this.deps.getPlayerNation();
    if (this.initialized && this.initializedPlayer === player) return;

    this.nations.clear();
    this.fronts.clear();
    this.initialized = true;
    this.initializedPlayer = player;
    this.nextBuildingId = 1;
    this.pendingWarSeconds = 0;
    this.nextWarTickAt = this.deps.getSimTime() + WAR_INTERVAL_MS;

    const now = this.deps.getSimTime();
    for (const country of this.deps.countries()) {
      if (country.name === player || country.polygons.length === 0) continue;
      const research = new ResearchState();
      const production = new ProductionSystem(
        this.deps.resources,
        (techId) => research.isUnlocked(techId),
      );
      const construction = new ConstructionSystem(
        () => BASE_BUILD_DAYS * research.constructionTimeMultiplier(),
      );
      const seed = hashString(country.name);
      this.nations.set(country.name, {
        name: country.name,
        research,
        production,
        construction,
        aggression: 0.22 + (seed % 68) / 100,
        pendingSeconds: 0,
        nextEconomyAt: now + HOUR_MS + (seed % (3 * HOUR_MS)),
        nextDecisionAt: now + HOUR_MS + (seed % (2 * HOUR_MS)),
        nextWarAt: now + 2 * DAY_MS + (seed % (10 * DAY_MS)),
      });
    }
  }

  private think(nation: AINation, now: number): void {
    const balance = this.deps.resources.forNation(nation.name);
    const atWar = this.deps.diplomacy.warTargets(nation.name).size > 0;
    this.research(nation, balance.research, atWar);
    this.construct(nation, balance.coins, atWar);
    this.produce(nation, atWar);
    this.diplomacy(nation, now, atWar);
    if (atWar) this.useNuclearWeapons(nation, now);
  }

  private research(nation: AINation, points: number, atWar: boolean): void {
    if (points <= 0) return;
    let best: TechDefinition | null = null;
    let bestScore = -Infinity;
    for (const tech of TECHS) {
      if (!nation.research.isAvailable(tech.id) || tech.cost > points) continue;
      const score = this.researchPriority(tech, atWar) - tech.cost * 0.01;
      if (score > bestScore) {
        best = tech;
        bestScore = score;
      }
    }
    if (!best || !this.deps.resources.spendResearch(nation.name, best.cost)) return;
    nation.research.unlock(best.id);
  }

  private researchPriority(tech: TechDefinition, atWar: boolean): number {
    if (atWar) {
      switch (tech.branch) {
        case 'arsenal':
          return 100;
        case 'lethality':
          return 86;
        case 'deployment':
          return 76;
        case 'recruitment':
          return 66;
        case 'construction':
          return 54;
        case 'gbi':
          return 48;
        case 'launch':
          return 36;
      }
    }
    switch (tech.branch) {
      case 'construction':
        return 82;
      case 'recruitment':
        return 70;
      case 'arsenal':
        return 50;
      case 'launch':
        return 38;
      case 'deployment':
        return 34;
      case 'gbi':
        return 24;
      case 'lethality':
        return 20;
    }
  }

  private construct(nation: AINation, coins: number, atWar: boolean): void {
    if (coins < BUILDING_COST_COINS) return;
    if (nation.construction.view(nation.name).length >= 2) return;

    const buildings = this.deps.getBuildings();
    const count = (type: BuildingType): number =>
      buildings.reduce(
        (total, building) =>
          total + (building.country === nation.name && building.type === type ? 1 : 0),
        0,
      );
    const targets: Record<BuildingType, number> = {
      nuclearReactor: 2,
      interceptorPlatform: atWar ? 2 : 1,
      dockyard: atWar ? 2 : 1,
      spaceLaunchPlatform: 1,
      nuclearLaunchPlatform: atWar ? 2 : 1,
      interceptorFactory: atWar ? 2 : 1,
      nuclearMissileFactory: atWar ? 2 : 1,
      spaceshipFactory: 1,
      barracks: atWar ? 3 : 1,
      armsIndustry: atWar ? 2 : 1,
      researchCenter: 2,
    };
    const priorities: BuildingType[] = atWar
      ? [
          'barracks',
          'interceptorPlatform',
          'nuclearMissileFactory',
          'nuclearLaunchPlatform',
          'armsIndustry',
          'interceptorFactory',
          'dockyard',
          'researchCenter',
          'nuclearReactor',
          'spaceLaunchPlatform',
          'spaceshipFactory',
        ]
      : [
          'researchCenter',
          'nuclearReactor',
          'barracks',
          'nuclearMissileFactory',
          'interceptorFactory',
          'nuclearLaunchPlatform',
          'interceptorPlatform',
          'armsIndustry',
          'dockyard',
          'spaceLaunchPlatform',
          'spaceshipFactory',
        ];

    for (const type of priorities) {
      if (count(type) >= targets[type]) continue;
      const site = this.deps.chooseBuildingSite(nation.name, type);
      if (!site) continue;
      if (!this.deps.resources.spendCoins(nation.name, BUILDING_COST_COINS)) return;
      const building: Building = {
        id: `ai-${nation.name}-${this.nextBuildingId}`,
        type,
        lat: site.lat,
        lon: site.lon,
        country: nation.name,
      };
      this.nextBuildingId += 1;
      nation.construction.start(building);
      this.deps.onConstructionStarted(building);
      return;
    }
  }

  private produce(nation: AINation, atWar: boolean): void {
    const nuclear = nuclearItems().filter((item) =>
      nation.research.isUnlocked(item.techId),
    );
    const nuclearChoice = atWar
      ? nuclear[nuclear.length - 1]
      : nuclear[0];
    if (nuclearChoice) this.queueProduction(nation, 'nuclear', nuclearChoice.id);
    const needsLandingShip =
      atWar &&
      [...this.deps.diplomacy.warTargets(nation.name)].some(
        (enemy) => !this.hasLandRoute(nation.name, enemy),
      );
    this.queueProduction(
      nation,
      'dockyard',
      needsLandingShip ? 'landing-ship' : 'nuclear-submarine',
    );
    this.queueProduction(
      nation,
      'space',
      atWar && hashString(nation.name) % 3 === 0 ? 'rocket' : 'recon-satellite',
    );
  }

  private queueProduction(
    nation: AINation,
    tab: ProductionTab,
    itemId: string,
  ): void {
    const view = nation.production.queueView(tab);
    if (view.factoryCount < 1 || view.entries.length >= view.factoryCount) return;
    const result = nation.production.enqueue(tab, itemId);
    if (!result.ok) return;
  }

  private diplomacy(nation: AINation, now: number, atWar: boolean): void {
    const countries = this.deps.countries();
    const self = countries.find((country) => country.name === nation.name);
    if (!self) return;
    const player = this.deps.getPlayerNation();
    const neighbors = countries.filter(
      (country) =>
        country.name !== nation.name &&
        country.polygons.length > 0 &&
        countriesShareLandBorder(self, country),
    );
    const navalTargets =
      nation.aggression > 0.7 && this.deps.isCoastalCountry?.(nation.name)
        ? countries.filter(
            (country) =>
              country.name !== nation.name &&
              country.polygons.length > 0 &&
              !countriesShareLandBorder(self, country) &&
              this.deps.isCoastalCountry?.(country.name),
          )
        : [];
    if (neighbors.length === 0 && navalTargets.length === 0) return;

    const selfPower = Math.max(1, this.deps.resources.strengthScore(nation.name));
    const warCount = this.deps.diplomacy.warTargets(nation.name).size;
    if (!atWar) {
      const friendly = neighbors
        .filter((country) => !this.deps.diplomacy.isAtWar(nation.name, country.name))
        .sort(
          (a, b) =>
            this.deps.diplomacy.opinion(nation.name, b.name) -
            this.deps.diplomacy.opinion(nation.name, a.name),
        )[0];
      if (
        friendly &&
        friendly.name !== player &&
        nation.aggression < 0.6 &&
        this.chance(nation.name, `treaty:${friendly.name}`, now) > 0.45
      ) {
        if (this.deps.diplomacy.opinion(nation.name, friendly.name) < 60) {
          this.deps.diplomacy.adjustOpinion(nation.name, friendly.name, 10);
        }
        const opinion = this.deps.diplomacy.opinion(nation.name, friendly.name);
        if (
          !this.deps.diplomacy.hasAlliance(nation.name, friendly.name) &&
          nation.aggression < 0.5 &&
          opinion >= 55
        ) {
          this.deps.diplomacy.proposeBetween(
            nation.name,
            friendly.name,
            'alliance',
          );
        } else if (
          !this.deps.diplomacy.hasPact(nation.name, friendly.name) &&
          !this.deps.diplomacy.hasAlliance(nation.name, friendly.name)
        ) {
          this.deps.diplomacy.proposeBetween(nation.name, friendly.name, 'pact');
        }
      }
    }

    if (warCount >= MAX_AI_WARS || now < nation.nextWarAt) return;
    const candidates = [...neighbors, ...navalTargets]
      .filter(
        (country) =>
          !this.deps.diplomacy.isAtWar(nation.name, country.name) &&
          (!this.deps.diplomacy.hasPact(nation.name, country.name) ||
            nation.aggression > 0.58) &&
          (!this.deps.diplomacy.hasAlliance(nation.name, country.name) ||
            nation.aggression > 0.78),
      )
      .map((country) => ({
        country,
        power: Math.max(1, this.deps.resources.strengthScore(country.name)),
      }))
      .filter(({ power }) => {
        const threshold = 1.05 - nation.aggression * 0.25;
        return selfPower / power > threshold;
      })
      .sort((a, b) => selfPower / b.power - selfPower / a.power);
    const target = candidates[0];
    if (!target) return;
    if (this.chance(nation.name, `war:${target.country.name}`, now) < 0.18) return;

    try {
      this.deps.diplomacy.adjustOpinion(nation.name, target.country.name, -10);
      this.deps.diplomacy.declareWarBetween(
        nation.name,
        target.country.name,
        countries,
      );
      nation.nextWarAt = now + 6 * DAY_MS + (hashString(nation.name) % (10 * DAY_MS));
      this.deps.onWarDeclared(nation.name, target.country.name);
      this.syncWars();
    } catch {
      // Another AI may have declared the same war first; wait for the next decision.
      nation.nextWarAt = now + DAY_MS;
    }
  }

  private useNuclearWeapons(nation: AINation, now: number): void {
    const stocked = nuclearItems()
      .filter((item) => nation.production.itemCount(item.id) > 0)
      .sort((a, b) => (b.yieldMt ?? 0) - (a.yieldMt ?? 0));
    if (stocked.length === 0) return;
    if (this.chance(nation.name, 'nuclear', now) < 0.35) return;

    for (const enemyName of this.deps.diplomacy.warTargets(nation.name)) {
      const enemy = this.deps.countries().find((country) => country.name === enemyName);
      if (!enemy) continue;
      const lat = enemy.capitalLat ?? enemy.siteLat;
      const lon = enemy.capitalLon ?? enemy.siteLon;
      if (lat === null || lon === null) continue;
      for (const item of stocked) {
        const result = this.deps.launchNuke(nation.name, item.id, lat, lon);
        if (result.ok) return;
      }
    }
  }

  private chance(a: string, b: string, now: number): number {
    return (hashString(`${a}|${b}|${Math.floor(now / DAY_MS)}`) % 1000) / 1000;
  }

  private syncWars(): void {
    const player = this.deps.getPlayerNation();
    const active = new Set<string>();
    for (const name of this.nations.keys()) {
      for (const target of this.deps.diplomacy.warTargets(name)) {
        if (target === player || !this.nations.has(target)) continue;
        const key = warKey(name, target);
        active.add(key);
        if (this.fronts.has(key)) continue;

        const origin = this.deps.diplomacy.warOrigin(name, target);
        const attacker = origin === target ? target : name;
        const defender = attacker === name ? target : name;
        const attackerCountry = this.deps
          .countries()
          .find((country) => country.name === attacker);
        const defenderCountry = this.deps
          .countries()
          .find((country) => country.name === defender);
        if (!attackerCountry || !defenderCountry) continue;
        const contact = sharedBorderPoint(attackerCountry, defenderCountry);
        const natural = contact ? naturalRegionAt(contact.lat, contact.lon) : null;
        this.fronts.set(key, {
          key,
          attacker,
          defender,
          progress: 0,
          navalInvaded: false,
          terrainMultiplier: natural ? NATURAL_DEFENSE_MULTIPLIER[natural.kind] : 1,
        });
      }
    }
    for (const key of this.fronts.keys()) {
      if (!active.has(key)) this.fronts.delete(key);
    }
  }

  private resolveWars(seconds: number): void {
    const days = seconds / SECONDS_PER_DAY;
    if (!(days > 0)) return;
    for (const front of [...this.fronts.values()]) {
      const attacker = this.nations.get(front.attacker);
      const defender = this.nations.get(front.defender);
      if (!attacker || !defender) {
        this.fronts.delete(front.key);
        continue;
      }

      if (!front.navalInvaded && !this.hasLandRoute(front.attacker, front.defender)) {
        if (this.deps.resources.spendCounter(front.attacker, 'landingShips', 1)) {
          front.navalInvaded = true;
        } else {
          continue;
        }
      }

      const attackerSent = this.deps.resources.consumeManpower(
        front.attacker,
        BASE_DEPLOYMENT_PER_DAY * attacker.research.deploymentMultiplier() * days,
      );
      const defenderSent = this.deps.resources.consumeManpower(
        front.defender,
        BASE_ENEMY_DEPLOYMENT_PER_DAY * defender.research.deploymentMultiplier() * days,
      );
      const net =
        attackerSent * attacker.research.troopLethality() -
        defenderSent * front.terrainMultiplier;
      front.progress = Math.max(
        -100,
        Math.min(100, front.progress + (net / 2_500) * 45),
      );
      if (front.progress >= 100) {
        this.finishWar(front, front.attacker, front.defender);
      } else if (front.progress <= -100) {
        this.finishWar(front, front.defender, front.attacker);
      }
    }
  }

  private hasLandRoute(a: string, b: string): boolean {
    const first = this.deps.countries().find((country) => country.name === a);
    const second = this.deps.countries().find((country) => country.name === b);
    return Boolean(first && second && countriesShareLandBorder(first, second));
  }

  private finishWar(front: AIFront, victor: string, defeated: string): void {
    this.fronts.delete(front.key);
    if (!this.nations.has(victor) || !this.nations.has(defeated)) return;
    if (this.deps.onAnnex(victor, defeated)) {
      this.removeNation(defeated);
    }
  }
}