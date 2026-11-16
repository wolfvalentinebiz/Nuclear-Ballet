import type { CountryData } from '../geo/types';
import type { ResourceLedger } from '../economy/resources';
import type { ResearchState } from './research';
import {
  NATURAL_DEFENSE_MULTIPLIER,
  naturalRegionAt,
  type NaturalKind,
} from '../geo/natural';
import { countriesShareLandBorder, sharedBorderPoint } from './sight';

const SECONDS_PER_DAY = 86_400;
export const BASE_DEPLOYMENT_PER_DAY = 1_000;
// A defender cannot fully mobilize on the first day. This also keeps a fresh
// war front moving instead of freezing at an equal deployment rate.
export const BASE_ENEMY_DEPLOYMENT_PER_DAY = 650;
// Simulation time runs at hours per real minute. A larger multiplier makes a
// live front visibly creep across the globe instead of appearing frozen.
const FRONT_PERCENT_PER_1K_NET = 45;

export interface WarFront {
  enemy: string;
  hasBorder: boolean;
  progress: number;
  playerReserve: number;
  enemyReserve: number;
  playerRate: number;
  allyRate: number;
  enemyRate: number;
  netRate: number;
  contactLat: number | null;
  contactLon: number | null;
  enemyLat: number | null;
  enemyLon: number | null;
  terrainKind: NaturalKind | null;
  terrainMultiplier: number;
  navalInvaded: boolean;
  navalRequired: boolean;
  navalComponents: number;
  hasLandAccess: boolean;
  occupiedPercent: number;
  warScore: number;
  capitalOccupied: boolean;
  secondaryCapitalsOccupied: number;
  secondaryCapitalsTotal: number;
  surrenderThreshold: number;
  surrendered: boolean;
  breakthrough: boolean;
}

export interface NavalInvasionResult {
  ok: boolean;
  message: string;
}

/**
 * A continuous, low-intensity front. Each side drips troops into a shared
 * border at up to its daily cap; equal manpower cancels out. Lethality tilts
 * the exchange, and surviving pressure moves the front marker.
 */
export class WarfareSystem {
  private readonly fronts = new Map<string, WarFront>();
  private readonly countries = new Map<string, CountryData>();
  private player: string | null = null;

  setCountryCatalog(countries: readonly CountryData[]): void {
    this.countries.clear();
    for (const country of countries) this.countries.set(country.name, country);
  }

  reset(player: string | null): void {
    this.fronts.clear();
    this.player = player;
  }

  sync(player: string, enemies: Iterable<string>): void {
    this.player = player;
    const active = new Set(enemies);

    for (const enemy of active) {
      if (this.fronts.has(enemy)) continue;
      const playerCountry = this.countries.get(player);
      const enemyCountry = this.countries.get(enemy);
      const contact = playerCountry && enemyCountry
        ? sharedBorderPoint(playerCountry, enemyCountry)
        : null;
      const natural = contact ? naturalRegionAt(contact.lat, contact.lon) : null;
      const enemyAnchor = enemyCountry
        ? enemyCountry.siteLat !== null && enemyCountry.siteLon !== null
          ? { lat: enemyCountry.siteLat, lon: enemyCountry.siteLon }
          : enemyCountry.capitalLat !== null && enemyCountry.capitalLon !== null
            ? { lat: enemyCountry.capitalLat, lon: enemyCountry.capitalLon }
            : null
        : null;
      this.fronts.set(enemy, {
        enemy,
        hasBorder: contact !== null,
        progress: 0,
        playerReserve: 0,
        enemyReserve: 0,
        playerRate: 0,
        allyRate: 0,
        enemyRate: 0,
        netRate: 0,
        contactLat: contact?.lat ?? null,
        contactLon: contact?.lon ?? null,
        enemyLat: enemyAnchor?.lat ?? null,
        enemyLon: enemyAnchor?.lon ?? null,
        terrainKind: natural?.kind ?? null,
        terrainMultiplier: natural ? NATURAL_DEFENSE_MULTIPLIER[natural.kind] : 1,
        navalInvaded: false,
        navalRequired: contact === null,
        navalComponents: 0,
        hasLandAccess: contact !== null,
        occupiedPercent: 0,
        warScore: 0,
        capitalOccupied: false,
        secondaryCapitalsOccupied: 0,
        secondaryCapitalsTotal: 0,
        surrenderThreshold: 95,
        surrendered: false,
        breakthrough: false,
      });
    }

    for (const enemy of this.fronts.keys()) {
      if (!active.has(enemy)) this.fronts.delete(enemy);
    }
  }

  advance(
    seconds: number,
    ledger: ResourceLedger,
    research: ResearchState,
    allies: readonly string[] = [],
    enemyResearch?: (nation: string) => ResearchState | null,
  ): void {
    if (!(seconds > 0) || !this.player) return;
    const days = seconds / SECONDS_PER_DAY;
    if (!(days > 0)) return;

    const deploymentCap = BASE_DEPLOYMENT_PER_DAY * research.deploymentMultiplier();
    const lethality = research.troopLethality();

    for (const front of this.fronts.values()) {
      if (!this.player) continue;
      front.playerReserve = ledger.availableManpower(this.player);
      front.enemyReserve = ledger.availableManpower(front.enemy);

      if (
        (!front.hasBorder && !front.hasLandAccess && !front.navalInvaded) ||
        front.surrendered ||
        front.breakthrough ||
        front.progress <= -100
      ) {
        front.playerRate = 0;
        front.allyRate = 0;
        front.enemyRate = 0;
        front.netRate = 0;
        continue;
      }

      const playerSent = ledger.consumeManpower(
        this.player,
        deploymentCap * days,
      );
      const defenderResearch = enemyResearch?.(front.enemy) ?? null;
      const enemySent = ledger.consumeManpower(
        front.enemy,
        BASE_ENEMY_DEPLOYMENT_PER_DAY *
          (defenderResearch?.deploymentMultiplier() ?? 1) *
          days,
      );

      let allySent = 0;
      const targetCountry = this.countries.get(front.enemy);
      if (targetCountry) {
        for (const ally of allies) {
          if (ally === this.player || ally === front.enemy) continue;
          const allyCountry = this.countries.get(ally);
          if (!allyCountry) continue;
          if (!countriesShareLandBorder(allyCountry, targetCountry)) continue;
          allySent += ledger.consumeManpower(ally, BASE_DEPLOYMENT_PER_DAY * days);
        }
      }

      // Difficult ground multiplies the defender's effective strength. Allied
      // troops count toward the attacking side and are drawn from their own
      // reserves, so an alliance can break a mountain deadlock.
      const net =
        playerSent * lethality +
        allySent -
        enemySent *
          front.terrainMultiplier *
          (defenderResearch?.troopLethality() ?? 1);
      const delta = (net / 1_000) * FRONT_PERCENT_PER_1K_NET;
      front.progress = Math.max(-100, Math.min(100, front.progress + delta));
      front.playerRate = playerSent / days;
      front.allyRate = allySent / days;
      front.enemyRate = enemySent / days;
      front.netRate = net / days;
      front.breakthrough = front.progress >= 100;
      front.playerReserve = ledger.availableManpower(this.player);
      front.enemyReserve = ledger.availableManpower(front.enemy);
    }
  }

  getFronts(): readonly WarFront[] {
    return [...this.fronts.values()];
  }

  launchNavalInvasion(
    enemy: string,
    ledger: ResourceLedger,
    nation: string,
  ): NavalInvasionResult {
    if (!this.player || this.player !== nation) {
      return { ok: false, message: 'NO NATION SELECTED' };
    }
    const front = this.fronts.get(enemy);
    if (!front) return { ok: false, message: 'NO ACTIVE WAR' };
    if (front.navalInvaded) {
      return { ok: false, message: 'BEACHHEAD ALREADY ESTABLISHED' };
    }
    if (!front.navalRequired) {
      return { ok: false, message: 'NO DETACHED COAST TO INVADE' };
    }
    if (!ledger.spendCounter(nation, 'landingShips', 1)) {
      return { ok: false, message: 'NEED 1 LANDING SHIP' };
    }

    front.navalInvaded = true;
    front.navalRequired = false;
    front.breakthrough = false;
    return {
      ok: true,
      message: `NAVAL INVASION LAUNCHED AGAINST ${enemy.toUpperCase()}`,
    };
  }

  deploymentCap(research: ResearchState): number {
    return BASE_DEPLOYMENT_PER_DAY * research.deploymentMultiplier();
  }
}
