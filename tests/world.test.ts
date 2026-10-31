import { afterEach, describe, expect, it } from 'vitest';
import { DiceWorld, DICE_SIDES } from '../src/index.js';
import type { Die } from '../src/index.js';
const worlds: DiceWorld[] = [];
async function world() {
  let state = 42;
  const w = await DiceWorld.create({
    random: () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    },
  });
  worlds.push(w);
  return w;
}
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});
async function drive(w: DiceWorld, promise: Promise<number[]>) {
  let done = false;
  const observed = promise
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    )
    .finally(() => {
      done = true;
    });
  for (let frame = 0; frame < 2400 && !done; frame++) {
    w.update(1 / 60);
    if (w.preparing) await new Promise((resolve) => setTimeout(resolve, 0));
    else await Promise.resolve();
  }
  expect(done, 'roll must finish within the bounded drive').toBe(true);
  const result = await observed;
  if ('error' in result) throw result.error;
  return result.value;
}
describe('Rapier integration', () => {
  it('applies world contact settings to dice and produces an elastic bounce', async () => {
    const w = await DiceWorld.create({ friction: 0, restitution: 1 });
    worlds.push(w);
    const die = w.createDie({ sides: 6 });
    expect(die.body.collider(0).friction()).toBe(0);
    expect(die.body.collider(0).restitution()).toBe(1);
    let upwardSpeed = 0;
    for (let frame = 0; frame < 120; frame++) {
      w.update(1 / 60);
      upwardSpeed = Math.max(upwardSpeed, die.body.linvel().y);
    }
    expect(upwardSpeed).toBeGreaterThan(4);
  });
  it('rolls all six shapes freely, then replays minimum and maximum targets repeatedly', async () => {
    const w = await world();
    const dice = DICE_SIDES.map((sides) => w.createDie({ sides }));
    const free = await drive(w, w.roll(dice));
    free.forEach((v, i) => {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(dice[i].sides);
    });
    for (const max of [false, true, false]) {
      const targets = dice.map((die) => ({ die, value: max ? die.sides : 1 }));
      expect(await drive(w, w.rollTo(targets))).toEqual(
        targets.map((t) => t.value),
      );
      for (const { die, value } of targets) {
        expect(die.value).toBe(value);
        const alignment = Math.max(
          ...die.shape.faces.map(
            (face) =>
              face.normal.clone().applyQuaternion(die.mesh.quaternion).y *
              (die.sides === 4 ? -1 : 1),
          ),
        );
        expect(alignment).toBeGreaterThan(0.95);
        expect(die.mesh.position.y).toBeGreaterThan(0);
        expect(Math.abs(die.mesh.position.x)).toBeLessThan(10);
      }
    }
  }, 30000);
  it('rejects invalid input without poisoning subsequent rolls', async () => {
    const w = await world(),
      d = w.createDie({ sides: 10 });
    for (const value of [0, 11, 1.5, NaN, Infinity])
      expect(() => w.rollTo([{ die: d, value }])).toThrow();
    expect(() => w.roll([])).toThrow();
    expect(() => w.roll([d, d])).toThrow();
    expect(() => w.createDie({ sides: 7 as 6 })).toThrow();
    expect(() => w.createDie({ sides: 6, size: NaN })).toThrow();
    expect(() => w.update(Infinity)).toThrow();
    expect(await drive(w, w.rollTo([{ die: d, value: 10 }]))).toEqual([10]);
  });
  it('isolates worlds, disallows concurrent throws and cancels during preparation', async () => {
    const a = await world(),
      b = await world();
    const d = a.createDie({ sides: 6 }),
      other = b.createDie({ sides: 6 });
    expect(() => a.roll([other])).toThrow();
    const controller = new AbortController();
    const pending = a.rollTo([{ die: d, value: 6 }], {
      signal: controller.signal,
    });
    const rejected = expect(pending).rejects.toThrow('aborted');
    expect(() => a.roll([d])).toThrow('already');
    controller.abort();
    await rejected;
    expect(await drive(a, a.roll([d]))).toHaveLength(1);
    expect(other.body.translation().y).toBe(3);
  });
  it('rejects expired simulations and allows reuse', async () => {
    const w = await world(),
      d = w.createDie({ sides: 4 });
    await expect(drive(w, w.roll([d], { timeout: 0.01 }))).rejects.toThrow(
      'timed out',
    );
    await expect(
      w.rollTo([{ die: d, value: 1 }], { timeout: 0.01 }),
    ).rejects.toThrow('timed out');
    expect(await drive(w, w.roll([d]))).toHaveLength(1);
  });
  it('disposes bodies and meshes idempotently and rejects a pending roll', async () => {
    const w = await world(),
      d = w.createDie({ sides: 20 });
    const pending = w.roll([d]);
    const rejected = expect(pending).rejects.toThrow('disposed');
    d.dispose();
    d.dispose();
    await rejected;
    expect(d.body.isValid()).toBe(false);
    expect(() => d.value).toThrow('disposed');
    expect(() => w.roll([d])).toThrow('belong');
    w.dispose();
    w.dispose();
    expect(() => w.update(0)).toThrow('disposed');
  });
  it('accepts already aborted signals and bounds long frames', async () => {
    const w = await world(),
      d = w.createDie({ sides: 6 });
    await expect(w.roll([d], { signal: AbortSignal.abort() })).rejects.toThrow(
      'aborted',
    );
    const y = d.body.translation().y;
    w.update(1000);
    expect(y - d.body.translation().y).toBeLessThan(1);
  });
});

describe('directed replay coverage', () => {
  it('replays every target value across every shape in a mixed batch', async () => {
    const w = await world();
    const dice = DICE_SIDES.map((sides) => w.createDie({ sides }));
    for (let round = 1; round <= 20; round++) {
      const targets = dice.map((die) => ({
        die,
        value: ((round - 1) % die.sides) + 1,
      }));
      expect(await drive(w, w.rollTo(targets))).toEqual(
        targets.map((t) => t.value),
      );
    }
  }, 30000);
});

describe('wall-clock deadline', () => {
  it('times out without animation updates and permits another request', async () => {
    const w = await world(),
      die = w.createDie({ sides: 6 });
    await expect(w.roll([die], { timeout: 0.01 })).rejects.toThrow('timed out');
    expect(w.rolling).toBe(false);
    expect(await drive(w, w.roll([die]))).toHaveLength(1);
  });
});
