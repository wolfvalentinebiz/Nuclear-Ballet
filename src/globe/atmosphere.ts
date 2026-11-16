import * as THREE from 'three';

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform vec3 uColor;

  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    float rim = 1.0 - abs(dot(normal, normalize(vViewDirection)));
    float glow = pow(clamp(rim, 0.0, 1.0), 3.0);
    float lit = 0.22 + 0.78 * smoothstep(-0.4, 0.45, dot(normal, uSunDirection));
    gl_FragColor = vec4(uColor * glow * lit * 0.8, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Thin additive shell that reads as a lit atmosphere at the limb. */
export class Atmosphere {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(radius: number, color: string) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
        uColor: { value: new THREE.Color(color) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), this.material);
  }
}
