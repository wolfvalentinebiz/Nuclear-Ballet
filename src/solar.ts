export interface SubsolarPoint {
  /** Geographic latitude where the sun is directly overhead, in degrees. */
  lat: number;
  /** Geographic longitude where the sun is directly overhead, in degrees east. */
  lon: number;
}

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function norm360(value: number): number {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function wrap180(value: number): number {
  return norm360(value + 180) - 180;
}

const sin = (degrees: number): number => Math.sin(degrees * RAD);
const cos = (degrees: number): number => Math.cos(degrees * RAD);

/**
 * Position of the substellar point for a given instant, from the NOAA solar
 * equations. The terminator is then the great circle 90° from this point, so
 * exactly half the planet is lit.
 */
export function subsolarPoint(date: Date): SubsolarPoint {
  const julianDay = date.getTime() / 86_400_000 + 2_440_587.5;
  const t = (julianDay - 2_451_545) / 36_525;

  const meanLongitude = norm360(280.46646 + t * (36_000.76983 + t * 0.0003032));
  const meanAnomaly = 357.52911 + t * (35_999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const equationOfCentre =
    sin(meanAnomaly) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    sin(2 * meanAnomaly) * (0.019993 - 0.000101 * t) +
    sin(3 * meanAnomaly) * 0.000289;

  const trueLongitude = meanLongitude + equationOfCentre;
  const omega = 125.04 - 1934.136 * t;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * sin(omega);

  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * cos(omega);

  const declination = Math.asin(sin(obliquity) * sin(apparentLongitude)) * DEG;

  const y = Math.tan((obliquity * RAD) / 2) ** 2;
  const equationOfTime =
    4 *
    DEG *
    (y * sin(2 * meanLongitude) -
      2 * eccentricity * sin(meanAnomaly) +
      4 * eccentricity * y * sin(meanAnomaly) * cos(2 * meanLongitude) -
      0.5 * y * y * sin(4 * meanLongitude) -
      1.25 * eccentricity * eccentricity * sin(2 * meanAnomaly));

  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3_600_000;

  return {
    lat: declination,
    lon: wrap180(15 * (12 - utcHours - equationOfTime / 60)),
  };
}
