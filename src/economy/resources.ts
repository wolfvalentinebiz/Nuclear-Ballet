import type { Building } from '../game/buildings';

const SECONDS_PER_DAY = 86_400;
const DAYS_PER_MONTH = 30.436875;
const MAX_DIGITS = 10;
const MAX_VALUE = 10 ** MAX_DIGITS - 1;

const REACTOR_COINS_PER_DAY = 100;
const RESEARCH_CENTER_COST_PER_DAY = 25;
const RESEARCH_CENTER_POINTS_PER_DAY = 20;
const INTERCEPTOR_FACTORY_PER_DAY = 4;
const BARRACKS_MANPOWER_PER_DAY = 50;

export type CounterKey =
  | 'manpower'
  | 'interceptors'
  | 'nukes'
  | 'icbms'
  | 'landingShips'
  | 'submarines'
  | 'rockets'
  | 'satellites';

export interface NationBalance {
  coins: number;
  research: number;
  manpower: number;
  interceptors: number;
  nukes: number;
  icbms: number;
  landingShips: number;
  submarines: number;
  rockets: number;
  satellites: number;
}

type MutableBalance = NationBalance;

function emptyBalance(): MutableBalance {
  return {
    coins: 0,
    research: 0,
    manpower: 0,
    interceptors: 0,
    nukes: 0,
    icbms: 0,
    landingShips: 0,
    submarines: 0,
    rockets: 0,
    satellites: 0,
  };
}

function clampBalance(balance: MutableBalance): void {
  balance.coins = Math.max(-MAX_VALUE, Math.min(MAX_VALUE, balance.coins));
  balance.research = Math.max(0, Math.min(MAX_VALUE, balance.research));
  for (const key of [
    'manpower',
    'interceptors',
    'nukes',
    'icbms',
    'landingShips',
    'submarines',
    'rockets',
    'satellites',
  ] as const) {
    balance[key] = Math.max(0, Math.min(MAX_VALUE, balance[key]));
  }
}

/**
 * National economy and inventory. Coins and research accrue continuously
 * against simulation time; factories add equipment at their daily rates.
 * A building's output belongs only to the nation whose borders contain it.
 */
export class ResourceLedger {
  private readonly balances = new Map<string, MutableBalance>();

  /** Clears every national balance when a new game session starts. */
  reset(): void {
    this.balances.clear();
  }

  private ensure(nation: string): MutableBalance {
    let balance = this.balances.get(nation);
    if (!balance) {
      balance = emptyBalance();
      this.balances.set(nation, balance);
    }
    return balance;
  }

  advance(
    seconds: number,
    buildings: readonly Building[],
    playerNation: string | null = null,
    recruitmentMultiplier = 1,
    recruitmentMultiplierForNation?: (nation: string) => number,
    populationForNation?: (nation: string) => number,
  ): void {
    if (!(seconds > 0)) return;

    const days = seconds / SECONDS_PER_DAY;
    if (populationForNation) {
      const months = days / DAYS_PER_MONTH;
      for (const [nation, balance] of this.balances) {
        const population = populationForNation(nation);
        if (!(population > 0)) continue;
        // 1 coin per 1,000 residents per calendar month.
        balance.coins += (population / 1_000) * months;
      }
    }

    for (const building of buildings) {
      const balance = this.ensure(building.country);

      switch (building.type) {
        case 'nuclearReactor':
          balance.coins += REACTOR_COINS_PER_DAY * days;
          break;
        case 'researchCenter':
          balance.coins -= RESEARCH_CENTER_COST_PER_DAY * days;
          balance.research += RESEARCH_CENTER_POINTS_PER_DAY * days;
          break;
        case 'interceptorFactory':
          balance.interceptors += INTERCEPTOR_FACTORY_PER_DAY * days;
          break;
        case 'barracks':
          const nationRecruitmentMultiplier =
            building.country === playerNation
              ? recruitmentMultiplier
              : (recruitmentMultiplierForNation?.(building.country) ?? 1);
          balance.manpower +=
            BARRACKS_MANPOWER_PER_DAY *
            days *
            nationRecruitmentMultiplier;
          break;
        default:
          break;
      }
    }

    for (const balance of this.balances.values()) clampBalance(balance);
  }

  forNation(nation: string | null | undefined): NationBalance {
    if (!nation) return emptyBalance();
    const balance = this.balances.get(nation);
    if (!balance) return emptyBalance();
    return {
      coins: Math.trunc(balance.coins),
      research: Math.trunc(balance.research),
      manpower: Math.trunc(balance.manpower),
      interceptors: Math.trunc(balance.interceptors),
      nukes: Math.trunc(balance.nukes),
      icbms: Math.trunc(balance.icbms),
      landingShips: Math.trunc(balance.landingShips),
      submarines: Math.trunc(balance.submarines),
      rockets: Math.trunc(balance.rockets),
      satellites: Math.trunc(balance.satellites),
    };
  }

  /** Liquid economic weight used by the diplomatic strength ratio. */
  economyScore(nation: string): number {
    const balance = this.balances.get(nation);
    if (!balance) return 0;
    return Math.max(0, balance.coins) + Math.max(0, balance.research) * 2;
  }

  /** Mobilized manpower plus strategic stockpiles. */
  militaryScore(nation: string): number {
    const balance = this.balances.get(nation);
    if (!balance) return 0;
    return (
      Math.max(0, balance.manpower) +
      Math.max(0, balance.interceptors) * 20 +
      Math.max(0, balance.nukes) * 100 +
      Math.max(0, balance.icbms) * 80 +
      Math.max(0, balance.landingShips) * 60 +
      Math.max(0, balance.submarines) * 80 +
      Math.max(0, balance.rockets) * 50 +
      Math.max(0, balance.satellites) * 80
    );
  }

  strengthScore(nation: string): number {
    return this.economyScore(nation) + this.militaryScore(nation);
  }

  seedManpower(nation: string, amount: number): void {
    const balance = this.ensure(nation);
    balance.manpower = Math.max(balance.manpower, amount);
    clampBalance(balance);
  }

  seedCoins(nation: string, amount: number): void {
    const balance = this.ensure(nation);
    balance.coins = Math.max(balance.coins, amount);
    clampBalance(balance);
  }

  seedResearch(nation: string, amount: number): void {
    const balance = this.ensure(nation);
    balance.research = Math.max(balance.research, amount);
    clampBalance(balance);
  }

  seedCounter(nation: string, key: CounterKey, amount: number): void {
    const balance = this.ensure(nation);
    balance[key] = Math.max(balance[key], amount);
    clampBalance(balance);
  }

  addCounter(nation: string, key: CounterKey, amount: number): void {
    const balance = this.ensure(nation);
    balance[key] += amount;
    clampBalance(balance);
  }

  /** Transfers a defeated nation's treasury, stockpile, and reserves. */
  absorb(defeated: string, victor: string): void {
    if (defeated === victor) return;
    const source = this.balances.get(defeated);
    if (!source) return;
    const target = this.ensure(victor);

    target.coins += source.coins;
    target.research += source.research;
    target.manpower += source.manpower;
    target.interceptors += source.interceptors;
    target.nukes += source.nukes;
    target.icbms += source.icbms;
    target.landingShips += source.landingShips;
    target.submarines += source.submarines;
    target.rockets += source.rockets;
    target.satellites += source.satellites;
    clampBalance(target);
    this.balances.delete(defeated);
  }

  spendCounter(nation: string, key: CounterKey, amount: number): boolean {
    if (!(amount > 0)) return true;
    const balance = this.ensure(nation);
    if (balance[key] + 1e-9 < amount) return false;
    balance[key] -= amount;
    clampBalance(balance);
    return true;
  }

  spendResearch(nation: string, amount: number): boolean {
    if (!(amount > 0)) return true;
    const balance = this.ensure(nation);
    if (balance.research + 1e-9 < amount) return false;
    balance.research = Math.max(0, balance.research - amount);
    return true;
  }

  spendCoins(nation: string, amount: number): boolean {
    if (!(amount > 0)) return true;
    const balance = this.ensure(nation);
    if (balance.coins + 1e-9 < amount) return false;
    balance.coins -= amount;
    clampBalance(balance);
    return true;
  }

  availableManpower(nation: string): number {
    const balance = this.balances.get(nation);
    return balance ? Math.max(0, balance.manpower) : 0;
  }

  consumeManpower(nation: string, amount: number): number {
    if (!(amount > 0)) return 0;
    const balance = this.ensure(nation);
    const spent = Math.min(balance.manpower, amount);
    balance.manpower -= spent;
    return spent;
  }
}

/** Fixed 10-digit counter; a negative coin balance keeps its sign. */
export function formatResource(value: number): string {
  const clamped = Math.max(
    -MAX_VALUE,
    Math.min(MAX_VALUE, Math.trunc(value)),
  );
  const sign = clamped < 0 ? '-' : '';
  return `${sign}${String(Math.abs(clamped)).padStart(MAX_DIGITS, '0')}`;
}
