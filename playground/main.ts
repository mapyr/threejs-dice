import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DiceWorld, DICE_SIDES } from '../src/index.js';
import type { Die, DiceSides } from '../src/index.js';

const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const input = (id: string) => el<HTMLInputElement>(id);
const viewport = el('scene');
const status = el('status'),
  phase = el('phase');
const rollButton = el<HTMLButtonElement>('roll'),
  targetButton = el<HTMLButtonElement>('directed');
const settings = el<HTMLFieldSetElement>('settings');
const cancelButton = el<HTMLButtonElement>('cancel');
const resetButton = el<HTMLButtonElement>('reset');
let rollSequence = 0;
let world: DiceWorld | undefined;
let dice: Die[] = [];
let controller: AbortController | undefined;
let lastResults: number[] | undefined;
let rebuilding = false;
let elapsed = 0;
let finalElapsed = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#172023');
scene.fog = new THREE.Fog('#172023', 35, 65);
const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);
camera.position.set(22, 28, 28);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
viewport.append(renderer.domElement);
renderer.domElement.setAttribute('aria-label', '3D dice on a physics tray');
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.minDistance = 15;
controls.maxDistance = 55;
controls.maxPolarAngle = Math.PI / 2.15;
scene.add(new THREE.HemisphereLight('#deeee9', '#28312a', 2.5));
const light = new THREE.DirectionalLight('#fff5df', 4);
light.position.set(-8, 18, 8);
light.castShadow = true;
light.shadow.mapSize.set(2048, 2048);
Object.assign(light.shadow.camera, {
  left: -14,
  right: 14,
  top: 14,
  bottom: -14,
  near: 1,
  far: 50,
});
light.shadow.normalBias = 0.04;
light.shadow.bias = -0.0001;
scene.add(light);
const rim = new THREE.DirectionalLight('#9fd4db', 2);
rim.position.set(10, 10, -10);
scene.add(rim);
const tray = new THREE.Mesh(
  new THREE.BoxGeometry(21, 0.6, 21),
  new THREE.MeshStandardMaterial({ color: '#263b37', roughness: 0.95 }),
);
tray.position.y = -0.32;
tray.receiveShadow = true;
scene.add(tray);
const wallMaterial = new THREE.MeshStandardMaterial({
  color: '#3e5650',
  roughness: 0.65,
  metalness: 0.15,
});
for (const [x, z, w, d] of [
  [-10.25, 0, 0.5, 21],
  [10.25, 0, 0.5, 21],
  [0, -10.25, 21, 0.5],
  [0, 10.25, 21, 0.5],
]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, d), wallMaterial);
  wall.position.set(x, 0.15, z);
  wall.receiveShadow = true;
  wall.castShadow = true;
  scene.add(wall);
}
const grid = new THREE.GridHelper(20, 20, '#527064', '#354d43');
grid.position.y = 0.005;
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.24;
scene.add(grid);
const debug = new THREE.LineSegments(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({
    vertexColors: true,
    depthTest: false,
    transparent: true,
    opacity: 0.7,
  }),
);
debug.renderOrder = 10;
debug.visible = false;
scene.add(debug);
let fittedScale = 1;
const observer = new ResizeObserver(() => {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.setSize(width, height);
  camera.aspect = width / height;
  const nextScale = Math.min(1.2, Math.max(1, 1.2 / camera.aspect));
  camera.position
    .sub(controls.target)
    .multiplyScalar(nextScale / fittedScale)
    .add(controls.target);
  fittedScale = nextScale;
  camera.updateProjectionMatrix();
});
observer.observe(viewport);

function config() {
  return {
    sides: el<HTMLSelectElement>('shape').value,
    count: Math.max(
      1,
      Math.min(12, Math.floor(Number(input('count').value) || 1)),
    ),
    color: input('color').value,
    ink: input('ink').value,
    size: Math.max(0.5, Math.min(1.5, Number(input('size').value) || 1.15)),
    friction: Number(input('friction').value),
    restitution: Number(input('restitution').value),
    strength: Number(input('strength').value),
    target: Math.max(
      1,
      Math.min(20, Math.floor(Number(input('target').value) || 1)),
    ),
  };
}
function updateSnippet() {
  const c = config();
  const sides = c.sides === 'mixed' ? 20 : Number(c.sides);
  el('snippet').textContent =
    `import { DiceWorld } from 'threejs-dice';\n\nconst world = await DiceWorld.create({ friction: ${c.friction}, restitution: ${c.restitution} });\nconst die = world.createDie({ sides: ${sides}, size: ${c.size}, color: '${c.color}', fontColor: '${c.ink}' });\nscene.add(die.mesh);\n\n// Call world.update(deltaSeconds) in your animation loop.\nconst [result] = await world.roll([die], { strength: ${c.strength} });\n// Or: await world.rollTo([{ die, value: ${Math.min(c.target, sides)} }]);\n// Cleanup: world.dispose();`;
}
function showValues() {
  el('values').replaceChildren(
    ...dice.map((die, i) => {
      const card = document.createElement('div');
      card.className = 'result';
      const label = document.createElement('small');
      label.textContent = `D${die.sides}`;
      const value = document.createElement('strong');
      value.textContent = lastResults ? String(lastResults[i]) : '—';
      card.append(label, value);
      return card;
    }),
  );
}

function updateHistoryCount() {
  const count = el('history').children.length;
  el('history-count').textContent = `${count} / 20`;
  el('history-empty').hidden = count > 0;
  el<HTMLButtonElement>('clear-history').disabled = count === 0;
}
function recordRoll(directed: boolean, values: number[]) {
  const entry = document.createElement('li');
  const heading = document.createElement('span');
  heading.className = 'history-kind';
  heading.textContent = `#${++rollSequence} · ${directed ? 'Directed' : 'Free'}`;
  const results = document.createElement('span');
  results.className = 'history-values';
  results.textContent = values
    .map((value, i) => `D${dice[i].sides}: ${value}`)
    .join(' · ');
  const total = document.createElement('strong');
  total.textContent = `Σ ${values.reduce((sum, value) => sum + value, 0)}`;
  const duration = document.createElement('span');
  duration.className = 'history-duration';
  duration.textContent = `${elapsed.toFixed(1)}s`;
  entry.append(heading, results, total, duration);
  el('history').prepend(entry);
  while (el('history').children.length > 20)
    el('history').lastElementChild?.remove();
  updateHistoryCount();
}

function busy(value: boolean) {
  settings.disabled = value;
  rollButton.disabled = value || !world;
  targetButton.disabled = value || !world;
  resetButton.disabled = value;
  cancelButton.hidden = !value;
}
async function rebuild() {
  if (rebuilding || world?.rolling) return;
  rebuilding = true;
  busy(true);
  try {
    const c = config();
    input('count').value = String(c.count);
    input('size').value = String(c.size);
    world?.dispose();
    world = undefined;
    dice = [];
    world = await DiceWorld.create({
      friction: c.friction,
      restitution: c.restitution,
    });
    for (let i = 0; i < c.count; i++) {
      const die = world.createDie({
        sides:
          c.sides === 'mixed'
            ? DICE_SIDES[i % 6]
            : (Number(c.sides) as DiceSides),
        size: c.size,
        color: c.color,
        fontColor: c.ink,
      });
      die.body.setTranslation(
        {
          x: ((i % 4) - 1.5) * 3.5,
          y: 3 + Math.floor(i / 4) * 2.8,
          z: (Math.floor(i / 4) - 1) * 3.8,
        },
        true,
      );
      scene.add(die.mesh);
      dice.push(die);
    }
    world.update(0);
    lastResults = undefined;
    finalElapsed = 0;
    phase.textContent = 'READY';
    status.textContent = 'Your party is ready. Give it a roll.';
    showValues();
    updateSnippet();
  } catch (error) {
    world?.dispose();
    world = undefined;
    dice = [];
    lastResults = undefined;
    showValues();
    status.textContent = String(error);
    phase.textContent = 'ERROR';
  } finally {
    rebuilding = false;
    busy(false);
  }
}
async function roll(directed: boolean) {
  if (!world || rebuilding || world.rolling) return;
  controller = new AbortController();
  busy(true);
  lastResults = undefined;
  showValues();
  elapsed = 0;
  try {
    const c = config(),
      options = { signal: controller.signal, strength: c.strength };
    status.textContent = directed
      ? 'Predicting a trajectory, then replaying with remapped labels…'
      : 'Gravity is considering your request…';
    lastResults = await (directed
      ? world.rollTo(
          dice.map((die) => ({ die, value: Math.min(c.target, die.sides) })),
          options,
        )
      : world.roll(dice, options));
    finalElapsed = elapsed;
    recordRoll(directed, lastResults);
    phase.textContent = 'SETTLED';
    status.textContent = `${directed ? 'Directed' : 'Free'} roll complete · total ${lastResults.reduce((a, b) => a + b, 0)} · ${elapsed.toFixed(1)}s`;
    showValues();
  } catch (error) {
    phase.textContent = 'STOPPED';
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    controller = undefined;
    busy(false);
  }
}
rollButton.addEventListener('click', () => void roll(false));
targetButton.addEventListener('click', () => void roll(true));
cancelButton.addEventListener('click', () => controller?.abort());
resetButton.addEventListener('click', () => void rebuild());
el('camera').addEventListener('click', () => {
  camera.position.set(22, 28, 28).multiplyScalar(fittedScale);
  controls.target.set(0, 0, 0);
  controls.update();
});
el('clear-history').addEventListener('click', () => {
  el('history').replaceChildren();
  updateHistoryCount();
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') controller?.abort();
  const target = event.target;
  if (
    event.code !== 'Space' ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
    return;
  if (
    target instanceof HTMLElement &&
    (target.closest('input, select, button, textarea, summary, a') ||
      target.isContentEditable)
  )
    return;
  event.preventDefault();
  if (!rollButton.disabled) void roll(false);
});
for (const id of [
  'shape',
  'count',
  'color',
  'ink',
  'size',
  'friction',
  'restitution',
])
  el(id).addEventListener('change', () => void rebuild());
for (const id of ['strength', 'friction', 'restitution'])
  input(id).addEventListener('input', () => {
    el(`${id}-value`).textContent =
      Number(input(id).value).toFixed(id === 'strength' ? 1 : 2) +
      (id === 'strength' ? '×' : '');
    updateSnippet();
  });
input('target').addEventListener('change', () => {
  input('target').value = String(config().target);
  updateSnippet();
});
el('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el('snippet').textContent ?? '');
    el('copy').textContent = 'Copied ✓';
  } catch {
    status.textContent =
      'Clipboard unavailable. Open the integration snippet to copy manually.';
  }
});
input('debug').addEventListener('change', () => {
  debug.visible = input('debug').checked;
});
let last = performance.now(),
  metricsTime = 0;
renderer.setAnimationLoop((now: number) => {
  const delta = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (world) {
    world.update(delta);
    if (world.rolling) {
      elapsed += delta;
      phase.textContent = world.preparing ? 'PREPARING' : 'ROLLING';
    }
    if (debug.visible) {
      const { vertices, colors } = world.debugRender();
      debug.geometry.dispose();
      debug.geometry = new THREE.BufferGeometry();
      debug.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(vertices, 3),
      );
      debug.geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(colors, 4),
      );
    }
  }
  controls.update();
  renderer.render(scene, camera);
  if (now - metricsTime > 250) {
    metricsTime = now;
    el('metrics').textContent =
      `${renderer.info.render.calls} DRAWS · ${renderer.info.memory.textures} TEX · ${(world?.rolling ? elapsed : finalElapsed).toFixed(1)}s`;
    el('metrics').dataset.textures = String(renderer.info.memory.textures);
    el('metrics').dataset.geometries = String(renderer.info.memory.geometries);
  }
});
void rebuild();
window.addEventListener('pagehide', (event) => {
  controller?.abort();
  if (event.persisted) return;
  renderer.setAnimationLoop(null);
  observer.disconnect();
  world?.dispose();
  controls.dispose();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((m) => m.dispose());
    }
  });
  renderer.dispose();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) last = performance.now();
});
