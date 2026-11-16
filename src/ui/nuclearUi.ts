import type { WarheadStock } from '../game/nuclear';

export interface NukePlan {
  id: string;
  label: string;
  color: string;
  colorHex: number;
}

/** Rainbow colors except red, plus black, white, and grey. */
export const NUKE_PLANS: readonly NukePlan[] = [
  { id: 'orange', label: 'ORANGE', color: '#ff9f2f', colorHex: 0xff9f2f },
  { id: 'yellow', label: 'YELLOW', color: '#ffe45c', colorHex: 0xffe45c },
  { id: 'green', label: 'GREEN', color: '#57e389', colorHex: 0x57e389 },
  { id: 'blue', label: 'BLUE', color: '#47a7ff', colorHex: 0x47a7ff },
  { id: 'indigo', label: 'INDIGO', color: '#7370ff', colorHex: 0x7370ff },
  { id: 'violet', label: 'VIOLET', color: '#c16bff', colorHex: 0xc16bff },
  { id: 'black', label: 'BLACK', color: '#1b1b1b', colorHex: 0x1b1b1b },
  { id: 'white', label: 'WHITE', color: '#f4f0e6', colorHex: 0xf4f0e6 },
  { id: 'grey', label: 'GREY', color: '#9098a1', colorHex: 0x9098a1 },
];

export interface NuclearUiElements {
  controls: HTMLElement;
  files: HTMLElement;
  menu: HTMLElement;
  menuList: HTMLElement;
  menuStatus: HTMLElement;
  platformStatus: HTMLElement;
}

export interface NuclearUiCallbacks {
  onAddTarget: (plan: NukePlan) => void;
  onRemoveTarget: (plan: NukePlan) => void;
  onDetonate: (plan: NukePlan) => void;
  onCancelQueued: (plan: NukePlan) => void;
  onSelectWarhead: (stock: WarheadStock) => void;
}

interface PlanControls {
  file: HTMLElement;
  add: HTMLButtonElement;
  remove: HTMLButtonElement;
  detonate: HTMLButtonElement;
  cancel: HTMLButtonElement;
  count: HTMLElement;
}

export class NuclearUi {
  private readonly planControls = new Map<string, PlanControls>();
  private stocks: WarheadStock[] = [];
  private targetingPlanId: string | null = null;

  constructor(
    private readonly elements: NuclearUiElements,
    callbacks: NuclearUiCallbacks,
  ) {
    this.buildPlanFiles(callbacks);
    elements.menuList.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const row = target.closest<HTMLButtonElement>('[data-warhead-id]');
      if (!row) return;
      const stock = this.stocks.find((entry) => entry.item.id === row.dataset.warheadId);
      if (!stock || stock.count <= 0) return;
      this.closeMenu();
      callbacks.onSelectWarhead(stock);
    });
    document.addEventListener('pointerdown', (event) => {
      if (!this.menuOpen) return;
      const target = event.target as Node | null;
      if (
        target &&
        (elements.menu.contains(target) || elements.files.contains(target))
      ) {
        return;
      }
      this.closeMenu();
    });
  }

  private buildPlanFiles(callbacks: NuclearUiCallbacks): void {
    this.elements.files.replaceChildren();
    this.planControls.clear();

    for (const plan of NUKE_PLANS) {
      const file = document.createElement('article');
      file.className = 'nuke-file';
      file.dataset.planId = plan.id;
      file.style.setProperty('--plan-color', plan.color);

      const head = document.createElement('div');
      head.className = 'nuke-file__head';

      const name = document.createElement('span');
      name.className = 'nuke-file__name';
      name.textContent = plan.label;

      const controls = document.createElement('div');
      controls.className = 'nuke-file__controls';

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'nuke-file__cancel';
      cancel.textContent = '×';
      cancel.title = `Cancel queued launches in the ${plan.label.toLowerCase()} war plan`;
      cancel.setAttribute(
        'aria-label',
        `Cancel queued launches in the ${plan.label} war plan`,
      );
      cancel.hidden = true;
      cancel.addEventListener('click', () => callbacks.onCancelQueued(plan));

      const detonate = document.createElement('button');
      detonate.type = 'button';
      detonate.className = 'nuke-file__detonate';
      detonate.textContent = 'DETONATE';
      detonate.title = `Detonate the ${plan.label.toLowerCase()} war plan`;
      detonate.setAttribute(
        'aria-label',
        `Detonate all targets in the ${plan.label} war plan`,
      );
      detonate.disabled = true;
      detonate.addEventListener('click', () => callbacks.onDetonate(plan));

      controls.append(cancel, detonate);
      head.append(name, controls);

      const body = document.createElement('div');
      body.className = 'nuke-file__body';

      const count = document.createElement('span');
      count.className = 'nuke-file__count';
      count.textContent = 'NO TARGETS';

      const actions = document.createElement('div');
      actions.className = 'nuke-file__actions';

      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'nuke-file__add';
      add.textContent = '+ ADD';
      add.title = `Add a target to the ${plan.label.toLowerCase()} war plan`;
      add.setAttribute('aria-label', `Add target to ${plan.label} plan`);
      add.setAttribute('aria-pressed', 'false');
      add.addEventListener('click', () => callbacks.onAddTarget(plan));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'nuke-file__remove';
      remove.textContent = '− SUB';
      remove.title = `Remove the last target from the ${plan.label.toLowerCase()} war plan`;
      remove.setAttribute('aria-label', `Remove last target from ${plan.label} plan`);
      remove.addEventListener('click', () => callbacks.onRemoveTarget(plan));

      actions.append(add, remove);
      body.append(count, actions);
      file.append(head, body);
      this.elements.files.append(file);
      this.planControls.set(plan.id, {
        file,
        add,
        remove,
        detonate,
        cancel,
        count,
      });
    }
  }

  get menuOpen(): boolean {
    return !this.elements.menu.hidden;
  }

  setVisible(visible: boolean): void {
    this.elements.controls.hidden = !visible;
    if (!visible) {
      this.closeMenu();
      this.setTargeting(null);
    }
  }

  setTargeting(planId: string | null): void {
    this.targetingPlanId = planId;
    for (const [id, controls] of this.planControls) {
      const active = id === planId;
      controls.add.classList.toggle('nuke-file__add--active', active);
      controls.add.setAttribute('aria-pressed', String(active));
      controls.file.classList.toggle('nuke-file--targeting', active);
    }
    document.body.classList.toggle('nuke-targeting', planId !== null);
  }

  setPlanCounts(
    counts: ReadonlyMap<string, number>,
    queuedCounts?: ReadonlyMap<string, number>,
  ): void {
    for (const [id, controls] of this.planControls) {
      const count = counts.get(id) ?? 0;
      const queued = queuedCounts?.get(id) ?? 0;
      controls.count.textContent =
        count > 0
          ? `${count} TARGET${count === 1 ? '' : 'S'}`
          : queued > 0
            ? `${queued} QUEUED`
            : 'NO TARGETS';
      controls.detonate.disabled = count === 0;
      controls.remove.disabled = count === 0;
      controls.cancel.hidden = queued === 0;
      controls.file.classList.toggle('nuke-file--armed', count > 0);
      controls.file.classList.toggle('nuke-file--queued', queued > 0);
      controls.file.classList.toggle(
        'nuke-file--targeting',
        id === this.targetingPlanId,
      );
    }
  }

  setPlatformStatus(message: string, cooling = false): void {
    this.elements.platformStatus.textContent = message;
    this.elements.platformStatus.classList.toggle(
      'nuke-platform-status--cooling',
      cooling,
    );
  }

  toggleMenu(stocks: WarheadStock[]): void {
    if (this.menuOpen) {
      this.closeMenu();
      return;
    }
    this.openMenu(stocks);
  }

  openMenu(stocks: WarheadStock[]): void {
    const available = stocks.filter((stock) => stock.count > 0);
    this.stocks = available;
    this.elements.menuList.replaceChildren();
    const total = available.reduce((sum, stock) => sum + stock.count, 0);
    const unlimited = available.some((stock) => stock.count >= 9_999);
    this.elements.menuStatus.textContent =
      total === 0
        ? 'NO COMPLETED WARHEADS · PRODUCE ONE FIRST'
        : unlimited
          ? 'UNLIMITED WARHEADS AVAILABLE'
          : `${total} COMPLETED WARHEAD${total === 1 ? '' : 'S'} · SELECT ONE`;

    for (const stock of available) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'nuke-menu__row';
      row.dataset.warheadId = stock.item.id;
      row.disabled = stock.count <= 0;
      row.setAttribute('role', 'menuitem');

      const name = document.createElement('span');
      name.className = 'nuke-menu__name';
      name.textContent = `${stock.item.name} · ${stock.item.yieldLabel}`;

      const range = document.createElement('span');
      range.className = 'nuke-menu__range';
      range.textContent = `${(stock.item.rangeKm ?? 0).toLocaleString('en-US')} KM`;

      const count = document.createElement('span');
      count.className = 'nuke-menu__count';
      count.textContent = stock.count >= 9_999 ? '∞' : `×${stock.count}`;

      row.append(name, range, count);
      this.elements.menuList.append(row);
    }

    this.elements.menu.hidden = false;
  }

  closeMenu(): void {
    this.elements.menu.hidden = true;
  }
}
