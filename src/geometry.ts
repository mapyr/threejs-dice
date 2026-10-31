import {
  BufferGeometry,
  Float32BufferAttribute,
  Quaternion,
  Vector3,
} from 'three';
import { bevel } from './bevel.js';
import { getShape, shapeVertices } from './shapes.js';
import type { DiceSides } from './shapes.js';

export interface DieFace {
  normal: Vector3;
  value: number;
  vertices: number[];
}
export interface DieGeometry {
  geometry: BufferGeometry;
  vertices: Vector3[];
  faces: DieFace[];
}
export const ATLAS_COLUMNS = 8;
export const ATLAS_ROWS = 3;
export const mapValue = (
  value: number,
  offset: number,
  sides: number,
): number => ((((value - 1 + offset) % sides) + sides) % sides) + 1;

export function createDieGeometry(sides: DiceSides, size: number): DieGeometry {
  const shape = getShape(sides);
  const vertices = shapeVertices(shape, size);
  const faces = shape.faces
    .filter((f) => f.at(-1)! >= 0)
    .map((f) => {
      const indices = f.slice(0, -1);
      const normal = new Vector3()
        .subVectors(vertices[indices[1]], vertices[indices[0]])
        .cross(
          new Vector3().subVectors(vertices[indices[2]], vertices[indices[0]]),
        )
        .normalize();
      return {
        normal,
        value: f.at(-1) === 0 ? sides : f.at(-1)!,
        vertices: indices,
      };
    });
  const beveled = bevel(vertices, shape.faces, shape.chamfer);
  const positions: number[] = [],
    uvs: number[] = [];
  for (const face of beveled.faces) {
    const indices = face.slice(0, -1),
      label = face.at(-1)!;
    const cell =
      label < 0 ? 0 : shape.faces.findIndex((f) => f.at(-1) === label) + 1;
    const angle = (Math.PI * 2) / indices.length;
    for (let j = 1; j < indices.length - 1; j++) {
      for (const k of [0, j, j + 1]) {
        positions.push(...beveled.vectors[indices[k]].toArray());
        const u = 0.5 + 0.44 * Math.cos(shape.af + angle * k);
        const v = 0.5 + 0.44 * Math.sin(shape.af + angle * k);
        uvs.push(
          ((cell % ATLAS_COLUMNS) + u) / ATLAS_COLUMNS,
          (ATLAS_ROWS - 1 - Math.floor(cell / ATLAS_COLUMNS) + v) / ATLAS_ROWS,
        );
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, vertices, faces };
}

export function readFace(
  faces: DieFace[],
  sides: DiceSides,
  rotation: Quaternion,
): DieFace {
  const up = new Vector3(0, sides === 4 ? -1 : 1, 0);
  let best = faces[0],
    score = -Infinity;
  for (const face of faces) {
    const dot = face.normal.clone().applyQuaternion(rotation).dot(up);
    if (dot > score) {
      score = dot;
      best = face;
    }
  }
  return best;
}
