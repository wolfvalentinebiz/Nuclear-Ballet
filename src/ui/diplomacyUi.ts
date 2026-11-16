import type { WarFront } from '../game/warfare';
import {
  MAX_RELATION_ACTIONS,
  RELATION_ACTION_STEP,
  type DiplomacyStats,
  type RelationActionStatus,
  type TreatyType,
} from '../game/diplomacy';
import { NATURAL_KIND_INFO } from '../geo/natural';

export interface DiplomacyUiElements {
  nationMenu: HTMLElement;
  nationMenuTitle: HTMLElement;
  nationMenuStatus: HTMLElement;
  proposePact: HTMLButtonElement;
  proposeAlliance: HTMLButtonElement;
  declareWar: HTMLButtonElement;
  improveOpinion: HTMLButtonElement;
  harmRelations: HTMLButtonElement;
  nationOpinion: HTMLElement;
  nationPower: HTMLElement;
  nationAcceptance: HTMLElement;
  warWindow: HTMLElement;
  warClose: HTMLButtonElement;
  warCancel: HTMLButtonElement;
  warConfirm: HTMLButtonElement;
  warTargetName: HTMLElement;
  warEnemyList: HTMLElement;
  warPlayerList: HTMLElement;
  warUninvolved: HTMLElement;
  activeWarButton: HTMLButtonElement;
  activeWarCount: HTMLElement;
  activeWarWindow: HTMLElement;
  activeWarClose: HTMLButtonElement;
  activeWarTabs: HTMLElement;
  activeWarPanels: HTMLElement;
  activeWarNote: HTMLElement;
  toast: HTMLElement;
}

export interface DiplomacyUiCallbacks {
  onPropose: (type: TreatyType) => void;
  onImproveOpinion: () => void;
  onHarmRelations: () => void;
  onDeclare: () => void;
  onConfirmWar: () => void;
  onCancelWar: () => void;
  onNavalInvasion: (enemy: string) => void;
}

export interface ContextOptions extends DiplomacyStats {
  hasPact: boolean;
  hasAlliance: boolean;
  atWar: boolean;
  isSelf: boolean;
  relationAction: RelationActionStatus | null;
}

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

export class DiplomacyUi {
  private toastTimer = 0;
  private contextSelf = false;
  private selectedFront: string | null = null;
  private nextWarTabId = 1;
  private readonly frontRows = new Map<string, {
    tab: HTMLButtonElement;
    tabLabel: HTMLElement;
    tabScore: HTMLElement;
    panel: HTMLElement;
    status: HTMLElement;
    score: HTMLElement;
    detail: HTMLElement;
    terrain: HTMLElement;
    naval: HTMLButtonElement;
  }>();

  constructor(
    private readonly elements: DiplomacyUiElements,
    private readonly callbacks: DiplomacyUiCallbacks,
  ) {
    elements.proposePact.addEventListener('click', () => this.callbacks.onPropose('pact'));
    elements.proposeAlliance.addEventListener('click', () => this.callbacks.onPropose('alliance'));
    elements.declareWar.addEventListener('click', () => this.callbacks.onDeclare());
    elements.improveOpinion.addEventListener('click', () =>
      this.callbacks.onImproveOpinion(),
    );
    elements.harmRelations.addEventListener('click', () =>
      this.callbacks.onHarmRelations(),
    );
    elements.improveOpinion.textContent = 'IMPROVE RELATIONS';
    elements.harmRelations.textContent = 'HARM RELATIONS';
    elements.improveOpinion.title = `Raises opinion by ${RELATION_ACTION_STEP} per day for up to ${MAX_RELATION_ACTIONS} days.`;
    elements.harmRelations.title = `Lowers opinion by ${RELATION_ACTION_STEP} per day for up to ${MAX_RELATION_ACTIONS} days.`;
    elements.warClose.addEventListener('click', () => this.callbacks.onCancelWar());
    elements.warCancel.addEventListener('click', () => this.callbacks.onCancelWar());
    elements.warConfirm.addEventListener('click', () => this.callbacks.onConfirmWar());
    elements.activeWarClose.addEventListener('click', () =>
      this.closeActiveWarScreen(),
    );
  }

  showContext(
    nation: string,
    x: number,
    y: number,
    options: ContextOptions,
  ): void {
    this.elements.nationMenu.hidden = false;
    this.contextSelf = options.isSelf;
    this.applyMetrics(options);
    this.elements.nationMenuTitle.textContent = nation.toUpperCase();
    this.elements.nationMenuStatus.textContent = options.atWar
      ? 'AT WAR'
      : options.isSelf
        ? 'YOUR NATION'
        : options.hasAlliance
          ? 'ALLIANCE'
          : options.hasPact
            ? 'DEFENSIVE PACT'
            : 'NO TREATY';

    this.elements.proposePact.disabled =
      options.isSelf || options.atWar || options.hasPact || options.hasAlliance;
    this.elements.proposePact.textContent = options.hasAlliance
      ? 'DEFENSIVE PACT · SUPERSEDED'
      : options.hasPact
        ? 'DEFENSIVE PACT · SIGNED'
        : 'DEFENSIVE PACT';

    this.elements.proposeAlliance.disabled =
      options.isSelf || options.atWar || options.hasAlliance;
    this.elements.proposeAlliance.textContent = options.hasAlliance
      ? 'ALLIANCE · SIGNED'
      : 'ALLIANCE';

    this.elements.declareWar.disabled = options.isSelf || options.atWar;
    this.elements.declareWar.textContent = options.atWar ? 'AT WAR' : 'DECLARE WAR';

    this.applyRelationActions(options, options.relationAction);

    const width = this.elements.nationMenu.offsetWidth;
    const height = this.elements.nationMenu.offsetHeight;
    this.elements.nationMenu.style.left = `${Math.max(
      10,
      Math.min(STAGE_WIDTH - width - 14, x),
    )}px`;
    this.elements.nationMenu.style.top = `${Math.max(
      10,
      Math.min(STAGE_HEIGHT - height - 14, y),
    )}px`;
  }

  get contextOpen(): boolean {
    return !this.elements.nationMenu.hidden;
  }

  updateContextMetrics(
    stats: DiplomacyStats,
    relationAction: RelationActionStatus | null,
  ): void {
    this.applyMetrics(stats);
    this.applyRelationActions(stats, relationAction);
  }

  private applyRelationActions(
    stats: Pick<DiplomacyStats, 'opinion'>,
    relationAction: RelationActionStatus | null,
  ): void {
    const improving = relationAction?.direction === 'improve';
    const harming = relationAction?.direction === 'harm';
    const improve = this.elements.improveOpinion;
    const harm = this.elements.harmRelations;

    improve.textContent = improving
      ? 'CANCEL IMPROVE RELATIONS'
      : 'IMPROVE RELATIONS';
    harm.textContent = harming
      ? 'CANCEL HARM RELATIONS'
      : 'HARM RELATIONS';
    improve.disabled = this.contextSelf || (!improving && stats.opinion >= 100);
    harm.disabled = this.contextSelf || (!harming && stats.opinion <= -100);
    improve.title = improving
      ? `Cancel the remaining ${relationAction.remaining} daily improve action${relationAction.remaining === 1 ? '' : 's'}.`
      : `Raises opinion by ${RELATION_ACTION_STEP} per day for up to ${MAX_RELATION_ACTIONS} days.`;
    harm.title = harming
      ? `Cancel the remaining ${relationAction.remaining} daily harm action${relationAction.remaining === 1 ? '' : 's'}.`
      : `Lowers opinion by ${RELATION_ACTION_STEP} per day for up to ${MAX_RELATION_ACTIONS} days.`;
  }

  private applyMetrics(stats: DiplomacyStats): void {
    this.elements.nationOpinion.textContent = formatSigned(stats.opinion);
    this.elements.nationOpinion.classList.toggle(
      'nation-menu__metric-value--positive',
      stats.opinion > 0,
    );
    this.elements.nationOpinion.classList.toggle(
      'nation-menu__metric-value--negative',
      stats.opinion < 0,
    );

    this.elements.nationPower.textContent =
      `${stats.powerRatio.toFixed(2)}× · ${formatSigned(stats.strengthModifier)}`;
    this.elements.nationAcceptance.textContent =
      `PACT ${formatSigned(stats.pactAcceptance)} · ALLIANCE ${formatSigned(stats.allianceAcceptance)}`;
    this.elements.nationAcceptance.classList.toggle(
      'nation-menu__metric-value--negative',
      stats.pactAcceptance < 0 || stats.allianceAcceptance < 0,
    );
    if (
      stats.pactAcceptance >= 0 &&
      stats.allianceAcceptance >= 0
    ) {
      this.elements.nationAcceptance.classList.add(
        'nation-menu__metric-value--positive',
      );
    } else {
      this.elements.nationAcceptance.classList.remove(
        'nation-menu__metric-value--positive',
      );
    }
  }

  hideContext(): void {
    this.elements.nationMenu.hidden = true;
  }

  setContextStatus(message: string): void {
    this.elements.nationMenuStatus.textContent = message;
  }

  openWarScreen(
    target: string,
    enemySide: readonly string[],
    playerSide: readonly string[],
    uninvolvedCount: number,
    playerName = '',
  ): void {
    this.elements.warWindow.hidden = false;
    this.elements.warTargetName.textContent = target.toUpperCase();
    this.renderWarNames(
      this.elements.warEnemyList,
      enemySide,
      target,
      '',
      'NO DEFENSIVE PARTNERS',
    );
    this.renderWarNames(
      this.elements.warPlayerList,
      playerSide,
      '',
      playerName,
      'NO ALLIES',
    );
    this.elements.warUninvolved.textContent = `${uninvolvedCount.toLocaleString('en-US')} NATIONS`;
  }

  private renderWarNames(
    element: HTMLElement,
    names: readonly string[],
    targetName: string,
    playerName: string,
    emptyText: string,
  ): void {
    element.replaceChildren();
    if (names.length === 0) {
      element.textContent = emptyText;
      return;
    }

    for (const name of names) {
      const chip = document.createElement('span');
      chip.className = 'war-name';
      if (name === targetName) chip.classList.add('war-name--target');
      else if (name === playerName) chip.classList.add('war-name--self');
      else if (targetName) chip.classList.add('war-name--enemy');
      else chip.classList.add('war-name--ally');
      chip.textContent =
        name === playerName ? `${name.toUpperCase()} (YOU)` : name.toUpperCase();
      element.append(chip);
    }
  }

  get warScreenOpen(): boolean {
    return !this.elements.warWindow.hidden;
  }

  closeWarScreen(): void {
    this.elements.warWindow.hidden = true;
  }

  renderWarFronts(
    fronts: readonly WarFront[],
    deploymentCap: number,
    landingShips: number,
  ): void {
    const hasFronts = fronts.length > 0;
    this.elements.activeWarButton.hidden = !hasFronts;
    this.elements.activeWarCount.textContent = String(fronts.length);
    this.elements.activeWarButton.setAttribute(
      'aria-label',
      hasFronts
        ? `Open active wars, ${fronts.length} active`
        : 'No active wars',
    );

    if (!hasFronts) {
      this.closeActiveWarScreen();
      this.elements.activeWarTabs.replaceChildren();
      this.elements.activeWarPanels.replaceChildren();
      this.elements.activeWarNote.textContent = '';
      this.frontRows.clear();
      this.selectedFront = null;
      return;
    }

    const active = new Set(fronts.map((front) => front.enemy));
    for (const [enemy, entry] of this.frontRows) {
      if (active.has(enemy)) continue;
      entry.tab.remove();
      entry.panel.remove();
      this.frontRows.delete(enemy);
    }

    if (!this.selectedFront || !active.has(this.selectedFront)) {
      this.selectedFront = fronts[0]?.enemy ?? null;
    }

    for (const front of fronts) {
      const entry = this.getFrontRow(front.enemy);
      entry.tabLabel.textContent = front.enemy.toUpperCase();
      entry.tabScore.textContent = `${Math.max(0, front.warScore).toFixed(1)}%`;
      const needsNaval = front.navalRequired && !front.navalInvaded;
      entry.status.className = needsNaval && !front.hasLandAccess
        ? 'war-front__progress war-front__progress--alert'
        : front.progress < 0
          ? 'war-front__progress war-front__progress--negative'
          : 'war-front__progress';
      entry.status.textContent = needsNaval && !front.hasLandAccess
        ? 'NAVAL INVASION REQUIRED'
        : front.progress < 0
          ? 'ENEMY ADVANCING'
          : front.breakthrough
            ? front.navalRequired
              ? 'MAINLAND OCCUPIED'
              : 'COUNTRY OCCUPIED'
            : front.navalRequired && front.progress >= 100 && front.hasLandAccess
              ? 'MAINLAND OCCUPIED'
            : front.hasLandAccess || front.navalInvaded
              ? `OCCUPIED ${Math.max(0, front.occupiedPercent).toFixed(1)}%`
              : 'NO LAND ROUTE';

      const secondary =
        front.secondaryCapitalsTotal > 0
          ? `SECONDARY ${front.secondaryCapitalsOccupied}/${front.secondaryCapitalsTotal} · `
          : '';
      entry.score.textContent = `WAR SCORE ${Math.max(0, front.warScore).toFixed(1)}% · ${front.capitalOccupied ? 'CAPITAL CAPTURED' : 'CAPITAL HELD'} · ${secondary}SURRENDER AT ${front.surrenderThreshold}%`;
      entry.score.classList.toggle(
        'war-front__score--capital',
        front.capitalOccupied,
      );

      if (front.hasLandAccess) {
        const ally = front.allyRate > 0
          ? ` · ALLIES +${Math.round(front.allyRate).toLocaleString('en-US')}`
          : '';
        entry.detail.textContent = `YOUR ${Math.round(front.playerRate).toLocaleString('en-US')}${ally} / ENEMY ${Math.round(front.enemyRate).toLocaleString('en-US')} · NET ${front.netRate >= 0 ? '+' : ''}${Math.round(front.netRate).toLocaleString('en-US')}/D`;
      } else if (front.navalInvaded) {
        entry.detail.textContent = 'BEACHHEAD ESTABLISHED · ADVANCING INLAND';
      } else if (front.navalComponents > 0) {
        entry.detail.textContent = 'NO CONTIGUOUS LAND ROUTE · USE LANDING SHIPS';
      } else {
        entry.detail.textContent = 'NO LAND ROUTE TO THIS TERRITORY';
      }

      entry.terrain.textContent = front.terrainMultiplier > 1 && front.terrainKind
        ? `${NATURAL_KIND_INFO[front.terrainKind].label} · DEFENSE ×${front.terrainMultiplier}`
        : '';

      const showNaval = front.navalRequired && !front.navalInvaded;
      entry.naval.hidden = !showNaval;
      if (showNaval) {
        entry.naval.disabled = landingShips < 1;
        entry.naval.textContent = landingShips > 0
          ? `LAUNCH NAVAL INVASION · ${front.navalComponents} LANDING${front.navalComponents === 1 ? '' : 'S'}`
          : 'NAVAL INVASION · NEED LANDING SHIP';
      } else {
        entry.naval.textContent = '';
      }
      entry.naval.dataset.enemy = front.enemy;
    }

    this.elements.activeWarNote.textContent =
      `DEPLOYMENT CAP ${Math.round(deploymentCap).toLocaleString('en-US')} / DAY · LANDING SHIPS ${landingShips}`;
    this.selectFront(this.selectedFront);
  }

  openActiveWarScreen(): void {
    if (this.frontRows.size === 0) return;
    this.elements.activeWarWindow.hidden = false;
    if (!this.selectedFront) {
      this.selectedFront = this.frontRows.keys().next().value ?? null;
    }
    this.selectFront(this.selectedFront);
  }

  closeActiveWarScreen(): void {
    this.elements.activeWarWindow.hidden = true;
  }

  get activeWarScreenOpen(): boolean {
    return !this.elements.activeWarWindow.hidden;
  }

  private selectFront(enemy: string | null): void {
    this.selectedFront = enemy;
    for (const [name, entry] of this.frontRows) {
      const selected = name === enemy;
      entry.tab.setAttribute('aria-selected', String(selected));
      entry.tab.tabIndex = selected ? 0 : -1;
      entry.panel.hidden = !selected;
    }
  }

  private getFrontRow(enemy: string): {
    tab: HTMLButtonElement;
    tabLabel: HTMLElement;
    tabScore: HTMLElement;
    panel: HTMLElement;
    status: HTMLElement;
    score: HTMLElement;
    detail: HTMLElement;
    terrain: HTMLElement;
    naval: HTMLButtonElement;
  } {
    const existing = this.frontRows.get(enemy);
    if (existing) return existing;

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'active-war-tab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.tabIndex = -1;
    const tabLabel = document.createElement('span');
    tabLabel.className = 'active-war-tab__label';
    const tabScore = document.createElement('span');
    tabScore.className = 'active-war-tab__score';
    tab.append(tabLabel, tabScore);

    const panel = document.createElement('section');
    panel.className = 'war-front';
    panel.setAttribute('role', 'tabpanel');
    panel.hidden = true;
    const tabId = `active-war-tab-${this.nextWarTabId++}`;
    tab.id = tabId;
    panel.id = `${tabId}-panel`;
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('aria-labelledby', tab.id);

    const heading = document.createElement('div');
    heading.className = 'war-front__heading';
    const name = document.createElement('span');
    name.textContent = enemy.toUpperCase();
    const status = document.createElement('span');
    status.className = 'war-front__progress';
    heading.append(name, status);

    const score = document.createElement('div');
    score.className = 'war-front__score';
    const detail = document.createElement('div');
    detail.className = 'war-front__detail';
    const terrain = document.createElement('div');
    terrain.className = 'war-front__terrain';
    const naval = document.createElement('button');
    naval.type = 'button';
    naval.className = 'war-front__naval';
    naval.hidden = true;
    naval.addEventListener('click', () => {
      const target = naval.dataset.enemy;
      if (target) this.callbacks.onNavalInvasion(target);
    });

    panel.append(heading, score, detail, terrain, naval);
    this.elements.activeWarTabs.append(tab);
    this.elements.activeWarPanels.append(panel);
    tab.addEventListener('click', () => this.selectFront(enemy));
    const entry = {
      tab,
      tabLabel,
      tabScore,
      panel,
      status,
      score,
      detail,
      terrain,
      naval,
    };
    this.frontRows.set(enemy, entry);
    return entry;
  }

  toast(message: string): void {
    window.clearTimeout(this.toastTimer);
    this.elements.toast.textContent = message;
    this.elements.toast.hidden = false;
    this.toastTimer = window.setTimeout(() => {
      this.elements.toast.hidden = true;
    }, 3_200);
  }
}
