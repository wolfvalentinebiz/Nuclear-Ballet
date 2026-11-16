import {
  PRODUCTION_TABS,
  isICBM,
  itemsForTab,
  productionTabInfo,
  type ProductionItem,
  type ProductionTab,
} from '../game/arsenal';
import type { ProductionSystem } from '../game/production';
import type { ResearchState } from '../game/research';
import type { NationBalance } from '../economy/resources';

export interface ProductionPanelElements {
  window: HTMLElement;
  close: HTMLButtonElement;
  tabs: HTMLElement;
  factoryLine: HTMLElement;
  items: HTMLElement;
  queue: HTMLElement;
  inventory: HTMLElement;
  message: HTMLElement;
}

interface RenderedQueueRow {
  status: HTMLElement;
  fill: HTMLElement;
  repeat: HTMLInputElement;
}

export class ProductionPanel {
  private tab: ProductionTab = 'nuclear';
  private message = '';
  private renderedQueueSignature = '';
  private readonly queueRows = new Map<number, RenderedQueueRow>();

  constructor(
    private readonly elements: ProductionPanelElements,
    private readonly production: ProductionSystem,
    private readonly research: ResearchState,
    private readonly getBalance: () => NationBalance,
  ) {
    elements.close.addEventListener('click', () => this.close());
    elements.tabs.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>('[data-production-tab]');
      if (!button) return;
      const tab = button.dataset.productionTab;
      if (tab === 'nuclear' || tab === 'dockyard' || tab === 'space') {
        this.tab = tab;
        this.message = '';
        this.render();
      }
    });
    this.renderTabs();
  }

  get isOpen(): boolean {
    return !this.elements.window.hidden;
  }

  open(tab: ProductionTab = 'nuclear'): void {
    this.tab = tab;
    this.message = '';
    this.elements.window.hidden = false;
    this.render();
  }

  close(): void {
    this.elements.window.hidden = true;
  }

  render(): void {
    if (!this.isOpen) return;
    this.renderTabs();
    this.renderCatalog();
    this.update();
  }

  /** Refresh only the live sections so catalogue buttons stay stable under the pointer. */
  update(): void {
    if (!this.isOpen) return;
    const info = productionTabInfo(this.tab);
    const view = this.production.queueView(this.tab);
    this.elements.factoryLine.textContent = `${info.factory.toUpperCase()} · ${view.factoryCount} BUILT · ${view.activeCount} ACTIVE`;
    this.renderQueue(info.factory, view.entries.length, view.factoryCount, view.entries);

    const balance = this.getBalance();
    const inventoryParts: string[] = [];
    if (this.tab === 'nuclear') {
      inventoryParts.push(`WARHEADS ${balance.nukes}`);
      inventoryParts.push(`ICBMS ${balance.icbms}`);
    } else if (this.tab === 'dockyard') {
      inventoryParts.push(`LANDING SHIPS ${balance.landingShips}`);
      inventoryParts.push(`SUBMARINES ${balance.submarines}`);
    } else {
      inventoryParts.push(`ROCKETS ${balance.rockets}`);
      inventoryParts.push(`SATELLITES ${balance.satellites}`);
    }
    this.elements.inventory.textContent = inventoryParts.join('  /  ');
    this.elements.message.textContent = this.message;
  }

  private renderCatalog(): void {
    this.elements.items.replaceChildren();
    const items = itemsForTab(this.tab);

    if (this.tab === 'nuclear') {
      this.elements.items.classList.add('production-items--split');
      const groups = [
        {
          title: 'ATOMIC · 1 MT AND BELOW',
          items: items.filter((item) => !isICBM(item)),
        },
        {
          title: 'ICBM · ABOVE 1 MT',
          items: items.filter(isICBM),
        },
      ];
      for (const group of groups) {
        const section = document.createElement('section');
        section.className = 'production-group';
        const title = document.createElement('h4');
        title.className = 'production-group__title';
        title.textContent = group.title;
        section.append(title);
        for (const item of group.items) {
          section.append(this.createCatalogButton(item));
        }
        this.elements.items.append(section);
      }
      return;
    }

    this.elements.items.classList.remove('production-items--split');
    for (const item of items) {
      this.elements.items.append(this.createCatalogButton(item));
    }
  }

  private createCatalogButton(item: ProductionItem): HTMLButtonElement {
    const info = productionTabInfo(this.tab);
    const unlocked = this.research.isUnlocked(item.techId);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'production-item';
    button.disabled = !unlocked;
    if (!unlocked) button.classList.add('production-item--locked');
    button.title = unlocked ? item.description : 'Research this warhead first.';

    const heading = document.createElement('span');
    heading.className = 'production-item__heading';
    heading.textContent = `${item.name} · ${item.yieldLabel}`;

    const meta = document.createElement('span');
    meta.className = 'production-item__meta';
    if (!unlocked) {
      meta.textContent = `LOCKED · ${item.techId?.replace(/-/g, ' ').toUpperCase() ?? 'RESEARCH'}`;
    } else if (this.tab === 'nuclear') {
      meta.textContent = `${item.productionDays.toFixed(item.productionDays % 1 === 0 ? 0 : 1)} D · ${(item.rangeKm ?? 0).toLocaleString('en-US')} KM`;
    } else {
      meta.textContent = `${item.productionDays.toFixed(item.productionDays % 1 === 0 ? 0 : 1)} D · ${info.inventoryLabel}`;
    }

    button.append(heading, meta);
    if (unlocked) {
      button.addEventListener('click', () => {
        const result = this.production.enqueue(this.tab, item.id);
        this.message = result.ok
          ? `${item.yieldLabel} ${item.name} ADDED TO QUEUE`
          : result.message;
        this.update();
      });
    }
    return button;
  }

  private renderQueue(
    factory: string,
    count: number,
    factoryCount: number,
    entries: ReturnType<ProductionSystem['queueView']>['entries'],
  ): void {
    const signature =
      count === 0
        ? `empty:${factoryCount}`
        : entries.map((entry) => entry.order.id).join(',');

    if (signature !== this.renderedQueueSignature) {
      this.renderedQueueSignature = signature;
      this.queueRows.clear();
      this.elements.queue.replaceChildren();

      if (count === 0) {
        const empty = document.createElement('p');
        empty.className = 'production-empty';
        empty.textContent = factoryCount === 0
          ? `QUEUE EMPTY · BUILD A ${factory.toUpperCase()}`
          : 'QUEUE EMPTY';
        this.elements.queue.append(empty);
        return;
      }

      for (const entry of entries) {
        const row = document.createElement('div');
        row.className = 'queue-row';

        const heading = document.createElement('div');
        heading.className = 'queue-row__heading';
        const name = document.createElement('span');
        name.textContent = `${entry.item.name} · ${entry.item.yieldLabel}`;
        const status = document.createElement('span');
        const track = document.createElement('div');
        track.className = 'queue-row__track';
        const fill = document.createElement('span');
        track.append(fill);

        const repeatLabel = document.createElement('label');
        repeatLabel.className = 'queue-row__repeat';
        const repeat = document.createElement('input');
        repeat.type = 'checkbox';
        repeat.checked = entry.order.repeat;
        repeat.addEventListener('change', () => {
          this.production.setRepeat(entry.order.id, repeat.checked);
        });
        const repeatText = document.createElement('span');
        repeatText.textContent = 'DO FOREVER';
        repeatLabel.append(repeat, repeatText);

        heading.append(name, status);
        row.append(heading, track, repeatLabel);
        this.elements.queue.append(row);
        this.queueRows.set(entry.order.id, { status, fill, repeat });
      }
    }

    for (const entry of entries) {
      const row = this.queueRows.get(entry.order.id);
      if (!row) continue;
      row.status.className = entry.active
        ? 'queue-row__status'
        : 'queue-row__status queue-row__status--waiting';
      row.status.textContent = entry.active
        ? `${Math.round(entry.progress * 100)}% · ${entry.remainingDays.toFixed(1)} D`
        : 'WAITING FOR FACTORY';
      row.fill.style.width = `${Math.round(entry.progress * 100)}%`;
      row.repeat.checked = entry.order.repeat;
    }
  }

  private renderTabs(): void {
    this.elements.tabs.replaceChildren();
    for (const tab of PRODUCTION_TABS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'production-tab';
      button.dataset.productionTab = tab.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(tab.id === this.tab));
      button.textContent = tab.label;
      this.elements.tabs.append(button);
    }
  }
}
