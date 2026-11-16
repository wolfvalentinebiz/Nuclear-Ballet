import * as THREE from 'three';
import { GravitySystem, type GravityBody } from './gravity';

const EARTH_RADIUS_KM = 6371.0088;
const EARTH_MU_KM3_S2 = 398600.4418;
const MOON_MU_KM3_S2 = 4902.800118;
const MOON_DISTANCE_KM = 384400;
const MOON_START_ANGLE = 0.9;
const TAU = Math.PI * 2;

/** Scene units are Earth radii; simulated time is in seconds. */
export const MOON_DISTANCE = MOON_DISTANCE_KM / EARTH_RADIUS_KM;
export const MOON_ORBIT_INCLINATION = THREE.MathUtils.degToRad(5.145);

const EARTH_MU = EARTH_MU_KM3_S2 / EARTH_RADIUS_KM ** 3;
const MOON_MU = MOON_MU_KM3_S2 / EARTH_RADIUS_KM ** 3;

/**
 * Earth is held at the scene origin. Including the Moon's mass in the fixed
 * primary's μ reproduces the Earth–Moon relative two-body orbit and its real
 * ~27.32-day sidereal period while keeping the globe stationary.
 */
export const EARTH_MOON_MU = EARTH_MU + MOON_MU;
export const MOON_ORBIT_PERIOD_SECONDS =
  TAU * Math.sqrt(MOON_DISTANCE ** 3 / EARTH_MOON_MU);

const SIN_INCLINATION = Math.sin(MOON_ORBIT_INCLINATION);
const COS_INCLINATION = Math.cos(MOON_ORBIT_INCLINATION);

/** Position on the circular lunar orbit, in Earth-centered scene units. */
export function moonOrbitPosition(
  angle: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const sinAngle = Math.sin(angle);
  return target.set(
    Math.cos(angle) * MOON_DISTANCE,
    sinAngle * MOON_DISTANCE * SIN_INCLINATION,
    sinAngle * MOON_DISTANCE * COS_INCLINATION,
  );
}

/** Unit tangent for increasing orbital angle. */
export function moonOrbitTangent(
  angle: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const sinAngle = Math.sin(angle);
  const cosAngle = Math.cos(angle);
  return target.set(
    -sinAngle,
    cosAngle * SIN_INCLINATION,
    cosAngle * COS_INCLINATION,
  );
}

/** Recover the orbital angle from an Earth-centered position. */
export function moonOrbitAngle(position: THREE.Vector3): number {
  return Math.atan2(
    position.y * SIN_INCLINATION + position.z * COS_INCLINATION,
    position.x,
  );
}

export interface EarthMoonSystem {
  gravity: GravitySystem;
  earthBody: GravityBody;
  moonBody: GravityBody;
}

export function createEarthMoonSystem(): EarthMoonSystem {
  const moonPosition = moonOrbitPosition(MOON_START_ANGLE);
  const moonVelocity = moonOrbitTangent(MOON_START_ANGLE).multiplyScalar(
    Math.sqrt(EARTH_MOON_MU / MOON_DISTANCE),
  );

  const earthBody: GravityBody = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    mu: EARTH_MOON_MU,
    fixed: true,
  };

  const moonBody: GravityBody = {
    position: moonPosition,
    velocity: moonVelocity,
    mu: MOON_MU,
    fixed: false,
  };

  return {
    gravity: new GravitySystem([earthBody, moonBody]),
    earthBody,
    moonBody,
  };
}
