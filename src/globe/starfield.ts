import * as THREE from 'three';

const STAR_COUNT = 4200;
const STAR_RADIUS = 700;

/**
 * Fixed star shell around the scene. The stars do not rotate with the globe;
 * the Sun's direction is the only sky object that moves through the session.
 */
export class Starfield {
  readonly points: THREE.Points;

  private readonly material: THREE.ShaderMaterial;

  constructor() {
    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    const brightness = new Float32Array(STAR_COUNT);

    for (let i = 0; i < STAR_COUNT; i += 1) {
      const y = 1 - 2 * Math.random();
      const radial = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = Math.random() * Math.PI * 2;
      const radius = STAR_RADIUS * (0.92 + Math.random() * 0.16);

      positions[i * 3] = Math.cos(theta) * radial * radius;
      positions[i * 3 + 1] = y * radius;
      positions[i * 3 + 2] = Math.sin(theta) * radial * radius;
      sizes[i] = 0.8 + Math.pow(Math.random(), 3) * 2.2;
      brightness[i] = 0.35 + Math.pow(Math.random(), 1.6) * 0.65;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: 1 },
      },
      vertexShader: /* glsl */ `
        uniform float uPixelRatio;
        attribute float aSize;
        attribute float aBrightness;
        varying float vBrightness;

        void main() {
          vBrightness = aBrightness;
          gl_PointSize = aSize * uPixelRatio;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vBrightness;

        void main() {
          float distanceToCentre = length(gl_PointCoord - vec2(0.5));
          float alpha = smoothstep(0.5, 0.08, distanceToCentre) * vBrightness;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  setPixelRatio(ratio: number): void {
    this.material.uniforms.uPixelRatio.value = ratio;
  }
}
