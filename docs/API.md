# v2 alpha API reference

This reference describes the source in this checkout. The package root exports
`DiceWorld`, `Die`, `DICE_SIDES` and the types `WorldOptions`, `DieOptions`,
`RollOptions`, `TargetRoll` and `DiceSides`. Use root imports, not `src/` or `dist/`
subpaths. Create dice through their world; methods marked `@internal` are not
integration APIs even when emitted declarations expose them.

## Create a world

```ts
const world = await DiceWorld.create({
  halfExtent: 10,
  friction: 0.65,
  restitution: 0.3,
  random: Math.random,
});
```

| Option        | Default       | Contract                                                             |
| ------------- | ------------- | -------------------------------------------------------------------- |
| `halfExtent`  | `10`          | Finite number >=2; inner half width/depth of the tray.               |
| `friction`    | `0.65`        | Finite number in [0, 1], applied to all built-in surfaces and dice.  |
| `restitution` | `0.3`         | Finite number in [0, 1], applied to all built-in surfaces and dice.  |
| `random`      | `Math.random` | Function returning a finite number in [0, 1) on every launch sample. |

Initialization loads Rapier's compatibility WASM asynchronously. Worlds have
separate physics state. Gravity is fixed at `(0, -9.81, 0)`. The physical floor is
at Y=0; walls have inner faces at X/Z=±`halfExtent` and extend from Y=0 to Y=32.
The library does not render those surfaces. These options are creation settings,
not live controls; the playground rebuilds its world when they change.

## Create a die

```ts
const die = world.createDie({
  sides: 6,
  size: 1,
  color: '#7656df',
  fontColor: '#ffffff',
});
scene.add(die.mesh);
```

| Option      | Default     | Contract                                                     |
| ----------- | ----------- | ------------------------------------------------------------ |
| `sides`     | Required    | One of `4`, `6`, `8`, `10`, `12`, `20`.                      |
| `size`      | `1`         | Finite positive circumradius multiplier, <=`halfExtent / 3`. |
| `color`     | `'#7656df'` | CSS color string for the body texture.                       |
| `fontColor` | `'#ffffff'` | CSS color string for labels.                                 |

The original shape scale factors are retained: `size` does not give equal edge
lengths or identical radii across shapes. Each collider has mass 1, linear and
angular damping 0.35, and continuous collision detection enabled. Creation starts
the body at `(0, size * 3, 0)`; multiple newly created dice therefore overlap unless
you position them or launch a roll. Roll methods arrange their selected dice into
a spaced launch grid. Creation during a pending roll throws.

`die.mesh` is owned by the die, but adding it to a scene is the application's job.
`die.body` is the Rapier rigid body. Physics is authoritative; editing the mesh
alone does not move the body. For manual positioning outside directed rolls,
change the body and call `world.update(0)` to synchronize meshes.

`die.value` reads the body's current orientation using the current label mapping.
It is not an indicator that motion has finished. `die.sides`, `die.size` and
`die.disposed` expose identity and lifecycle state. Avoid mutating `die.shape` or
using the internal `sync()`/`setOffset()` methods as application contracts.

## Advance simulation

Call `world.update(deltaSeconds)` from the application's animation loop. The delta
must be finite and non-negative. Physics uses fixed 1/60-second steps, at most
eight per update; excess accumulated time is discarded. Meshes synchronize after
stepping. During directed preparation, updates return without stepping or syncing.

`world.rolling` is true for the entire pending request, including preparation.
`world.preparing` is true only during directed prediction. `world.halfExtent`
exposes the tray setting. `world.debugRender()` returns Rapier-owned debug vertex
and RGBA color arrays for immediate consumption; copy them if retaining the data.

## Roll freely or to a result

```ts
const values = await world.roll([first, second], {
  strength: 1,
  timeout: 20,
  signal: controller.signal,
});

const directed = await world.rollTo(
  [
    { die: first, value: 6 },
    { die: second, value: 20 },
  ],
  { timeout: 30 },
);
```

The example assumes `first` is a D6 and `second` a D20. Each result array follows
input order. Targets must be integers from 1 through the corresponding die's sides;
the API does not clamp them.

| Option     | Default      | Contract                                                               |
| ---------- | ------------ | ---------------------------------------------------------------------- |
| `strength` | `1`          | Finite number in [0.1, 3], scaling launch velocities.                  |
| `timeout`  | `20` seconds | Finite number >0 and <=120.                                            |
| `signal`   | None         | Optional `AbortSignal`; an already aborted signal rejects the request. |

Both methods require a nonempty list of distinct, live dice owned by that world.
Only one request may be pending per world. A batch too large for the computed
non-overlapping launch grid throws before launching. Capacity depends on the
largest selected size and tray dimensions; it is not a fixed count limit.

The selected bodies must remain sleeping or below the linear/angular speed
threshold of 0.05 for 30 consecutive simulation steps. Unselected dice can still
move and collide with selected dice. A result is a reading at completion, not a
guarantee against later changes caused by additional collisions.

Free rolls restore the selected dice's original label mapping. Directed rolls
simulate a snapshot of the whole world, yielding every 120 prediction steps,
then apply label offsets and replay the launch. The real world pauses during
prediction. Do not externally mutate any bodies in that world during a directed
request. The replay checks the requested values and rejects on divergence.
Number remapping changes conventional opposite-face relationships and remains
visible until another mapping is applied or a free roll resets it.

The timeout governs wall-clock duration from request creation, including prediction.
Prediction and replay also have simulation-time bounds; the replay simulation
counter starts at launch. Continuing to call `update()` is necessary even though
the wall-clock timer can reject a request without updates.

## Failures and cancellation

Validation and launch generation can throw synchronously before a promise is
returned. Wrap the method call itself in `try`/`catch`, including when awaiting it.
Invalid world creation options reject `DiceWorld.create()` because it is async.

Pending requests reject with ordinary `Error` objects for abort, timeout, world or
die disposal, or directed replay divergence. There is no exported typed error code
contract. Cancellation does not undo label changes or stop bodies already launched.
A cancelled preparation's isolated snapshot is released when its task resumes.

After a rejected request, the world may be reused unless disposed. A new roll can
be started once `world.rolling` is false. Do not depend on exact error-message text
as a stable external protocol.

## Ownership and disposal

- A world owns its dice and Rapier state. `die.dispose()` removes its mesh from its
  parent, removes its body, disposes geometry/material and releases its texture lease.
- Disposing any die belonging to a world rejects that world's pending roll, even
  if the disposed die was not selected for the request.
- `world.dispose()` rejects its pending request, disposes every owned die and frees
  Rapier state. Both disposal methods are idempotent.
- Disposed worlds and dice cannot be reused. Stop your update loop before disposing
  the world; calling `update()` afterwards throws.
- The application owns the renderer, scene, camera, lights, tray and its event
  listeners. Dispose those separately. Do not independently dispose shared atlas
  textures or transfer body ownership away from the world.

Textures are reference-counted by shape, body color, font color and label offset.
Without `document`, meshes are created without textures. Browser texture creation
requires a working Canvas 2D context; rendering additionally needs the application's
WebGL setup.

## Result conventions and limits

D4 reads the downward face, with its label near the opposite upper vertex. D10 uses
1–10, mapping the legacy zero to 10. Other shapes read the upward-facing label.

The simulation is not certified as uniform random sampling or guaranteed to replay
identically across arbitrary platforms, engine revisions or external mutations.
Seed injection supports controlled tests; it is not a cross-version replay format.
Keep physics near the default world scale: accepting a positive size does not
establish numerical accuracy at arbitrarily tiny or enormous scales.
