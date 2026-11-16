import * as THREE from 'three';

export interface GravityBody {
  /** Position in scene units (Earth radii). */
  readonly position: THREE.Vector3;
  /** Velocity in scene units per simulated second. */
  readonly velocity: THREE.Vector3;
  /** Standard gravitational parameter G·m, in scene units³/s². */
  readonly mu: number;
  /** Fixed bodies still exert gravity but do not move. */
  readonly fixed: boolean;
}

const MAX_SUBSTEP_SECONDS = 10;
const MIN_DISTANCE_SQUARED = 1e-12;

/**
 * Pairwise Newtonian gravity with a velocity-Verlet integrator. Distances are
 * Earth radii and time is simulated seconds, so a body's μ is G·m converted
 * from km³/s² by dividing by one Earth radius cubed.
 */
export class GravitySystem {
  readonly bodies: readonly GravityBody[];

  private readonly accelerations: THREE.Vector3[];
  private readonly nextAccelerations: THREE.Vector3[];
  private readonly delta = new THREE.Vector3();

  constructor(bodies: readonly GravityBody[]) {
    this.bodies = bodies;
    this.accelerations = bodies.map(() => new THREE.Vector3());
    this.nextAccelerations = bodies.map(() => new THREE.Vector3());
  }

  /** Advance the system by a simulated duration in seconds. */
  step(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;

    let remaining = dtSeconds;
    while (remaining > 0) {
      const step = Math.min(remaining, MAX_SUBSTEP_SECONDS);
      this.integrate(step);
      remaining -= step;
    }
  }

  private integrate(dt: number): void {
    this.computeAccelerations(this.accelerations);

    for (let i = 0; i < this.bodies.length; i += 1) {
      const body = this.bodies[i];
      const acceleration = this.accelerations[i];
      if (!body || !acceleration || body.fixed) continue;

      body.position
        .addScaledVector(body.velocity, dt)
        .addScaledVector(acceleration, 0.5 * dt * dt);
    }

    this.computeAccelerations(this.nextAccelerations);

    for (let i = 0; i < this.bodies.length; i += 1) {
      const body = this.bodies[i];
      const previousAcceleration = this.accelerations[i];
      const nextAcceleration = this.nextAccelerations[i];
      if (!body || !previousAcceleration || !nextAcceleration || body.fixed) {
        continue;
      }

      body.velocity
        .addScaledVector(previousAcceleration, 0.5 * dt)
        .addScaledVector(nextAcceleration, 0.5 * dt);
    }
  }

  private computeAccelerations(target: readonly THREE.Vector3[]): void {
    for (const acceleration of target) acceleration.set(0, 0, 0);

    for (let i = 0; i < this.bodies.length; i += 1) {
      const a = this.bodies[i];
      if (!a) continue;

      for (let j = i + 1; j < this.bodies.length; j += 1) {
        const b = this.bodies[j];
        if (!b) continue;

        this.delta.subVectors(b.position, a.position);
        const distanceSquared = this.delta.lengthSq();
        if (distanceSquared < MIN_DISTANCE_SQUARED) continue;

        const inverseCube = 1 / (distanceSquared * Math.sqrt(distanceSquared));

        if (!a.fixed) {
          target[i]?.addScaledVector(this.delta, b.mu * inverseCube);
        }
        if (!b.fixed) {
          target[j]?.addScaledVector(this.delta, -a.mu * inverseCube);
        }
      }
    }
  }
}
