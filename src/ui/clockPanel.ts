import type { CountryData } from '../geo/types';

export interface ClockElements {
  time: HTMLElement;
  date: HTMLElement;
  meta: HTMLElement;
}

interface ClockFormats {
  time: Intl.DateTimeFormat;
  date: Intl.DateTimeFormat;
  offset: Intl.DateTimeFormat;
}

function formatsFor(timeZone: string): ClockFormats {
  return {
    time: new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }),
    date: new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    offset: new Intl.DateTimeFormat('en-GB', {
      timeZone,
      timeZoneName: 'shortOffset',
    }),
  };
}

function normalizeOffset(offset: string): string {
  if (offset === 'GMT' || offset === 'UTC') return 'GMT+0';
  return offset.replace('UTC', 'GMT');
}

/**
 * Displays the simulated instant in the selected country's capital timezone.
 * With no selection it shows UTC (GMT+0).
 */
export class ClockPanel {
  private readonly elements: ClockElements;
  private formats = formatsFor('UTC');
  private place = 'UTC';
  private lastTime = '';
  private lastDate = '';
  private lastMeta = '';

  constructor(elements: ClockElements) {
    this.elements = elements;
  }

  setCountry(country: CountryData | null): void {
    if (!country) {
      this.formats = formatsFor('UTC');
      this.place = 'UTC';
      this.elements.time.title = 'Simulation time in UTC';
      this.elements.meta.title = 'Simulation time in UTC';
      this.reset();
      return;
    }

    try {
      this.formats = formatsFor(country.timezone);
    } catch {
      this.formats = formatsFor('UTC');
    }

    this.place = country.name;
    const label = country.capital
      ? `${country.name} · ${country.capital}`
      : country.name;
    this.elements.time.title = `${label} · ${country.timezone}`;
    this.elements.meta.title = `${label} · ${country.timezone}`;
    this.reset();
  }

  render(date: Date): void {
    const time = this.formats.time.format(date);
    const day = this.formats.date.format(date).toUpperCase();
    const parts = this.formats.offset.formatToParts(date);
    const offset = normalizeOffset(
      parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT',
    );
    const meta = `${offset} · ${this.place.toUpperCase()}`;

    if (time !== this.lastTime) {
      this.elements.time.textContent = time;
      this.lastTime = time;
    }
    if (day !== this.lastDate) {
      this.elements.date.textContent = day;
      this.lastDate = day;
    }
    if (meta !== this.lastMeta) {
      this.elements.meta.textContent = meta;
      this.lastMeta = meta;
    }
  }

  private reset(): void {
    this.lastTime = '';
    this.lastDate = '';
    this.lastMeta = '';
  }
}
