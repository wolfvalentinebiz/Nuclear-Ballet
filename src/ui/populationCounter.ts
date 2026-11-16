export interface PopulationCounterElements {
  value: HTMLElement;
  delta: HTMLElement;
}

const FORMATTER = new Intl.NumberFormat('en-US');

/** Animated world population readout with a red immediate-fatalities delta. */
export class PopulationCounter {
  private displayed = 0;
  private target = 0;
  private lossTimer = 0;

  constructor(private readonly elements: PopulationCounterElements) {}

  setTotal(total: number): void {
    this.displayed = Math.max(0, total);
    this.target = this.displayed;
    this.elements.delta.classList.remove('is-visible');
    this.paint();
  }

  /** Updates the animated target without interrupting the current readout. */
  setPopulation(total: number): void {
    this.target = Math.max(0, total);
  }

  showLoss(killed: number, remaining: number): void {
    const dead = Math.max(0, Math.round(killed));
    if (dead === 0) return;

    this.target = Math.max(0, remaining);
    this.elements.delta.textContent = `−${FORMATTER.format(dead)}`;
    this.elements.delta.classList.remove('is-visible');
    // Restart the CSS transition when a second warhead arrives mid-animation.
    void this.elements.delta.offsetWidth;
    this.elements.delta.classList.add('is-visible');
    this.lossTimer = 3.2;
  }

  update(deltaSeconds: number): void {
    const delta = Math.max(0, deltaSeconds);
    const difference = this.target - this.displayed;

    if (Math.abs(difference) >= 1) {
      const step = Math.max(1, Math.abs(difference) * Math.min(1, delta * 7));
      this.displayed += Math.sign(difference) * Math.min(Math.abs(difference), step);
      this.paint();
    } else if (this.displayed !== this.target) {
      this.displayed = this.target;
      this.paint();
    }

    if (this.lossTimer > 0) {
      this.lossTimer = Math.max(0, this.lossTimer - delta);
      if (this.lossTimer === 0) {
        this.elements.delta.classList.remove('is-visible');
      }
    }
  }

  private paint(): void {
    this.elements.value.textContent = FORMATTER.format(
      Math.max(0, Math.round(this.displayed)),
    );
  }
}
