# Migrating from v1 to v2 alpha

v2 replaces Cannon.js with Rapier and changes the API intentionally. It is ESM
only: there is no global `DiceManager`, AMD, CommonJS or compatibility singleton.
This guide describes the local v2 alpha source; check release availability
separately. Start with the [README](./README.md) and [API reference](./docs/API.md).

## Replace the integration

| v1                                             | v2                                                         |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `DiceManager.setWorld(cannonWorld)`            | `await DiceWorld.create(options)`                          |
| `new DiceD6(options)`                          | `world.createDie({ sides: 6, ...options })`                |
| `backColor`                                    | `color`                                                    |
| `fontColor`                                    | `fontColor` (CSS string)                                   |
| `dice.getObject()`                             | `die.mesh`                                                 |
| `dice.getObject().body`                        | `die.body` (Rapier API, not Cannon)                        |
| `world.step()` then `updateMeshFromBody()`     | `world.update(deltaSeconds)`                               |
| `updateBodyFromMesh()`                         | Change `die.body`; mesh changes alone do not move physics. |
| `DiceManager.prepareValues([{ dice, value }])` | `await world.rollTo([{ die, value }])`                     |
| Manual launch randomization                    | `await world.roll([die], { strength })`                    |
| `resetBody()`                                  | Not needed between roll requests.                          |
| Manual resource cleanup                        | `die.dispose()` / `world.dispose()`                        |

1. Remove old script/global imports and Cannon-specific world/body setup.
2. Install the v2 archive and compatible Three.js peer as shown in the README.
   TypeScript applications also need matching `@types/three`.
3. Await world creation, create dice through that world, and add their meshes to
   your application-owned scene. Do not construct `Die` directly.
4. Start the animation loop and pass elapsed **seconds** to `world.update()`.
5. Replace result preparation with the promise-based roll methods and handle both
   synchronous validation exceptions and asynchronous request failures.
6. On permanent teardown, stop your update loop and dispose the world. Clean up
   your renderer, visible tray and application event listeners separately.

The [README integration example](./README.md#integrate-with-an-existing-threejs-scene)
includes request handling and teardown. Keep updates running while awaiting a roll;
awaiting it before starting animation leaves only its wall-clock timeout advancing.

## Rebuild the tray and physics tuning

The world supplies a physical floor at Y=0 and containment walls at X/Z=±10 by
default. Avoid duplicating those colliders. You still own the visible tray,
Three.js scene, camera, lights and renderer. `halfExtent` changes the physical
half width/depth; it does not resize application-owned rendering geometry.

Default `size` is 1, a shape-specific circumradius multiplier in world units,
not pixels or edge length. Gravity is fixed at -9.81 on Y and collider mass at 1.
Friction defaults to 0.65 and restitution to 0.3; both settings apply to dice,
floor and walls. They are world creation settings, so changing playground sliders
rebuilds its world. Previous Cannon tuning and velocity code are not portable.

New bodies start at `(0, size * 3, 0)` and initially overlap if created in a batch.
Position them explicitly when displaying them before a roll. Roll requests place
the selected dice into a launch grid and reject batches exceeding its capacity.

Rapier bodies have different methods from Cannon. For manual positioning outside
a directed request, update `die.body` and call `world.update(0)` to sync meshes.
The integration surface does not expose the underlying Rapier world for arbitrary
collider creation; do not assume the old custom-world setup transfers directly.

## Adopt the result contract

D4 retains the downward-face result convention, with labels near the opposite
upper vertex. D10 now returns **1–10** instead of a face labeled 0.

`rollTo()` predicts an isolated snapshot, remaps face labels and replays the
launch. The owning world pauses during preparation; do not externally move or
modify bodies until the request finishes. A divergent replay rejects the request.
Remapping does not preserve conventional opposite-face numbering. A subsequent
free `roll()` restores the selected dice's original mapping.

The library does not certify uniform randomness. Choose authoritative outcomes
in the application when needed, then use directed rolls to animate them. Injecting
`random` is useful for tests, not a portable replay or fairness guarantee.

## Handle requests and ownership

Only one request may run per world. Each batch must contain distinct, live dice
owned by that world, and directed targets must be integers in `1..die.sides`.
The library rejects invalid targets; only the playground clamps its UI values.

Requests accept `strength`, `timeout` and `signal`. The default timeout is 20
seconds and the maximum is 120; it bounds wall-clock duration including prediction,
and simulation stages are bounded too. Handle abort, timeout, disposal and replay
failure. Cancellation rejects the request but does not stop already launched bodies
or undo label changes. A rejected request permits reuse unless the world is disposed.

A world owns every die it creates. Disposing any of its dice rejects the world's
pending request, even if that die was not selected. Disposal is idempotent;
disposed worlds/dice cannot be reused. Do not independently dispose shared textures.

## Replace the demos and packaging workflow

The old `examples/rolling.html` and `examples/types-and-sizes.html` are replaced by
the Vite playground at the repository root. Run `mise run dev`. Import controls
from `three/addons/controls/OrbitControls.js` in your own application.

The package uses a root ESM export with generated declarations. Do not import
legacy `lib/dice.js` or internal `src/`/`dist/` subpaths. `npm pack` rebuilds the
library through `prepack`; it does not run the full verification suite. Run
`mise run verify` and `mise run test:browser` before proposing a release.
Publication remains a separate, explicitly authorized action.
