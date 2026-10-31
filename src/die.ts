import { Color, Mesh, MeshStandardMaterial, Quaternion } from 'three';
import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import { createDieGeometry, mapValue, readFace } from './geometry.js';
import { acquireTexture } from './textures.js';
import type { TextureLease } from './textures.js';
import type { DiceSides } from './shapes.js';
import type { DieGeometry } from './geometry.js';

export interface DieOptions {
  sides: DiceSides;
  /** Circumradius multiplier, in world units. Default: 1. */
  size?: number;
  color?: string;
  fontColor?: string;
}

export class Die {
  readonly mesh: Mesh;
  readonly sides: DiceSides;
  readonly size: number;
  readonly shape: DieGeometry;
  readonly body: RigidBody;
  private lease: TextureLease;
  private offset = 0;
  private dead = false;
  private readonly color: string;
  private readonly fontColor: string;
  private readonly material: MeshStandardMaterial;

  /** @internal Create dice through DiceWorld.createDie(). */
  constructor(
    options: DieOptions,
    body: RigidBody,
    private readonly physics: World,
    private readonly onDispose: (die: Die) => void,
  ) {
    this.sides = options.sides;
    this.size = options.size ?? 1;
    this.color = options.color ?? '#7656df';
    this.fontColor = options.fontColor ?? '#ffffff';
    this.shape = createDieGeometry(this.sides, this.size);
    this.body = body;
    this.lease = acquireTexture(this.sides, this.color, this.fontColor, 0);
    this.material = new MeshStandardMaterial({
      map: this.lease.texture,
      color: this.lease.texture ? '#ffffff' : new Color(this.color),
      roughness: 0.35,
      metalness: 0.08,
    });
    this.mesh = new Mesh(this.shape.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.sync();
  }
  get disposed(): boolean {
    return this.dead;
  }
  get value(): number {
    this.assertAlive();
    const q = this.body.rotation();
    return mapValue(
      readFace(this.shape.faces, this.sides, new Quaternion(q.x, q.y, q.z, q.w))
        .value,
      this.offset,
      this.sides,
    );
  }
  /** @internal Remap the presentation, never the collider. */
  setOffset(offset: number): void {
    this.assertAlive();
    const next = ((offset % this.sides) + this.sides) % this.sides;
    const lease = acquireTexture(this.sides, this.color, this.fontColor, next);
    this.lease.release();
    this.lease = lease;
    this.offset = next;
    this.material.map = lease.texture;
    this.material.needsUpdate = true;
  }
  /** @internal */
  sync(): void {
    this.assertAlive();
    this.mesh.position.copy(this.body.translation());
    this.mesh.quaternion.copy(this.body.rotation());
  }
  dispose(): void {
    if (this.dead) return;
    this.onDispose(this);
    this.dead = true;
    this.mesh.removeFromParent();
    this.physics.removeRigidBody(this.body);
    this.shape.geometry.dispose();
    this.material.dispose();
    this.lease.release();
  }
  private assertAlive(): void {
    if (this.dead) throw new Error('Die has been disposed');
  }
}
