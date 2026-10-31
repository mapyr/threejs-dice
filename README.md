# threejs-dice · v2 alpha

Typed polyhedral dice for Three.js with Rapier physics: D4, D6, D8, D10,
D12 and D20, physical rolls and animations of application-selected results.

**This checkout is v2.0.0-alpha.0. v2 is a breaking rewrite; the code here is not
an announcement of an npm release.** It replaces the global Cannon.js manager
with independent, disposable worlds and ships ESM only.

- [API reference](./docs/API.md): options, validation, errors and ownership.
- [Migration from v1](./MIGRATION.md): replacement API and changed behavior.
- `AGENTS.md` in the repository: contributor workflow and release boundaries.

## Run the playground

Use the Node version pinned in `mise.toml`, currently 24.22.0:

```sh
mise trust
mise install
mise run setup
mise run dev
```

Open the URL printed by Vite. The playground supports mixed shapes, up to 12 dice,
colors, friction, bounce, throw strength, directed results, collider visualization
and a copyable integration snippet. Adjust size and label color, reset the dice or
camera, and compare the last 20 completed rolls in the session history. Press
**Space** to roll when focus is outside a form control, or **Esc** to cancel.
History survives setup changes but is cleared on reload; cancelled/failed rolls
are not recorded. Target values are capped separately for each
die's number of sides; the library itself rejects out-of-range targets.

## Use this checkout in an application

The package requires Node >=24 for its declared tooling/runtime support and
Three.js `>=0.187.0 <0.188.0` as a peer. Rapier is a bundled-WASM package dependency,
external to the library's JavaScript bundle. Browser consumers need an ESM-capable
build tool; no CommonJS, AMD or global-script entry point is provided.

Build and pack locally rather than assuming the npm registry contains this rewrite:

```sh
# In this repository; prepack builds JS, source maps and declarations.
mise exec -- npm pack

# In your application, using the actual path to the generated archive:
npm install /absolute/path/to/threejs-dice-2.0.0-alpha.0.tgz three@0.187.0
# For TypeScript applications:
npm install --save-dev @types/three@0.187.0
```

The supported Three.js range is deliberately narrow. Widen it only after testing
additional revisions. Headless Node can run the physics without a DOM; its meshes
are untextured. Rapier initialization is asynchronous and shared across worlds.

## Integrate with an existing Three.js scene

The following assumes your application already owns `scene`, `camera`, `renderer`
and a `rollButton`. Render your own tray with a floor at Y=0 and inner walls at
X/Z=±10. The library supplies those physical surfaces, but no camera, lights,
renderer or visible tray.

```ts
import { DiceWorld } from 'threejs-dice';

const world = await DiceWorld.create({ friction: 0.65, restitution: 0.3 });
const die = world.createDie({ sides: 20, size: 1, color: '#a9e66b' });
scene.add(die.mesh);

let previous = performance.now();
let frame = 0;
let disposed = false;
let controller: AbortController | undefined;

function animate(now: number) {
  world.update((now - previous) / 1000);
  previous = now;
  renderer.render(scene, camera);
  frame = requestAnimationFrame(animate);
}
frame = requestAnimationFrame(animate);

async function onRoll() {
  if (disposed || world.rolling) return;
  const request = new AbortController();
  controller = request;
  rollButton.disabled = true;
  try {
    const [value] = await world.roll([die], { signal: request.signal });
    console.log('Rolled:', value);
    // Instead of roll(), animate an outcome chosen by your application:
    // const [value] = await world.rollTo([{ die, value: 20 }], {
    //   signal: request.signal,
    // });
  } catch (error) {
    console.error('Roll failed:', error);
  } finally {
    controller = undefined;
    if (!disposed) rollButton.disabled = false;
  }
}
rollButton.addEventListener('click', onRoll);

// Call when your component/scene is permanently removed.
function cleanup() {
  if (disposed) return;
  disposed = true;
  rollButton.removeEventListener('click', onRoll);
  cancelAnimationFrame(frame);
  controller?.abort();
  world.dispose();
  // The application still owns renderer, camera, lights and tray resources.
}
```

Keep the animation loop running while awaiting either roll method. Invalid input
can throw synchronously; cancellation, timeout, disposal and replay divergence
reject the returned promise. Put the call itself inside `try`.

## Results and physics contracts

- `update(deltaSeconds)` advances fixed 1/60-second steps, at most eight per call.
  Excess accumulated time is dropped after long frames.
- A roll completes after its selected bodies remain slow or sleeping for 30 steps.
  Returned values follow input order. Reading `die.value` during motion gives the
  current orientation's value, not a completed-roll result.
- `rollTo()` predicts in an isolated snapshot, remaps labels and replays the launch.
  The owning world pauses during preparation; other worlds remain independent.
  Do not move or modify bodies in that world until the directed request finishes.
- Directed rolls change numbering and do not preserve conventional opposite-face
  sums. `roll()` restores the selected dice's original label mapping.
- D4 reads the downward face and places its result near the opposite upper vertex.
  D10 returns **1–10**, replacing the original face value 0 with 10.
- Free physics rolls are not certified uniform random sampling. Generate
  authoritative game outcomes separately and animate them with `rollTo()`.
- Friction and restitution apply to dice, floor and walls. Size is a shape-specific
  circumradius multiplier in world units, not an edge length or pixel size.
- Cancellation stops the request, not already launched bodies. Disposing any die
  in a world rejects that world's pending roll. Disposal is idempotent and removes
  owned meshes, physics bodies, geometries, materials and texture leases.

See the [API reference](./docs/API.md) for defaults, limits and failure behavior.

## Verify changes

```sh
mise run verify          # Prettier, strict types, unit/physics tests, both builds
mise run setup:browser   # Install Chromium headless shell locally
mise run test:browser    # Chromium/WebGL integration and screenshots
```

CI runs verification and browser tests separately. On Linux, browser dependencies
may also be needed; CI installs them with
`mise exec -- npm exec -- playwright install --with-deps chromium --only-shell`.
The lockfile fixes the dependency graph; use `mise run setup` (`npm ci`) to install it.

Unit tests cover legacy topology/numbering, readable faces, contact settings,
free/directed rolls, validation, deadlines, cancellation and disposal. Browser tests
cover rendering, target values, texture counts, mobile overflow, snippets and the
persisted page lifecycle event handlers. The latter dispatches events directly;
it does not prove native browser back/forward-cache admission. Screenshots are
written to `test-results/` and require visual inspection for visual acceptance.

`mise run build` produces `dist/`; `mise run build:playground` produces
`playground-dist/`. `npm pack` rebuilds the library automatically; this is not a
substitute for the checks above. Rapier's compatibility package makes the browser
download substantially larger than the library bundle alone.

To try the built page locally, run `mise run build:playground` followed by
`mise run preview` and open the printed URL. The preview serves the production
output; `mise run dev` serves the editable source. Neither command publishes a site.

## Credits and license

This v2 fork is maintained by Marcin Pyrka. See [LICENSE](./LICENSE) for the
original copyright notice and the additional notice for this fork.

MIT. Original library by byWulf, based on Anton Natarov's
[Online 3D dice roller](http://www.teall.info/2014/01/online-3d-dice-roller.htm).
Original polyhedra, numbering and bevel topology are retained. The frozen legacy
fixture records the pre-rewrite shape contract. Rapier and Three.js retain their
own dependency licenses.
