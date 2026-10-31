# Working in threejs-dice

These instructions apply throughout this repository. Follow explicit user scope
and authorization. Read the implementation before changing its contracts.

## Collaboration and authorization

- Investigate first: inspect files, Git state, history and relevant context; try
  the obvious local solution before asking. If genuinely blocked, ask one precise
  question. Recommend a clear approach and explain consequential tradeoffs.
- Complete authorized, reversible local work autonomously. Preserve existing dirty
  work, including untracked files; never reset, clean, overwrite or discard someone
  else's changes. Do not mistake the v2 working tree for committed history.
- Before commits, pushes, PR/issue creation or updates, published reviews/comments,
  messages, tags, npm releases, deployments or destructive operations, obtain
  explicit authorization for that action and scope. Existing explicit authorization
  remains valid; do not ask repeatedly. A request to review or fix locally does not
  authorize publication.
- Prepare the concrete result and run relevant checks before asking for final
  approval. Report what will be committed/published and any remaining limitation.
  Do not infer release permission from a green test run.
- Prefer API/CLI tools over UI automation where available. Do not spawn subagents
  unless explicitly requested by the user or applicable instructions.
- Keep user updates concise and candid. Match the user's language; dry humor is
  welcome in conversation, but keep public documentation and errors professional.
  State findings, evidence and uncertainty without filler or invented certainty.
- Use relevant prior context when available, but verify drift-prone facts against
  current files or live state. Never write persistent assistant memory without an
  explicit user request, and never put secrets or private conversation history in
  repository documents.

## Repository map

- `src/index.ts`: package exports and public types.
- `src/world.ts`: Rapier initialization, ownership, fixed-step simulation, requests,
  prediction/replay, deadlines and disposal.
- `src/die.ts`: die mesh/body lifecycle and label mapping.
- `src/shapes.ts`, `src/bevel.ts`, `src/geometry.ts`: legacy topology, bevels, UVs
  and orientation reading. `src/textures.ts`: reference-counted label atlases.
- `playground/`, `index.html`: Vite browser demo. It imports source directly.
- `tests/legacy-shapes.json`: frozen pre-rewrite shape contract; do not regenerate
  it from new code merely to make a regression pass.
- `tests/*.test.ts`: geometry and real Rapier tests. `tests/browser/`: Playwright.
- `README.md`: setup and integration; `MIGRATION.md`: v1 changes;
  `docs/API.md`: exact behavior. Update them with public contract changes.

## Toolchain and commands

Use mise's pinned Node from `mise.toml`, not an arbitrary system Node. The package
is TypeScript, strict mode, ESM only, with `.js` suffixes in relative source imports.
Three.js is a peer; Rapier is an external runtime dependency. Keep dependency
changes intentional and update `package-lock.json` together with the manifest.

```sh
mise run setup           # npm ci; installs the locked graph
mise run dev             # local playground
mise run verify          # format, types, unit/physics tests, library + demo builds
mise run setup:browser   # local Chromium headless shell
mise run test:browser    # browser integration and screenshots
mise exec -- npm pack    # local archive; prepack rebuilds the library
```

On Linux, Playwright may need system dependencies; CI uses
`mise exec -- npm exec -- playwright install --with-deps chromium --only-shell`.
Installing system packages requires appropriate authorization in the host environment.

Do not hand-edit generated `dist/`, `playground-dist/`, `test-results/`, dependency
contents or `.local/` artifacts. Keep generated output and local archives out of Git.
Use temporary or ignored locations for isolated package-consumer checks.

## Contracts to preserve

- Independent disposable worlds; shared WASM initialization must not share bodies
  or requests. Keep one request per world and clear timers/listeners on completion.
- Fixed stepping with bounded catch-up; asynchronous directed preparation must
  yield, remain cancellable and free snapshots on all exit paths.
- Validate inputs before changing live state. Preserve ownership checks, timeout
  bounds, synchronous validation failures and asynchronous request rejections.
- Physics is authoritative. Directed rolls remap labels and verify the replay;
  never report a requested value when orientation disagrees. Do not claim standard
  opposite-face numbering after remapping or certified unbiased random outcomes.
- Preserve D4's downward-face convention and D10's 1–10 values. Changes to legacy
  topology/numbering or the public API need an explicit rationale and migration docs.
- Keep contact settings consistent across dice and built-in surfaces. Dispose
  meshes, bodies, geometry, materials and texture leases through their owners.
- Keep internal implementation methods out of integration examples. Document
  creation overlap, world units and rendering responsibilities accurately.
- Handle browser lifecycle explicitly: persisted `pagehide` must preserve reusable
  resources, permanent teardown must clean them up. A synthetic lifecycle test is
  not evidence of native browser cache admission.

## Verification and review

Run `mise run verify` for code changes. Run browser tests for rendering, textures,
playground, lifecycle and browser integration changes. Add focused regression
coverage for behavior fixes; avoid tests that merely copy the implementation.
Documentation-only changes need formatting, local link checks and comparison of
examples/options with source; do not add irrelevant tests just to increase a count.

For export, declaration, dependency or packaging changes, pack into an isolated
location, inspect archive contents and import/run the extracted package as a consumer.
Include a check starting without `dist/` when changing prepack/build behavior.
Browser tests use the development server and source imports; they do not validate
the published archive or production build on their own.

Inspect screenshots for visual acceptance; artifact existence is not approval.
Report checks actually run, their results, and missing evidence. Do not equate local
passes with CI, publication or deployed behavior. Prioritize review findings by
impact, link exact files/lines and give a reproduction or concrete failure path.
Keep review results in chat/local files unless posting them was explicitly requested.

## Release boundaries

This checkout declares `2.0.0-alpha.0`; re-read the manifest before describing its
version. Do not claim registry availability from local metadata. `npm pack` creates
a local archive and triggers a build; `npm publish` is an externally visible release
and needs explicit authorization. Prepack runs the build, not the full test suite.

Before an authorized release, validate the current diff, tests, browser behavior,
archive exports/declarations and migration instructions. Present the exact version,
registry/tag and proposed action for approval. After publishing, verify the actual
registry artifact separately and report its state; a successful local build is not
release evidence. Never bypass failed checks or protected workflows to finish faster.
