import * as THREE from 'three';

const SUN_DISTANCE = 220;

function radialTexture(stops: ReadonlyArray<readonly [number, string]>): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable.');

  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The Sun sits in the skybox at the subsolar direction. */
export class Sun {
  readonly group = new THREE.Group();

  constructor() {
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture([
          [0, 'rgba(255, 252, 240, 0.95)'],
          [0.12, 'rgba(255, 246, 220, 0.85)'],
          [0.28, 'rgba(255, 232, 186, 0.32)'],
          [0.55, 'rgba(255, 214, 150, 0.08)'],
          [1, 'rgba(255, 200, 140, 0)'],
        ]),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.scale.setScalar(30);

    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture([
          [0, 'rgba(255, 255, 255, 1)'],
          [0.35, 'rgba(255, 251, 235, 1)'],
          [0.62, 'rgba(255, 238, 196, 0.55)'],
          [0.85, 'rgba(255, 220, 150, 0.08)'],
          [1, 'rgba(255, 210, 140, 0)'],
        ]),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    core.scale.setScalar(8.5);

    this.group.add(halo, core);
  }

  setDirection(direction: THREE.Vector3): void {
    this.group.position.copy(direction).multiplyScalar(SUN_DISTANCE);
  }
}
