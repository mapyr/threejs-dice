import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import legacy from './legacy-shapes.json';
import { getShape, DICE_SIDES } from '../src/shapes.js';
import { createDieGeometry, mapValue, readFace } from '../src/geometry.js';

describe('legacy geometry and numbering contract', () => {
  for (const sides of DICE_SIDES) {
    it(`preserves D${sides} topology and all ${sides} face values`, () => {
      const { sides: _, ...expected } = legacy.find((s) => s.sides === sides)!;
      expect(getShape(sides)).toEqual(expected);
      const { geometry, vertices, faces } = createDieGeometry(sides, 1);
      expect(faces).toHaveLength(sides);
      expect(faces.map((f) => f.value).sort((a, b) => a - b)).toEqual(
        Array.from({ length: sides }, (_, i) => i + 1),
      );
      const positions = geometry.getAttribute('position');
      expect(positions.count).toBeGreaterThan(sides * 3);
      expect([...positions.array].every(Number.isFinite)).toBe(true);
      expect(
        [...geometry.getAttribute('uv').array].every((v) => v >= 0 && v <= 1),
      ).toBe(true);
      for (const face of faces) {
        const centroid = face.vertices.reduce(
          (sum, i) => sum.add(vertices[i]),
          new Vector3(),
        );
        expect(face.normal.dot(centroid)).toBeGreaterThan(0);
        const q = new Quaternion().setFromUnitVectors(
          face.normal,
          new Vector3(0, sides === 4 ? -1 : 1, 0),
        );
        expect(readFace(faces, sides, q).value).toBe(face.value);
        for (let value = 1; value <= sides; value++)
          expect(mapValue(face.value, value - face.value, sides)).toBe(value);
      }
      geometry.dispose();
    });
  }
});
