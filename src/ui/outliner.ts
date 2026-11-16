import { PRODUCTION_TABS, type ProductionTab } from '../game/arsenal';
import type { ConstructionSystem } from '../game/construction';
import {
  MAX_RELATION_ACTIONS,
  RELATION_ACTION_STEP,
  type DiplomacySystem,
} from '../game/diplomacy';
import type { ProductionSystem } from '../game/production';

interface OutlinerSection {
  details: HTMLDetailsElement;
  body: HTMLElement;
  count: HTMLElement;
}

type UnitTab = ProductionTab;

/**
 * Right-hand production outliner. Sections are created once so the native
 * <details> open/closed state survives the twice-per-second live refresh.
 */
export class Outliner {
  private readonly unitSections = new Map<UnitTab, OutlinerSection>();
  private readonly buildingSection: OutlinerSection;
  private readonly diplomacySection: OutlinerSection;

  constructor(
    private readonly root: HTMLElement,
    private readonly production: ProductionSystem,
    private readonly construction: ConstructionSystem,
    private readonly diplomacy: DiplomacySystem,
    private readonly getNation: () => string | null,
  ) {
    const heading = document.createElement('div');
    heading.className = 'outliner__heading';
    heading.textContent = 'OUTLINER';

    const scroll = document.createElement('div');
    scroll.className = 'outliner__scroll';

    this.diplomacySection = this.createSection('diplomacy', 'DIPLOMACY');
    scroll.append(this.diplomacySection.details);

    for (const tab of PRODUCTION_TABS) {
      const section = this.createSection(tab.id, tab.label);
      this.unitSections.set(tab.id, section);
      scroll.append(section.details);
    }

    this.buildingSection = this.createSection('buildings', 'BUILDINGS');
    scroll.append(this.buildingSection.details);

    this.root.replaceChildren(heading, scroll);
    this.update();
  }

  private createSection(key: string, label: string): OutlinerSection {
    const details = document.createElement('details');
    details.className = 'outliner__section';
    details.dataset.outlinerSection = key;
    details.open = true;

    const summary = document.createElement('summary');
    summary.className = 'outliner__summary';

    const title = document.createElement('span');
    title.className = 'outliner__section-title';
    title.textContent = label;

    const count = document.createElement('span');
    count.className = 'outliner__count';
    count.textContent = '0';

    const body = document.createElement('div');
    body.className = 'outliner__body';
    summary.append(title, count);
    details.append(summary, body);
    return { details, body, count };
  }

  update(): void {
    const nation = this.getNation();
    const actions = nation ? this.diplomacy.activeRelationActions(nation) : [];
    this.diplomacySection.count.textContent = String(actions.length);
    if (actions.length === 0) {
      this.diplomacySection.body.replaceChildren(
        this.emptyRow('NO ACTIVE DIPLOMATIC ACTIONS'),
      );
    } else {
      this.diplomacySection.body.replaceChildren(
        ...actions.map((action) => {
          const improving = action.direction === 'improve';
          return this.createRow(
            `${action.target.toUpperCase()} · ${improving ? 'IMPROVE' : 'HARM'} RELATIONS`,
            `${improving ? '+' : '-'}${RELATION_ACTION_STEP}/DAY · ${action.remaining} D`,
            (MAX_RELATION_ACTIONS - action.remaining) / MAX_RELATION_ACTIONS,
            true,
          );
        }),
      );
    }

    for (const tab of PRODUCTION_TABS) {
      const section = this.unitSections.get(tab.id);
      if (!section) continue;
      const view = this.production.queueView(tab.id);
      section.count.textContent = String(view.entries.length);

      if (view.entries.length === 0) {
        section.body.replaceChildren(this.emptyRow('NO UNITS IN PRODUCTION'));
        continue;
      }

      const rows: HTMLElement[] = [];
      for (const entry of view.entries) {
        const status = entry.active
          ? `${Math.round(entry.progress * 100)}% · ${entry.remainingDays.toFixed(1)} D`
          : 'WAITING';
        rows.push(
          this.createRow(
            `${entry.item.name} · ${entry.item.yieldLabel}`,
            status,
            entry.progress,
            entry.active,
          ),
        );
      }
      section.body.replaceChildren(...rows);
    }

    const buildings = this.construction.view(nation);
    this.buildingSection.count.textContent = String(buildings.length);
    if (buildings.length === 0) {
      this.buildingSection.body.replaceChildren(
        this.emptyRow(
          `NO BUILDINGS IN PRODUCTION · ${Math.round(
            this.construction.durationDays,
          )} D`,
        ),
      );
    } else {
      this.buildingSection.body.replaceChildren(
        ...buildings.map((entry) =>
          this.createRow(
            entry.name,
            `${Math.round(entry.progress * 100)}% · ${entry.remainingDays.toFixed(1)} D`,
            entry.progress,
            true,
          ),
        ),
      );
    }
  }

  private createRow(
    label: string,
    status: string,
    progress: number,
    active: boolean,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'outliner__row';

    const heading = document.createElement('div');
    heading.className = 'outliner__row-heading';

    const name = document.createElement('span');
    name.className = 'outliner__row-name';
    name.textContent = label;

    const state = document.createElement('span');
    state.className = active
      ? 'outliner__row-status'
      : 'outliner__row-status outliner__row-status--waiting';
    state.textContent = status;

    heading.append(name, state);

    const track = document.createElement('div');
    track.className = 'outliner__track';
    const fill = document.createElement('span');
    fill.style.width = `${Math.round(progress * 100)}%`;
    track.append(fill);

    row.append(heading, track);
    return row;
  }

  private emptyRow(message: string): HTMLElement {
    const empty = document.createElement('p');
    empty.className = 'outliner__empty';
    empty.textContent = message;
    return empty;
  }
}
