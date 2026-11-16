import * as THREE from 'three';

/** Geographic lat/lon to the unit-sphere frame used by the globe's texture. */
export function geoToWorld(
  latDeg: number,
  lonDeg: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const cosLat = Math.cos(lat);
  return target.set(cosLat * Math.cos(lon), Math.sin(lat), -cosLat * Math.sin(lon));
}
