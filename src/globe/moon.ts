import * as THREE from 'three';
import {
  MOON_DISTANCE,
  moonOrbitAngle,
  moonOrbitPosition,
} from '../sim/earthMoon';

const EARTH_RADIUS_KM = 6371.0088;
const MOON_RADIUS_KM = 1737.4;
const TAU = Math.PI * 2;
const ORBIT_TRACK_SEGMENTS = 256;

/** Scene units are Earth radii. */
export const MOON_RADIUS = MOON_RADIUS_KM / EARTH_RADIUS_KM;

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
  uniform sampler2D uSurface;
  uniform vec3 uSunDirection;

  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vec3 albedo = texture2D(uSurface, vUv).rgb;
    float sunDot = dot(normalize(vWorldNormal), uSunDirection);
    float light = smoothstep(-0.04, 0.12, sunDot);
    float diffuse = 0.03 + 0.97 * max(sunDot, 0.0);
    vec3 color = albedo * mix(0.08, 1.0, light) * diffuse;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A subtle procedural regolith; no external lunar imagery is used. */
function createSurfaceTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable.');

  ctx.fillStyle = '#8e8e89';
  ctx.fillRect(0, 0, width, height);

  const random = mulberry32(0x5eed);

  for (let i = 0; i < 18; i += 1) {
    const x = random() * width;
    const y = height * 0.12 + random() * height * 0.76;
    const radius = 35 + random() * 120;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(74, 74, 71, 0.20)');
    gradient.addColorStop(0.65, 'rgba(78, 78, 75, 0.08)');
    gradient.addColorStop(1, 'rgba(78, 78, 75, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  }

  for (let i = 0; i < 120; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = 0.6 + random() * 4.2;

    ctx.fillStyle = 'rgba(52, 52, 50, 0.20)';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(196, 194, 185, 0.12)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, radius + 0.6, 0, TAU);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createOrbitTrack(): THREE.LineLoop {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < ORBIT_TRACK_SEGMENTS; i += 1) {
    points.push(moonOrbitPosition((i / ORBIT_TRACK_SEGMENTS) * TAU));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0x7893ab,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });

  const track = new THREE.LineLoop(geometry, material);
  track.visible = false;
  return track;
}

export class Moon {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly texture: THREE.CanvasTexture;
  readonly orbitTrack: THREE.LineLoop;
  readonly position = new THREE.Vector3();
  readonly radius = MOON_RADIUS;
  readonly distance = MOON_DISTANCE;

  private readonly sunDirection = new THREE.Vector3(1, 0, 0);

  constructor(initialPosition: THREE.Vector3) {
    this.texture = createSurfaceTexture();

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSurface: { value: this.texture },
        uSunDirection: { value: this.sunDirection },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_RADIUS, 96, 64),
      this.material,
    );

    this.orbitTrack = createOrbitTrack();
    this.sync(initialPosition);
  }

  /** Copy the gravity body's position into the mesh and its tidal rotation. */
  sync(position: THREE.Vector3): void {
    this.position.copy(position);
    this.mesh.position.copy(position);

    // Tidally locked: the same lunar hemisphere faces Earth.
    this.mesh.rotation.y = Math.PI - moonOrbitAngle(position);
  }

  setSunDirection(direction: THREE.Vector3): void {
    this.sunDirection.copy(direction);
  }
}
