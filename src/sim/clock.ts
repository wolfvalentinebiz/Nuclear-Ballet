export type TimeSpeed = 'paused' | 'play' | 'fast' | 'quad';

/**
 * Multipliers applied to real time. Play advances four simulated hours per
 * real minute; fast doubles that to eight, and quad to sixteen hours per
 * minute.
 */
export const TIME_SCALE: Record<TimeSpeed, number> = {
  paused: 0,
  play: 240,
  fast: 480,
  quad: 960,
};

export class SimulationClock {
  private currentMs: number;
  private _speed: TimeSpeed;

  constructor(start: Date = new Date(), speed: TimeSpeed = 'play') {
    this.currentMs = start.getTime();
    this._speed = speed;
  }

  get speed(): TimeSpeed {
    return this._speed;
  }

  get date(): Date {
    return new Date(this.currentMs);
  }

  /** Simulated Unix time in milliseconds. */
  get timestamp(): number {
    return this.currentMs;
  }

  setSpeed(speed: TimeSpeed): void {
    this._speed = speed;
  }

  /** Advance by real elapsed seconds at the current simulation rate. */
  advance(realSeconds: number): void {
    if (!Number.isFinite(realSeconds) || realSeconds <= 0) return;
    this.currentMs += realSeconds * 1000 * TIME_SCALE[this._speed];
  }
}
