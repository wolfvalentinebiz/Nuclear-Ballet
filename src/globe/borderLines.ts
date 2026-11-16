import * as THREE from 'three';
import type { CountriesData, CountryData } from '../geo/types';
import { isInternalCountryEdge } from '../geo/countries';
import { geoToWorld } from './orientation';
import type { Globe } from './earth';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const MAX_SEGMENT_ANGLE = 0.025;
const LINE_WIDTH_PX = 1.3;
const LINE_RADIUS = 1.0015;
const OUTLINE_WIDTH_PX = 3.4;
const OUTLINE_COLOR = new THREE.Color(0x4bff8c).convertSRGBToLinear();
const TAU = Math.PI * 2;
const LUMA = 'vec3(0.2126, 0.7152, 0.0722)';

const VERTEX_SHADER = /* glsl */ `
  uniform vec2 uResolution;
  uniform float uLineWidth;

  attribute vec3 segmentStart;
  attribute vec3 segmentEnd;
  attribute float side;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec4 startClip = projectionMatrix * modelViewMatrix * vec4(segmentStart, 1.0);
    vec4 endClip = projectionMatrix * modelViewMatrix * vec4(segmentEnd, 1.0);
    vec2 startNdc = startClip.xy / startClip.w;
    vec2 endNdc = endClip.xy / endClip.w;
    vec2 direction = (endNdc - startNdc) * uResolution;
    float directionLength = length(direction);
    vec2 normal = directionLength > 0.00001
      ? vec2(-direction.y, direction.x) / directionLength
      : vec2(0.0);

    vec4 currentClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    currentClip.xy += normal * side * (uLineWidth / uResolution) * currentClip.w;

    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * position);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = currentClip;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uTerrain;
  uniform sampler2D uHeat;
  uniform vec3 uSunDirection;
  uniform vec3 uNightLand;
  uniform vec3 uNightOcean;
  uniform vec3 uPopulationOcean;
  uniform vec3 uBorderLight;
  uniform vec3 uBorderDark;
  uniform float uMode;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    if (dot(normalize(vWorldNormal), viewDirection) <= 0.0) discard;

    vec3 terrain = texture2D(uTerrain, vUv).rgb;
    float ocean = smoothstep(0.0, 0.035, terrain.b - terrain.g);
    float sunDot = dot(normalize(vWorldNormal), uSunDirection);
    float daylight = smoothstep(-0.02, 0.06, sunDot);
    float shade = 0.84 + 0.16 * clamp(sunDot * 1.6, 0.0, 1.0);

    vec3 terrainBase = mix(
      mix(uNightLand, uNightOcean, ocean),
      terrain * shade,
      daylight
    );

    vec3 heat = texture2D(uHeat, vUv).rgb;
    vec3 populationBase = mix(heat, uPopulationOcean, ocean);
    populationBase *= 0.9 + 0.1 * clamp(sunDot, 0.0, 1.0);

    vec3 base = mix(terrainBase, populationBase, clamp(uMode, 0.0, 1.0));
    float luma = dot(base, ${LUMA});
    vec3 ink = mix(uBorderLight, uBorderDark, smoothstep(0.24, 0.55, luma));

    gl_FragColor = vec4(ink, uOpacity);
    #include <colorspace_fragment>
  }
`;

function pointUv(point: THREE.Vector3): { u: number; v: number } {
  const lat = Math.asin(THREE.MathUtils.clamp(point.y, -1, 1));
  const lon = Math.atan2(-point.z, point.x);
  return { u: lon / TAU + 0.5, v: lat / Math.PI + 0.5 };
}

function buildGeometry(
  countryList: readonly CountryData[],
  merged: ReadonlySet<string> = new Set<string>(),
): THREE.BufferGeometry {
  const positions: number[] = [];
  const segmentStarts: number[] = [];
  const segmentEnds: number[] = [];
  const sides: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const previous = new THREE.Vector3();
  const first = new THREE.Vector3();
  const current = new THREE.Vector3();
  const subStart = new THREE.Vector3();
  const subEnd = new THREE.Vector3();

  const pushVertex = (
    point: THREE.Vector3,
    start: THREE.Vector3,
    end: THREE.Vector3,
    u: number,
    v: number,
    side: number,
  ): void => {
    positions.push(
      point.x * LINE_RADIUS,
      point.y * LINE_RADIUS,
      point.z * LINE_RADIUS,
    );
    segmentStarts.push(
      start.x * LINE_RADIUS,
      start.y * LINE_RADIUS,
      start.z * LINE_RADIUS,
    );
    segmentEnds.push(
      end.x * LINE_RADIUS,
      end.y * LINE_RADIUS,
      end.z * LINE_RADIUS,
    );
    sides.push(side);
    uvs.push(u, v);
  };

  const pushQuad = (start: THREE.Vector3, end: THREE.Vector3): void => {
    const startUv = pointUv(start);
    const endUv = pointUv(end);
    let startU = startUv.u;
    let endU = endUv.u;

    if (endU - startU > 0.5) startU += 1;
    else if (startU - endU > 0.5) endU += 1;

    const base = positions.length / 3;
    pushVertex(start, start, end, startU, startUv.v, -1);
    pushVertex(start, start, end, startU, startUv.v, 1);
    pushVertex(end, start, end, endU, endUv.v, -1);
    pushVertex(end, start, end, endU, endUv.v, 1);
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  };

  const pushSegment = (start: THREE.Vector3, end: THREE.Vector3): void => {
    const angle = Math.acos(THREE.MathUtils.clamp(start.dot(end), -1, 1));
    if (angle < 1e-7) return;

    const steps = Math.max(1, Math.ceil(angle / MAX_SEGMENT_ANGLE));
    for (let step = 0; step < steps; step += 1) {
      subStart.copy(start).lerp(end, step / steps).normalize();
      subEnd.copy(start).lerp(end, (step + 1) / steps).normalize();
      pushQuad(subStart, subEnd);
    }
  };

  for (const country of countryList) {
    for (const polygon of country.polygons) {
      for (const ring of polygon) {
        if (ring.length < 6) continue;

        let previousLon = 0;
        let previousLat = 0;
        let firstLon = 0;
        let firstLat = 0;

        for (let i = 0; i < ring.length; i += 2) {
          const lon = ring[i] ?? 0;
          const lat = ring[i + 1] ?? 0;
          geoToWorld(lat, lon, current);

          if (i === 0) {
            previous.copy(current);
            first.copy(current);
            firstLon = lon;
            firstLat = lat;
          } else {
            if (
              !merged.has(country.name) ||
              !isInternalCountryEdge(country, previousLon, previousLat, lon, lat)
            ) {
              pushSegment(previous, current);
            }
            previous.copy(current);
          }
          previousLon = lon;
          previousLat = lat;
        }

        if (
          !merged.has(country.name) ||
          !isInternalCountryEdge(country, previousLon, previousLat, firstLon, firstLat)
        ) {
          pushSegment(previous, first);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'segmentStart',
    new THREE.Float32BufferAttribute(segmentStarts, 3),
  );
  geometry.setAttribute('segmentEnd', new THREE.Float32BufferAttribute(segmentEnds, 3));
  geometry.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Screen-space country outlines. Unlike a raster border field, the quads are
 * expanded in clip space, so the lines keep the same width at every zoom level
 * and stay crisp when inspecting small borders.
 */
export class BorderLines {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(countries: CountriesData, globe: Globe) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTerrain: { value: globe.terrainTexture },
        uHeat: { value: globe.heatTexture },
        uSunDirection: globe.material.uniforms.uSunDirection,
        uNightLand: globe.material.uniforms.uNightLand,
        uNightOcean: globe.material.uniforms.uNightOcean,
        uPopulationOcean: globe.material.uniforms.uPopulationOcean,
        uBorderLight: globe.material.uniforms.uBorderLight,
        uBorderDark: globe.material.uniforms.uBorderDark,
        uMode: globe.material.uniforms.uMode,
        uResolution: { value: new THREE.Vector2(STAGE_WIDTH, STAGE_HEIGHT) },
        uLineWidth: { value: LINE_WIDTH_PX },
        uOpacity: { value: 0.72 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(buildGeometry(countries.countries), this.material);
    this.mesh.renderOrder = 1;
  }

  setCountries(
    countries: readonly CountryData[],
    merged: ReadonlySet<string> = new Set<string>(),
  ): void {
    const previous = this.mesh.geometry;
    this.mesh.geometry = buildGeometry(countries, merged);
    previous.dispose();
  }
}

const OUTLINE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    if (dot(normalize(vWorldNormal), viewDirection) <= 0.0) discard;

    gl_FragColor = vec4(uColor, uOpacity);
    #include <colorspace_fragment>
  }
`;

/**
 * A selected-country keyline with the same screen-space width treatment as
 * the world borders. The geometry is rebuilt only when the selection changes.
 */
export class CountryOutline {
  readonly mesh: THREE.Mesh;

  private readonly material: THREE.ShaderMaterial;
  private countries: CountryData[] = [];
  private onEarth = true;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: new THREE.Vector2(STAGE_WIDTH, STAGE_HEIGHT) },
        uLineWidth: { value: OUTLINE_WIDTH_PX },
        // Each outline needs its own Color instance. Sharing one object made
        // the last-created preview layer overwrite every player/ally/enemy
        // border with its own color.
        uColor: { value: OUTLINE_COLOR.clone() },
        uOpacity: { value: 1 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: OUTLINE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.mesh.scale.setScalar(1.0004);
    this.mesh.visible = false;
  }

  setCountry(
    country: CountryData | null,
    merged: ReadonlySet<string> = new Set<string>(),
  ): void {
    this.setCountries(country ? [country] : [], merged);
  }

  setCountries(
    countries: readonly CountryData[],
    merged: ReadonlySet<string> = new Set<string>(),
  ): void {
    this.countries = [...countries];
    const previous = this.mesh.geometry;
    this.mesh.geometry = buildGeometry(this.countries, merged);
    previous.dispose();
    this.syncVisibility();
  }

  setColor(color: number, opacity = 1): void {
    this.material.uniforms.uColor?.value.set(color).convertSRGBToLinear();
    const opacityUniform = this.material.uniforms.uOpacity;
    if (opacityUniform) opacityUniform.value = opacity;
  }

  setVisible(visible: boolean): void {
    this.onEarth = visible;
    this.syncVisibility();
  }

  private syncVisibility(): void {
    this.mesh.visible = this.onEarth && this.countries.length > 0;
  }
}
