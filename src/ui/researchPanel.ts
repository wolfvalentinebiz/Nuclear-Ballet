import {
  TECHS,
  TECH_BRANCHES,
  techDefinition,
  techsForBranch,
  type TechDefinition,
} from '../game/research';
import type { ResearchState } from '../game/research';
import { GBI_RANGE_KM } from '../game/interceptorRanges';

export interface ResearchPanelElements {
  window: HTMLElement;
  close: HTMLButtonElement;
  summary: HTMLElement;
  branches: HTMLElement;
  points: HTMLElement;
  message: HTMLElement;
}

export interface ResearchUnlockResult {
  ok: boolean;
  message: string;
}

export class ResearchPanel {
  private message = '';

  constructor(
    private readonly elements: ResearchPanelElements,
    private readonly research: ResearchState,
    private readonly getPoints: () => number,
    private readonly onUnlock: (id: string, cost: number) => ResearchUnlockResult,
  ) {
    elements.close.addEventListener('click', () => this.close());
    this.renderBranches();
  }

  get isOpen(): boolean {
    return !this.elements.window.hidden;
  }

  open(): void {
    this.message = '';
    this.elements.window.hidden = false;
    this.render();
  }

  close(): void {
    this.elements.window.hidden = true;
  }

  render(): void {
    if (!this.isOpen) return;
    this.update();
    this.renderBranches();
  }

  /** Refresh the live summary without rebuilding tech buttons mid-click. */
  update(): void {
    if (!this.isOpen) return;
    const points = this.getPoints();
    const gbiKm = Math.round(GBI_RANGE_KM * this.research.gbiFraction());
    this.elements.points.textContent = `RESEARCH POINTS · ${points.toLocaleString('en-US')}`;
    this.elements.summary.textContent =
      `GBI ${gbiKm.toLocaleString('en-US')} KM · LETHALITY ×${this.research.troopLethality().toFixed(2)} · DEPLOYMENT ×${this.research.deploymentMultiplier().toFixed(2)} · RECRUITMENT ×${this.research.recruitmentMultiplier().toFixed(2)} · BUILD ×${this.research.constructionTimeMultiplier().toFixed(2)} · LAUNCH ${this.research.launchCooldownHours()}H`;
    this.elements.message.textContent = this.message;

    for (const card of this.elements.branches.querySelectorAll<HTMLButtonElement>('.tech-card')) {
      const id = card.dataset.techId;
      if (!id) continue;
      const tech = techDefinition(id);
      const unlocked = this.research.isUnlocked(id);
      const available = this.research.isAvailable(id);
      const affordable = points >= tech.cost;
      card.disabled = !available || !affordable;
      const meta = card.querySelector<HTMLElement>('.tech-card__meta');
      if (meta && !unlocked && available) {
        meta.textContent = `${tech.cost.toLocaleString('en-US')} RP${affordable ? '' : ' · INSUFFICIENT'}`;
      }
    }
  }

  private renderBranches(): void {
    const points = this.getPoints();
    this.elements.branches.replaceChildren();

    for (const branch of TECH_BRANCHES) {
      const section = document.createElement('section');
      section.className = 'research-branch';
      section.dataset.branch = branch.id;

      const heading = document.createElement('h3');
      heading.className = 'research-branch__title';
      heading.textContent = branch.name;
      section.append(heading);

      const list = document.createElement('div');
      list.className = 'research-branch__list';

      for (const tech of techsForBranch(branch.id)) {
        list.append(this.createTechButton(tech, points));
      }
      section.append(list);
      this.elements.branches.append(section);
    }
  }

  private createTechButton(tech: TechDefinition, points: number): HTMLButtonElement {
    const unlocked = this.research.isUnlocked(tech.id);
    const available = this.research.isAvailable(tech.id);
    const affordable = points >= tech.cost;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tech-card';
    button.dataset.techId = tech.id;
    button.classList.toggle('tech-card--unlocked', unlocked);
    button.classList.toggle('tech-card--locked', !unlocked && !available);
    button.disabled = !available || !affordable;
    button.title = tech.description;

    const name = document.createElement('span');
    name.className = 'tech-card__name';
    name.textContent = tech.name;

    const meta = document.createElement('span');
    meta.className = 'tech-card__meta';
    if (unlocked) {
      meta.textContent = 'RESEARCHED';
    } else if (!available) {
      meta.textContent = `LOCKED · ${tech.requires ? TECHS.find((entry) => entry.id === tech.requires)?.name ?? 'PREREQUISITE' : 'PREREQUISITE'}`;
    } else {
      meta.textContent = `${tech.cost.toLocaleString('en-US')} RP${affordable ? '' : ' · INSUFFICIENT'}`;
    }

    const description = document.createElement('span');
    description.className = 'tech-card__description';
    description.textContent = tech.description;

    button.append(name, meta, description);
    if (!unlocked && available) {
      button.addEventListener('click', () => {
        const result = this.onUnlock(tech.id, tech.cost);
        this.message = result.message;
        this.render();
      });
    }
    return button;
  }
}
