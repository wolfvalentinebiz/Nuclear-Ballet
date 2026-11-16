import type { CountryData } from '../geo/types';

export type TreatyType = 'pact' | 'alliance';
export type WarRole = 'target' | 'enemy' | 'ally' | 'uninvolved';
export type RelationDirection = 'improve' | 'harm';

export interface RelationActionStatus {
  direction: RelationDirection;
  remaining: number;
}

export interface RelationActionEntry extends RelationActionStatus {
  source: string;
  target: string;
}

export const BASE_OPINION = 25;
export const BASE_ACCEPTANCE = 25;
export const PACT_ACCEPTANCE_PENALTY = 25;
export const ALLIANCE_ACCEPTANCE_PENALTY = 50;
export const WARTIME_TREATY_PENALTY = -100;
export const RELATION_ACTION_STEP = 5;
export const MAX_RELATION_ACTIONS = 5;
export const HIGH_OPINION_THRESHOLD = 75;
export const WAR_OPINION_PENALTY = -100;
export const WAR_OPINION_SPILLOVER = -50;
export const MAX_ALLIANCES = 3;
export const MAX_DEFENSIVE_PACTS = 5;

export interface DiplomacyStats {
  opinion: number;
  powerRatio: number;
  strengthModifier: number;
  pactAcceptance: number;
  allianceAcceptance: number;
}

export interface WarPreview {
  target: string;
  playerSide: string[];
  enemySide: string[];
  uninvolvedCount: number;
  roles: Map<string, WarRole>;
}

export interface ProposalResult {
  ok: boolean;
  message: string;
}

export interface WarDeclaration {
  attackerSide: string[];
  defenderSide: string[];
}

interface RelationActionState extends RelationActionEntry {
  progressDays: number;
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

/**
 * Player-facing diplomacy. Treaties are reciprocal sets; declaring an
 * offensive war calls the defender's pacts and alliances, while only the
 * player's alliances would join an offensive. Active wars list every nation
 * fighting the player.
 */
export class DiplomacySystem {
  private player: string | null = null;
  private readonly pacts = new Map<string, Set<string>>();
  private readonly alliances = new Map<string, Set<string>>();
  private readonly wars = new Set<string>();
  private readonly warAdjacency = new Map<string, Set<string>>();
  private readonly warOrigins = new Map<string, string>();
  private readonly opinions = new Map<string, number>();
  private readonly relationActions = new Map<string, RelationActionState>();
  private strengthProvider: ((nation: string) => number) | null = null;

  setStrengthProvider(provider: (nation: string) => number): void {
    this.strengthProvider = provider;
  }

  setPlayer(player: string): void {
    this.player = player;
  }

  reset(): void {
    this.player = null;
    this.pacts.clear();
    this.alliances.clear();
    this.wars.clear();
    this.warAdjacency.clear();
    this.warOrigins.clear();
    this.opinions.clear();
    this.relationActions.clear();
  }

  private opinionKey(a: string, b: string): string {
    return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  }

  private warKey(a: string, b: string): string {
    return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  }

  private addWarPair(a: string, b: string, origin: string): void {
    if (a === b) return;
    for (const [nation, other] of [
      [a, b],
      [b, a],
    ] as const) {
      let targets = this.warAdjacency.get(nation);
      if (!targets) {
        targets = new Set();
        this.warAdjacency.set(nation, targets);
      }
      targets.add(other);
    }
    const key = this.warKey(a, b);
    if (!this.warOrigins.has(key)) this.warOrigins.set(key, origin);
  }

  opinion(a: string, b: string): number {
    if (a === b) return BASE_OPINION;
    return this.opinions.get(this.opinionKey(a, b)) ?? BASE_OPINION;
  }

  setOpinion(a: string, b: string, value: number): number {
    if (a === b) return BASE_OPINION;
    const next = Math.max(-100, Math.min(100, Math.round(value)));
    if (next === BASE_OPINION) this.opinions.delete(this.opinionKey(a, b));
    else this.opinions.set(this.opinionKey(a, b), next);
    return next;
  }

  adjustOpinion(a: string, b: string, amount: number): number {
    return this.setOpinion(a, b, this.opinion(a, b) + amount);
  }

  relationAction(a: string, b: string): RelationActionStatus | null {
    const action = this.relationActions.get(this.opinionKey(a, b));
    return action
      ? { direction: action.direction, remaining: action.remaining }
      : null;
  }

  startRelationAction(
    a: string,
    b: string,
    direction: RelationDirection,
  ): RelationActionStatus | null {
    if (a === b) return null;
    const action: RelationActionState = {
      source: a,
      target: b,
      direction,
      remaining: MAX_RELATION_ACTIONS,
      progressDays: 0,
    };
    this.relationActions.set(this.opinionKey(a, b), action);
    return { direction, remaining: action.remaining };
  }

  cancelRelationAction(a: string, b: string): boolean {
    return this.relationActions.delete(this.opinionKey(a, b));
  }

  activeRelationActions(nation: string): RelationActionEntry[] {
    return [...this.relationActions.values()]
      .filter((action) => action.source === nation)
      .map(({ source, target, direction, remaining }) => ({
        source,
        target,
        direction,
        remaining,
      }))
      .sort((a, b) => a.target.localeCompare(b.target));
  }

  /** Applies one queued relation change for each full simulated day. */
  advanceRelationActions(days: number): boolean {
    if (!(days > 0)) return false;
    let changed = false;

    for (const [key, action] of this.relationActions) {
      action.progressDays += days;
      const [a, b] = key.split('\u0000');
      if (!a || !b) {
        this.relationActions.delete(key);
        continue;
      }

      while (action.remaining > 0 && action.progressDays >= 1) {
        action.progressDays -= 1;
        const amount =
          action.direction === 'improve'
            ? RELATION_ACTION_STEP
            : -RELATION_ACTION_STEP;
        const next = this.adjustOpinion(a, b, amount);
        action.remaining -= 1;
        changed = true;

        // The relation cap ends the whole order; no ticks are wasted beyond it.
        if (
          (amount > 0 && next >= 100) ||
          (amount < 0 && next <= -100)
        ) {
          action.remaining = 0;
        }
      }

      if (action.remaining <= 0) this.relationActions.delete(key);
    }

    return changed;
  }

  private strengthOf(nation: string): number {
    return Math.max(0, this.strengthProvider?.(nation) ?? 0);
  }

  private strengthStatsFor(attacker: string, target: string): {
    powerRatio: number;
    strengthModifier: number;
  } {
    const playerStrength = attacker ? this.strengthOf(attacker) : 0;
    const targetStrength = this.strengthOf(target);
    const total = playerStrength + targetStrength;
    return {
      powerRatio:
        targetStrength > 0
          ? playerStrength / targetStrength
          : playerStrength > 0
            ? 99
            : 1,
      strengthModifier:
        total > 0
          ? Math.max(
              -50,
              Math.min(50, (50 * (playerStrength - targetStrength)) / total),
            )
          : 0,
    };
  }

  statsBetween(attacker: string, target: string): DiplomacyStats {
    const opinion = this.opinion(attacker, target);
    const strength = this.strengthStatsFor(attacker, target);
    const opinionBoost = opinion / 2;
    const wartimePenalty =
      this.warTargets(attacker).size > 0 || this.warTargets(target).size > 0
        ? WARTIME_TREATY_PENALTY
        : 0;
    const acceptance = (penalty: number): number =>
      (() => {
        const raw =
          BASE_ACCEPTANCE -
          penalty +
          opinionBoost +
          strength.strengthModifier +
          wartimePenalty;
        const rounded = Math.sign(raw) * Math.round(Math.abs(raw));
        return Math.max(-100, Math.min(100, rounded));
      })();

    return {
      opinion,
      powerRatio: strength.powerRatio,
      strengthModifier: Math.round(strength.strengthModifier),
      pactAcceptance: acceptance(PACT_ACCEPTANCE_PENALTY),
      allianceAcceptance: acceptance(ALLIANCE_ACCEPTANCE_PENALTY),
    };
  }

  stats(target: string): DiplomacyStats {
    return this.statsBetween(this.player ?? '', target);
  }

  hasPact(a: string, b: string): boolean {
    return this.pacts.get(a)?.has(b) ?? false;
  }

  hasAlliance(a: string, b: string): boolean {
    return this.alliances.get(a)?.has(b) ?? false;
  }

  atWar(nation: string): boolean {
    return this.wars.has(nation);
  }

  /** True when two nations are hostile to each other, regardless of the player. */
  isAtWar(a: string, b: string): boolean {
    return this.warAdjacency.get(a)?.has(b) ?? false;
  }

  warTargets(nation: string): ReadonlySet<string> {
    return new Set(this.warAdjacency.get(nation) ?? []);
  }

  warOrigin(a: string, b: string): string | null {
    return this.warOrigins.get(this.warKey(a, b)) ?? null;
  }

  activeWars(): ReadonlySet<string> {
    return this.wars;
  }

  private addRelation(
    map: Map<string, Set<string>>,
    a: string,
    b: string,
  ): void {
    let aSet = map.get(a);
    if (!aSet) {
      aSet = new Set();
      map.set(a, aSet);
    }
    aSet.add(b);

    let bSet = map.get(b);
    if (!bSet) {
      bSet = new Set();
      map.set(b, bSet);
    }
    bSet.add(a);
  }

  private removeRelation(
    map: Map<string, Set<string>>,
    a: string,
    b: string,
  ): void {
    map.get(a)?.delete(b);
    map.get(b)?.delete(a);
  }

  /** Removes an annexed nation from every active war and treaty. */
  removeNation(name: string): void {
    this.wars.delete(name);
    for (const target of this.warAdjacency.get(name) ?? []) {
      this.warAdjacency.get(target)?.delete(name);
    }
    this.warAdjacency.delete(name);
    for (const key of [...this.warOrigins.keys()]) {
      const [a, b] = key.split('\u0000');
      if (a === name || b === name) this.warOrigins.delete(key);
    }
    for (const map of [this.pacts, this.alliances]) {
      map.delete(name);
      for (const partners of map.values()) partners.delete(name);
    }
    for (const key of [...this.opinions.keys()]) {
      const [a, b] = key.split('\u0000');
      if (a === name || b === name) this.opinions.delete(key);
    }
    for (const key of [...this.relationActions.keys()]) {
      const [a, b] = key.split('\u0000');
      if (a === name || b === name) this.relationActions.delete(key);
    }
  }

  partnerSet(name: string, type: TreatyType): Set<string> {
    const map = type === 'pact' ? this.pacts : this.alliances;
    return new Set(map.get(name) ?? []);
  }

  /** Treaty proposal between any two nations. Used by both the player UI and AI. */
  proposeBetween(proposer: string, target: string, type: TreatyType): ProposalResult {
    if (!proposer) return { ok: false, message: 'NO NATION SELECTED' };
    if (target === proposer) return { ok: false, message: 'CANNOT TREATY YOURSELF' };
    if (this.isAtWar(proposer, target)) return { ok: false, message: 'AT WAR' };

    const label = type === 'pact' ? 'DEFENSIVE PACT' : 'ALLIANCE';
    if (type === 'pact' && this.hasPact(proposer, target)) {
      return { ok: false, message: 'PACT ALREADY SIGNED' };
    }
    if (type === 'alliance' && this.hasAlliance(proposer, target)) {
      return { ok: false, message: 'ALLIANCE ALREADY SIGNED' };
    }

    const limit =
      type === 'alliance' ? MAX_ALLIANCES : MAX_DEFENSIVE_PACTS;
    const limitLabel = type === 'alliance' ? 'ALLIANCE' : 'DEFENSIVE PACT';
    if (this.partnerSet(proposer, type).size >= limit) {
      return {
        ok: false,
        message: `${limitLabel} LIMIT REACHED · MAX ${limit}`,
      };
    }
    if (this.partnerSet(target, type).size >= limit) {
      return {
        ok: false,
        message: `${target.toUpperCase()} AT ${limitLabel} LIMIT · MAX ${limit}`,
      };
    }

    const stats = this.statsBetween(proposer, target);
    const acceptance =
      type === 'pact' ? stats.pactAcceptance : stats.allianceAcceptance;
    if (acceptance < 0) {
      return {
        ok: false,
        message: `${label} REJECTED · ACCEPTANCE ${signed(acceptance)}`,
      };
    }

    if (type === 'alliance') {
      // An alliance supersedes a defensive pact between the same pair.
      this.removeRelation(this.pacts, proposer, target);
      this.addRelation(this.alliances, proposer, target);
    } else if (!this.hasAlliance(proposer, target)) {
      this.addRelation(this.pacts, proposer, target);
    } else {
      return { ok: false, message: 'ALREADY ALLIED' };
    }

    return {
      ok: true,
      message: `${label} SIGNED WITH ${target.toUpperCase()} · ACCEPTANCE ${signed(acceptance)}`,
    };
  }

  propose(target: string, type: TreatyType): ProposalResult {
    if (!this.player) return { ok: false, message: 'NO NATION SELECTED' };
    return this.proposeBetween(this.player, target, type);
  }

  /** Everyone obligated to defend `nation` in a war. */
  defensiveCoalition(nation: string): Set<string> {
    const coalition = new Set<string>();
    for (const partner of this.partnerSet(nation, 'pact')) coalition.add(partner);
    for (const partner of this.partnerSet(nation, 'alliance')) coalition.add(partner);
    return coalition;
  }

  /** Allies who join the player in a war the player starts. */
  offensiveCoalition(): Set<string> {
    return this.player ? this.offensiveCoalitionFor(this.player) : new Set();
  }

  offensiveCoalitionFor(nation: string): Set<string> {
    return this.partnerSet(nation, 'alliance');
  }

  warPreviewBetween(
    attacker: string,
    target: string,
    countries: readonly CountryData[],
  ): WarPreview {
    if (!attacker) {
      return {
        target,
        playerSide: [],
        enemySide: [target],
        uninvolvedCount: countries.length,
        roles: new Map(countries.map((country) => [country.name, 'uninvolved'])),
      };
    }

    const playerAllies = this.offensiveCoalitionFor(attacker);
    playerAllies.delete(target);
    const playerSide = new Set([attacker, ...playerAllies]);

    const targetAllies = this.defensiveCoalition(target);
    targetAllies.delete(attacker);
    targetAllies.delete(target);
    for (const ally of playerAllies) targetAllies.delete(ally);

    const enemySide = new Set([target, ...targetAllies]);
    const roles = new Map<string, WarRole>();
    let uninvolvedCount = 0;

    for (const country of countries) {
      if (country.name === target) {
        roles.set(country.name, 'target');
      } else if (enemySide.has(country.name)) {
        roles.set(country.name, 'enemy');
      } else if (playerSide.has(country.name)) {
        roles.set(country.name, 'ally');
      } else {
        roles.set(country.name, 'uninvolved');
        uninvolvedCount += 1;
      }
    }

    return {
      target,
      playerSide: [...playerSide],
      enemySide: [...enemySide],
      uninvolvedCount,
      roles,
    };
  }

  warPreview(target: string, countries: readonly CountryData[]): WarPreview {
    return this.warPreviewBetween(this.player ?? '', target, countries);
  }

  /**
   * Starts a player offensive war. The defender's defensive coalition joins;
   * the player's alliances are already represented on the player's side.
   */
  declareWarBetween(
    attacker: string,
    target: string,
    countries: readonly CountryData[],
  ): WarDeclaration {
    if (!attacker) throw new Error('No attacking nation selected');
    if (attacker === target) throw new Error('A nation cannot declare war on itself');
    if (this.isAtWar(attacker, target)) {
      throw new Error(`${target} is already at war with ${attacker}`);
    }

    const preview = this.warPreviewBetween(attacker, target, countries);
    this.removeRelation(this.pacts, attacker, target);
    this.removeRelation(this.alliances, attacker, target);

    this.setOpinion(attacker, target, WAR_OPINION_PENALTY);
    this.relationActions.delete(this.opinionKey(attacker, target));
    for (const country of countries) {
      if (country.name === attacker || country.name === target) continue;
      if (this.opinion(country.name, target) >= HIGH_OPINION_THRESHOLD) {
        this.adjustOpinion(country.name, attacker, WAR_OPINION_SPILLOVER);
      }
    }

    for (const ally of preview.playerSide) {
      for (const enemy of preview.enemySide) {
        // Each pair's origin is its own attacker, so coalition fronts advance
        // in the correct direction even when the original declarer is not the
        // nation on that particular front.
        this.addWarPair(ally, enemy, ally);
      }
    }

    if (this.player) {
      if (preview.playerSide.includes(this.player)) {
        for (const enemy of preview.enemySide) {
          if (enemy !== this.player) this.wars.add(enemy);
        }
      } else if (preview.enemySide.includes(this.player)) {
        for (const enemy of preview.playerSide) {
          if (enemy !== this.player) this.wars.add(enemy);
        }
      }
    }

    return {
      attackerSide: preview.playerSide,
      defenderSide: preview.enemySide,
    };
  }

  declareWar(target: string, countries: readonly CountryData[]): Set<string> {
    if (!this.player) throw new Error('No player nation selected');
    this.declareWarBetween(this.player, target, countries);
    return new Set(this.wars);
  }
}
