import type { CountryData } from '../geo/types';

/**
 * Approximate 2025–2026 annual population growth rates. The fallback uses the
 * country's IANA region as a demographic proxy, then applies a small stable
 * per-country variation so the world total lands near the current global rate
 * of roughly 0.85% per year.
 */
const REGIONAL_RATES: Readonly<Record<string, number>> = {
  Africa: 0.023,
  Asia: 0.008,
  Europe: 0.0007,
  Oceania: 0.011,
  Pacific: 0.013,
  America: 0.0065,
};

/** Countries with a materially different near-term trajectory than the proxy. */
const COUNTRY_RATES: Readonly<Record<string, number>> = {
  US: 0.005,
  CA: 0.009,
  MX: 0.007,
  BR: 0.004,
  AR: 0.003,
  CO: 0.006,
  CL: 0.002,
  PE: 0.009,
  VE: 0.002,
  GB: 0.005,
  FR: 0.002,
  DE: -0.001,
  IT: -0.003,
  ES: 0.001,
  PT: 0.0,
  NL: 0.004,
  SE: 0.004,
  NO: 0.005,
  FI: 0.002,
  DK: 0.003,
  PL: -0.002,
  UA: -0.008,
  RU: -0.004,
  TR: 0.005,
  CN: -0.001,
  JP: -0.005,
  KR: 0.001,
  KP: 0.002,
  IN: 0.008,
  PK: 0.019,
  BD: 0.011,
  ID: 0.008,
  PH: 0.015,
  VN: 0.007,
  TH: 0.002,
  MY: 0.009,
  SG: 0.005,
  IR: 0.008,
  IQ: 0.021,
  SA: 0.012,
  IL: 0.014,
  EG: 0.016,
  ET: 0.025,
  NG: 0.024,
  KE: 0.019,
  ZA: 0.010,
  CD: 0.032,
  TZ: 0.029,
  UG: 0.027,
  AU: 0.012,
  NZ: 0.008,
};

function fallbackRate(country: CountryData): number {
  const region = country.timezone.split('/')[0] ?? '';
  let rate = REGIONAL_RATES[region] ?? 0.0085;

  // The Americas span very different demographic regimes. High-latitude
  // capitals are the United States and Canada; the rest are mostly Latin
  // America and the Caribbean.
  if (region === 'America' && (country.capitalLat ?? 0) > 35) {
    rate = 0.005;
  }

  // Stable country variation keeps every nation from growing at exactly the
  // same regional rate without introducing per-frame randomness.
  let hash = 0;
  for (const character of country.iso.toUpperCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) % 1009;
  }
  const variation = ((hash % 9) - 4) * 0.00035;
  return Math.max(-0.006, Math.min(0.032, rate + variation));
}

export function countryAnnualGrowthRates(
  countries: readonly CountryData[],
): Float32Array {
  const rates = new Float32Array(countries.length);
  for (let index = 0; index < countries.length; index += 1) {
    const country = countries[index]!;
    rates[index] = COUNTRY_RATES[country.iso.toUpperCase()] ?? fallbackRate(country);
  }
  return rates;
}
