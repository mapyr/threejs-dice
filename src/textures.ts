import { CanvasTexture, SRGBColorSpace } from 'three';
import { ATLAS_COLUMNS, ATLAS_ROWS, mapValue } from './geometry.js';
import { getShape } from './shapes.js';
import type { DiceSides } from './shapes.js';

interface Entry {
  texture: CanvasTexture;
  refs: number;
}
const cache = new Map<string, Entry>();
export interface TextureLease {
  texture: CanvasTexture | null;
  release(): void;
}

export function acquireTexture(
  sides: DiceSides,
  color: string,
  ink: string,
  offset: number,
): TextureLease {
  if (typeof document === 'undefined') return { texture: null, release() {} };
  const key = JSON.stringify([sides, color, ink, offset]);
  let entry = cache.get(key);
  if (!entry) {
    const cellSize = 256;
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_COLUMNS * cellSize;
    canvas.height = ATLAS_ROWS * cellSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const shape = getShape(sides);
    shape.faces.forEach((face, i) => {
      if (face.at(-1)! < 0) return;
      const cell = i + 1,
        x = (cell % ATLAS_COLUMNS) * cellSize,
        y = Math.floor(cell / ATLAS_COLUMNS) * cellSize;
      if (sides === 4) {
        // Each visible vertex carries the value of its opposite (bottom) face.
        face.slice(0, -1).forEach((vertex, k) => {
          const opposite = shape.faces.find(
            (f) => !f.slice(0, -1).includes(vertex),
          )!;
          const angle = shape.af + (Math.PI * 2 * k) / 3;
          ctx.save();
          ctx.translate(
            x + 128 + Math.cos(angle) * 60,
            y + 128 - Math.sin(angle) * 60,
          );
          ctx.rotate(Math.PI / 2 - angle);
          ctx.font = 'bold 48px sans-serif';
          ctx.fillText(String(mapValue(opposite.at(-1)!, offset, sides)), 0, 0);
          ctx.restore();
        });
      } else {
        const value = mapValue(
          face.at(-1) === 0 ? sides : face.at(-1)!,
          offset,
          sides,
        );
        ctx.font = 'bold 108px sans-serif';
        ctx.fillText(String(value), x + 128, y + 128);
        if (value === 6 || value === 9) ctx.fillRect(x + 104, y + 186, 48, 5);
      }
    });
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    entry = { texture, refs: 0 };
    cache.set(key, entry);
  }
  entry.refs++;
  const acquired = entry;
  let released = false;
  return {
    texture: acquired.texture,
    release() {
      if (released) return;
      released = true;
      if (--acquired.refs === 0) {
        acquired.texture.dispose();
        cache.delete(key);
      }
    },
  };
}
