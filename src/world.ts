import type RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion } from 'three';
import { Die } from './die.js';
import type { DieOptions } from './die.js';
import { DICE_SIDES } from './shapes.js';
import { readFace } from './geometry.js';

export interface WorldOptions {
  /** Half width/depth of the built-in tray. Default: 10. */
  halfExtent?: number;
  /** Contact friction for dice, floor and walls. Default: 0.65. */
  friction?: number;
  /** Contact restitution for dice, floor and walls. Default: 0.3. */
  restitution?: number;
  random?: () => number;
}
export interface RollOptions {
  signal?: AbortSignal;
  /** Launch strength multiplier, between 0.1 and 3. Default: 1. */
  strength?: number;
  /** Both simulation and wall-clock deadline in seconds. Default: 20. */
  timeout?: number;
}
export interface TargetRoll {
  die: Die;
  value: number;
}
interface Launch {
  die: Die;
  position: { x: number; y: number; z: number };
  rotation: Quaternion;
  linear: { x: number; y: number; z: number };
  angular: { x: number; y: number; z: number };
}
interface Pending {
  dice: Die[];
  stable: number;
  elapsed: number;
  timeout: number;
  preparing: boolean;
  resolve: (values: number[]) => void;
  reject: (reason: Error) => void;
  cleanup: () => void;
  targets?: TargetRoll[];
}
let initialization: Promise<void> | undefined;
let rapier: typeof RAPIER;
const STEP = 1 / 60;
const MAX_STEPS = 8;
const STABLE_STEPS = 30;

export class DiceWorld {
  private readonly dice = new Set<Die>();
  private pending?: Pending;
  private dead = false;
  private accumulator = 0;
  readonly halfExtent: number;
  private readonly random: () => number;
  private readonly friction: number;
  private readonly restitution: number;
  private constructor(
    private readonly physics: RAPIER.World,
    options: WorldOptions,
  ) {
    this.halfExtent = options.halfExtent ?? 10;
    this.random = options.random ?? Math.random;
    this.friction = options.friction ?? 0.65;
    this.restitution = options.restitution ?? 0.3;
    physics.timestep = STEP;
    const h = this.halfExtent;
    const floor = rapier.ColliderDesc.cuboid(
      h + 0.5,
      0.25,
      h + 0.5,
    ).setTranslation(0, -0.25, 0);
    const walls = [
      rapier.ColliderDesc.cuboid(0.25, 16, h + 0.5).setTranslation(
        -h - 0.25,
        16,
        0,
      ),
      rapier.ColliderDesc.cuboid(0.25, 16, h + 0.5).setTranslation(
        h + 0.25,
        16,
        0,
      ),
      rapier.ColliderDesc.cuboid(h + 0.5, 16, 0.25).setTranslation(
        0,
        16,
        -h - 0.25,
      ),
      rapier.ColliderDesc.cuboid(h + 0.5, 16, 0.25).setTranslation(
        0,
        16,
        h + 0.25,
      ),
    ];
    for (const collider of [floor, ...walls])
      physics.createCollider(
        collider.setFriction(this.friction).setRestitution(this.restitution),
      );
  }
  static async create(options: WorldOptions = {}): Promise<DiceWorld> {
    positive(options.halfExtent ?? 10, 'halfExtent');
    if ((options.halfExtent ?? 10) < 2)
      throw new RangeError('halfExtent must be at least 2');
    for (const key of ['friction', 'restitution'] as const) {
      const value = options[key] ?? (key === 'friction' ? 0.65 : 0.3);
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw new RangeError(`${key} must be between 0 and 1`);
    }
    initialization ??= import('@dimforge/rapier3d-compat')
      .then(async ({ default: engine }) => {
        await engine.init();
        rapier = engine;
      })
      .catch((error) => {
        initialization = undefined;
        throw error;
      });
    await initialization;
    return new DiceWorld(new rapier.World({ x: 0, y: -9.81, z: 0 }), options);
  }
  get rolling(): boolean {
    return !!this.pending;
  }
  get preparing(): boolean {
    return this.pending?.preparing ?? false;
  }
  createDie(options: DieOptions): Die {
    this.assertAlive();
    if (this.pending) throw new Error('Cannot add dice during a roll');
    if (!(DICE_SIDES as readonly number[]).includes(options.sides))
      throw new RangeError('Unsupported die');
    const size = options.size ?? 1;
    positive(size, 'size');
    if (size > this.halfExtent / 3)
      throw new RangeError('Die is too large for the tray');
    const body = this.physics.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(0, size * 3, 0)
        .setLinearDamping(0.35)
        .setAngularDamping(0.35)
        .setCcdEnabled(true),
    );
    let die: Die | undefined;
    try {
      die = new Die(options, body, this.physics, (d) => {
        if (this.pending)
          this.finish(new Error('A die was disposed during the roll'));
        this.dice.delete(d);
      });
      const points = new Float32Array(
        die.shape.vertices.flatMap((v) => v.toArray()),
      );
      const collider = rapier.ColliderDesc.convexHull(points);
      if (!collider) throw new Error('Cannot construct die collider');
      this.physics.createCollider(
        collider
          .setMass(1)
          .setFriction(this.friction)
          .setRestitution(this.restitution),
        body,
      );
      this.dice.add(die);
      return die;
    } catch (error) {
      if (die) die.dispose();
      else this.physics.removeRigidBody(body);
      throw error;
    }
  }
  /** Advance a fixed-step simulation; excess frame time is deliberately dropped. */
  update(deltaSeconds: number): void {
    this.assertAlive();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new RangeError('deltaSeconds must be finite and non-negative');
    if (this.preparing) return;
    this.accumulator = Math.min(
      this.accumulator + deltaSeconds,
      STEP * MAX_STEPS,
    );
    let steps = 0;
    while (this.accumulator + 1e-12 >= STEP && steps++ < MAX_STEPS) {
      this.physics.step();
      this.accumulator = Math.max(0, this.accumulator - STEP);
      const p = this.pending;
      if (p) {
        p.elapsed += STEP;
        p.stable = settled(p.dice.map((d) => d.body)) ? p.stable + 1 : 0;
        if (p.elapsed >= p.timeout) this.finish(new Error('Roll timed out'));
        else if (p.stable >= STABLE_STEPS) {
          const values = p.dice.map((d) => d.value);
          if (p.targets?.some((t, i) => t.value !== values[i]))
            this.finish(new Error('Target replay diverged'));
          else this.finish(undefined, values);
        }
      }
    }
    for (const die of this.dice) die.sync();
  }
  roll(dice: readonly Die[], options: RollOptions = {}): Promise<number[]> {
    this.validate(dice, options);
    const launches = this.launches(dice, options.strength ?? 1);
    const promise = this.begin([...dice], options, false);
    if (this.pending) {
      try {
        for (const launch of launches) {
          launch.die.setOffset(0);
          applyLaunch(launch.die.body, launch);
        }
        this.accumulator = 0;
      } catch (error) {
        this.finish(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return promise;
  }
  /** Predict in an isolated Rapier snapshot, remap labels, then replay the launch. */
  rollTo(
    targets: readonly TargetRoll[],
    options: RollOptions = {},
  ): Promise<number[]> {
    const dice = targets.map((t) => t.die);
    this.validate(dice, options);
    for (const { die, value } of targets) {
      if (!Number.isInteger(value) || value < 1 || value > die.sides)
        throw new RangeError(
          `D${die.sides} target must be an integer from 1 to ${die.sides}`,
        );
    }
    const launches = this.launches(dice, options.strength ?? 1);
    const promise = this.begin(dice, options, true);
    const pending = this.pending;
    if (pending) {
      pending.targets = targets.map((t) => ({ ...t }));
      void this.prepare(pending, launches).catch((error) => {
        if (this.pending === pending) this.finish(error);
      });
    }
    return promise;
  }
  private async prepare(pending: Pending, launches: Launch[]): Promise<void> {
    const preview = rapier.World.restoreSnapshot(this.physics.takeSnapshot());
    try {
      const bodies = launches.map((l) =>
        preview.getRigidBody(l.die.body.handle),
      );
      launches.forEach((l, i) => applyLaunch(bodies[i], l));
      let stable = 0;
      const limit = Math.ceil(pending.timeout / STEP);
      for (let step = 0; step < limit; step++) {
        if (this.pending !== pending) return;
        preview.step();
        stable = settled(bodies) ? stable + 1 : 0;
        if (stable >= STABLE_STEPS) {
          const offsets = bodies.map((body, i) => {
            const die = launches[i].die,
              q = body.rotation();
            const face = readFace(
              die.shape.faces,
              die.sides,
              new Quaternion(q.x, q.y, q.z, q.w),
            );
            return pending.targets![i].value - face.value;
          });
          launches.forEach((launch, i) => {
            launch.die.setOffset(offsets[i]);
            applyLaunch(launch.die.body, launch);
          });
          pending.preparing = false;
          this.accumulator = 0;
          return;
        }
        // Yield regularly: bounded preparation must not monopolize the UI thread.
        if (step % 120 === 119)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      throw new Error('Target preparation timed out');
    } finally {
      preview.free();
    }
  }
  private begin(
    dice: Die[],
    options: RollOptions,
    preparing: boolean,
  ): Promise<number[]> {
    const signal = options.signal;
    return new Promise((resolve, reject) => {
      const abort = () => this.finish(new Error('Roll aborted'));
      const timer = setTimeout(
        () => this.finish(new Error('Roll timed out')),
        (options.timeout ?? 20) * 1000,
      );
      this.pending = {
        dice,
        stable: 0,
        elapsed: 0,
        timeout: options.timeout ?? 20,
        preparing,
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
        },
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
  private finish(error?: Error, values: number[] = []): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = undefined;
    pending.cleanup();
    if (error) pending.reject(error);
    else pending.resolve(values);
  }
  private validate(dice: readonly Die[], options: RollOptions): void {
    this.assertAlive();
    if (this.pending) throw new Error('A roll is already running');
    positive(options.timeout ?? 20, 'timeout');
    if ((options.timeout ?? 20) > 120)
      throw new RangeError('timeout cannot exceed 120 seconds');
    const strength = options.strength ?? 1;
    if (!Number.isFinite(strength) || strength < 0.1 || strength > 3)
      throw new RangeError('strength must be between 0.1 and 3');
    if (!dice.length) throw new RangeError('Select at least one die');
    if (new Set(dice).size !== dice.length) throw new Error('Duplicate dice');
    for (const die of dice)
      if (!this.dice.has(die) || die.disposed)
        throw new Error('Die does not belong to this world');
  }
  private launches(dice: readonly Die[], strength: number): Launch[] {
    const radius = Math.max(...dice.map((d) => d.size * 1.2));
    const spacing = radius * 2.5;
    const columns = Math.max(
      1,
      Math.floor((this.halfExtent * 2 - radius * 2) / spacing) + 1,
    );
    if (dice.length > columns * columns)
      throw new RangeError('Too many dice for a non-overlapping launch');
    const rows = Math.ceil(dice.length / columns),
      width = Math.min(columns, dice.length);
    const rand = () => {
      const value = this.random();
      if (!Number.isFinite(value) || value < 0 || value >= 1)
        throw new RangeError('random() must return a value in [0, 1)');
      return value;
    };
    return dice.map((die, i) => ({
      die,
      position: {
        x: ((i % columns) - (width - 1) / 2) * spacing,
        y: 4 + radius,
        z: (Math.floor(i / columns) - (rows - 1) / 2) * spacing,
      },
      rotation: new Quaternion().setFromAxisAngle(
        { x: 1 / Math.sqrt(3), y: 1 / Math.sqrt(3), z: 1 / Math.sqrt(3) },
        rand() * Math.PI * 2,
      ),
      linear: {
        x: (rand() - 0.5) * 6 * strength,
        y: rand() * 3 * strength,
        z: (rand() - 0.5) * 6 * strength,
      },
      angular: {
        x: (rand() - 0.5) * 18 * strength,
        y: (rand() - 0.5) * 18 * strength,
        z: (rand() - 0.5) * 18 * strength,
      },
    }));
  }
  /** Debug collider vertices and RGBA colors; owned by Rapier's debug pipeline. */
  debugRender(): { vertices: Float32Array; colors: Float32Array } {
    this.assertAlive();
    return this.physics.debugRender();
  }
  dispose(): void {
    if (this.dead) return;
    this.finish(new Error('World disposed'));
    for (const die of [...this.dice]) die.dispose();
    this.physics.free();
    this.dead = true;
  }
  private assertAlive(): void {
    if (this.dead) throw new Error('World has been disposed');
  }
}
function positive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${name} must be finite and positive`);
}
function settled(bodies: RAPIER.RigidBody[]): boolean {
  return bodies.every((body) => {
    const v = body.linvel(),
      a = body.angvel();
    return (
      body.isSleeping() ||
      (v.x * v.x + v.y * v.y + v.z * v.z < 0.0025 &&
        a.x * a.x + a.y * a.y + a.z * a.z < 0.0025)
    );
  });
}
function applyLaunch(body: RAPIER.RigidBody, launch: Launch): void {
  body.resetForces(false);
  body.resetTorques(false);
  body.setTranslation(launch.position, true);
  body.setRotation(launch.rotation, true);
  body.setLinvel(launch.linear, true);
  body.setAngvel(launch.angular, true);
}
