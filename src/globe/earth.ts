import * as THREE from 'three';
import { PALETTE } from '../palette';

export type MapMode = 'terrain' | 'population' | 'natural';

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uTerrain;
  uniform sampler2D uHeat;
  uniform sampler2D uCityLights;
  uniform sampler2D uBorders;
  uniform sampler2D uNatural;
  uniform vec3 uSunDirection;
  uniform vec3 uNightLand;
  uniform vec3 uNightOcean;
  uniform vec3 uPopulationOcean;
  uniform vec3 uBorderLight;
  uniform vec3 uBorderDark;
  uniform float uMode;
  uniform float uBorderStrength;

  varying vec2 vUv;
  varying vec3 vWorldNormal;

  vec3 applyBorders(vec3 base, float mask) {
    float luma = dot(base, vec3(0.2126, 0.7152, 0.0722));
    vec3 ink = mix(uBorderLight, uBorderDark, smoothstep(0.24, 0.55, luma));
    return mix(base, ink, mask * 0.7);
  }

  void main() {
    vec3 terrain = texture2D(uTerrain, vUv).rgb;
    float ocean = smoothstep(0.0, 0.035, terrain.b - terrain.g);
    float sunDot = dot(normalize(vWorldNormal), uSunDirection);

    // Terrain mode: half the planet is held at the night palette, split by
    // the great circle perpendicular to the real sun direction.
    vec3 night = mix(uNightLand, uNightOcean, ocean);
    float daylight = smoothstep(-0.02, 0.06, sunDot);
    float shade = 0.84 + 0.16 * clamp(sunDot * 1.6, 0.0, 1.0);
    vec3 cityLights = texture2D(uCityLights, vUv).rgb;

    // The border texture stores a distance field. Scaling the threshold by
    // fwidth keeps the visible line width constant in screen pixels at every
    // camera distance, while retaining the country detail when zoomed in.
    float borderDistance = texture2D(uBorders, vUv).r * 64.0;
    float borderAA = max(fwidth(borderDistance), 0.5);
    float borderHalfWidth = max(borderAA * 0.5, 0.6);
    float borderMask = 1.0 - smoothstep(
      borderHalfWidth - borderAA * 0.35,
      borderHalfWidth + borderAA * 0.35,
      borderDistance
    );
    borderMask *= uBorderStrength;

    vec3 terrainSurface = mix(night, terrain * shade, daylight);
    terrainSurface = applyBorders(terrainSurface, borderMask);
    vec3 terrainColor =
      terrainSurface + cityLights * (1.0 - daylight) * 1.15;

    // Population mode: fully readable on both sides, keeping a hint of form.
    vec3 heat = texture2D(uHeat, vUv).rgb;
    vec3 populationColor = mix(heat, uPopulationOcean, ocean);
    populationColor *= 0.9 + 0.1 * clamp(sunDot, 0.0, 1.0);
    populationColor = applyBorders(populationColor, borderMask);

    // Natural-obstacle mode: a desaturated base with the coloured mountain,
    // desert, jungle, wetland and ice barriers drawn over it.
    vec3 naturalLand = mix(vec3(dot(terrain, vec3(0.2126, 0.7152, 0.0722))), terrain, 0.2) * 0.46;
    vec3 naturalBase = mix(uNightOcean * 0.9, naturalLand, 1.0 - ocean);
    naturalBase *= 0.9 + 0.1 * clamp(sunDot, 0.0, 1.0);
    naturalBase = applyBorders(naturalBase, borderMask);
    vec4 naturalObstacle = texture2D(uNatural, vUv);
    vec3 naturalColor = mix(naturalBase, naturalObstacle.rgb, naturalObstacle.a * 0.92);

    float populationMode = step(0.5, uMode) * (1.0 - step(1.5, uMode));
    float naturalMode = step(1.5, uMode);
    vec3 color = mix(terrainColor, populationColor, populationMode);
    color = mix(color, naturalColor, naturalMode);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export class Globe {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly terrainTexture: THREE.CanvasTexture;
  readonly heatTexture: THREE.CanvasTexture;
  readonly cityLightsTexture: THREE.CanvasTexture;
  readonly borderTexture: THREE.CanvasTexture;
  readonly naturalTexture: THREE.CanvasTexture;

  private readonly sunDirection = new THREE.Vector3(1, 0, 0);

  constructor(
    terrainCanvas: HTMLCanvasElement,
    heatCanvas: HTMLCanvasElement,
    cityLightsCanvas: HTMLCanvasElement,
    borderCanvas: HTMLCanvasElement,
    naturalCanvas: HTMLCanvasElement,
    anisotropy: number,
  ) {
    this.terrainTexture = new THREE.CanvasTexture(terrainCanvas);
    this.terrainTexture.colorSpace = THREE.SRGBColorSpace;
    this.terrainTexture.anisotropy = anisotropy;
    this.terrainTexture.wrapS = THREE.RepeatWrapping;
    this.terrainTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.terrainTexture.minFilter = THREE.LinearMipmapLinearFilter;

    this.heatTexture = new THREE.CanvasTexture(heatCanvas);
    this.heatTexture.colorSpace = THREE.SRGBColorSpace;
    this.heatTexture.anisotropy = anisotropy;
    this.heatTexture.wrapS = THREE.RepeatWrapping;
    this.heatTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.heatTexture.minFilter = THREE.LinearFilter;
    this.heatTexture.magFilter = THREE.LinearFilter;
    this.heatTexture.generateMipmaps = false;

    this.cityLightsTexture = new THREE.CanvasTexture(cityLightsCanvas);
    this.cityLightsTexture.colorSpace = THREE.SRGBColorSpace;
    this.cityLightsTexture.anisotropy = anisotropy;
    this.cityLightsTexture.wrapS = THREE.RepeatWrapping;
    this.cityLightsTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.cityLightsTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.cityLightsTexture.magFilter = THREE.LinearFilter;

    this.borderTexture = new THREE.CanvasTexture(borderCanvas);
    this.borderTexture.colorSpace = THREE.NoColorSpace;
    this.borderTexture.anisotropy = anisotropy;
    this.borderTexture.wrapS = THREE.RepeatWrapping;
    this.borderTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.borderTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.borderTexture.magFilter = THREE.LinearFilter;

    this.naturalTexture = new THREE.CanvasTexture(naturalCanvas);
    this.naturalTexture.colorSpace = THREE.SRGBColorSpace;
    this.naturalTexture.anisotropy = anisotropy;
    this.naturalTexture.wrapS = THREE.RepeatWrapping;
    this.naturalTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.naturalTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.naturalTexture.magFilter = THREE.LinearFilter;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTerrain: { value: this.terrainTexture },
        uHeat: { value: this.heatTexture },
        uCityLights: { value: this.cityLightsTexture },
        uBorders: { value: this.borderTexture },
        uNatural: { value: this.naturalTexture },
        uSunDirection: { value: this.sunDirection },
        uNightLand: { value: new THREE.Color(PALETTE.nightLand) },
        uNightOcean: { value: new THREE.Color(PALETTE.nightOcean) },
        uPopulationOcean: { value: new THREE.Color(PALETTE.populationOcean) },
        uBorderLight: { value: new THREE.Color(PALETTE.borderLight) },
        uBorderDark: { value: new THREE.Color(PALETTE.borderDark) },
        uMode: { value: 0 },
        uBorderStrength: { value: 1 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), this.material);
  }

  setSunDirection(direction: THREE.Vector3): void {
    this.sunDirection.copy(direction);
  }

  setMode(mode: MapMode): void {
    this.material.uniforms.uMode.value =
      mode === 'population' ? 1 : mode === 'natural' ? 2 : 0;
  }

  setBorderStrength(strength: number): void {
    this.material.uniforms.uBorderStrength.value = strength;
  }

  refreshHeat(canvas: HTMLCanvasElement): void {
    if (this.heatTexture.image !== canvas) {
      this.heatTexture.image = canvas;
    }
    this.heatTexture.needsUpdate = true;
  }
}
