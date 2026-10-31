import { Vector3 } from 'three';

export const DICE_SIDES = [4, 6, 8, 10, 12, 20] as const;
export type DiceSides = (typeof DICE_SIDES)[number];
export interface ShapeDefinition {
  vertices: number[][];
  faces: number[][];
  scaleFactor: number;
  chamfer: number;
  tab: number;
  af: number;
}

// Original polyhedra and numbering by Anton Natarov / byWulf (MIT).
export function getShape(sides: DiceSides): ShapeDefinition {
  let vertices: number[][] = [];
  let faces: number[][] = [];
  let scaleFactor = 1,
    chamfer = 0.96,
    tab = 0,
    af = 0;
  switch (sides) {
    case 4: {
      tab = -0.1;
      af = (Math.PI * 7) / 6;
      chamfer = 0.96;
      vertices = [
        [1, 1, 1],
        [-1, -1, 1],
        [-1, 1, -1],
        [1, -1, -1],
      ];
      faces = [
        [1, 0, 2, 1],
        [0, 1, 3, 2],
        [0, 3, 2, 3],
        [1, 2, 3, 4],
      ];
      scaleFactor = 1.2;
      break;
    }
    case 6: {
      tab = 0.1;
      af = Math.PI / 4;
      chamfer = 0.96;
      vertices = [
        [-1, -1, -1],
        [1, -1, -1],
        [1, 1, -1],
        [-1, 1, -1],
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ];
      faces = [
        [0, 3, 2, 1, 1],
        [1, 2, 6, 5, 2],
        [0, 1, 5, 4, 3],
        [3, 7, 6, 2, 4],
        [0, 4, 7, 3, 5],
        [4, 5, 6, 7, 6],
      ];
      scaleFactor = 0.9;
      break;
    }
    case 8: {
      tab = 0;
      af = -Math.PI / 4 / 2;
      chamfer = 0.965;
      vertices = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      faces = [
        [0, 2, 4, 1],
        [0, 4, 3, 2],
        [0, 3, 5, 3],
        [0, 5, 2, 4],
        [1, 3, 4, 5],
        [1, 4, 2, 6],
        [1, 2, 5, 7],
        [1, 5, 3, 8],
      ];
      scaleFactor = 1;
      break;
    }
    case 10: {
      tab = 0;
      af = (Math.PI * 6) / 5;
      chamfer = 0.945;
      vertices = [];
      faces = [
        [5, 7, 11, 0],
        [4, 2, 10, 1],
        [1, 3, 11, 2],
        [0, 8, 10, 3],
        [7, 9, 11, 4],
        [8, 6, 10, 5],
        [9, 1, 11, 6],
        [2, 0, 10, 7],
        [3, 5, 11, 8],
        [6, 4, 10, 9],
        [1, 0, 2, -1],
        [1, 2, 3, -1],
        [3, 2, 4, -1],
        [3, 4, 5, -1],
        [5, 4, 6, -1],
        [5, 6, 7, -1],
        [7, 6, 8, -1],
        [7, 8, 9, -1],
        [9, 8, 0, -1],
        [9, 0, 1, -1],
      ];
      for (let i = 0, b = 0; i < 10; ++i, b += (Math.PI * 2) / 10) {
        vertices.push([Math.cos(b), Math.sin(b), 0.105 * (i % 2 ? 1 : -1)]);
      }
      vertices.push([0, 0, -1]);
      vertices.push([0, 0, 1]);
      scaleFactor = 0.9;
      break;
    }
    case 12: {
      let p = (1 + Math.sqrt(5)) / 2;
      let q = 1 / p;
      tab = 0.2;
      af = -Math.PI / 4 / 2;
      chamfer = 0.968;
      vertices = [
        [0, q, p],
        [0, q, -p],
        [0, -q, p],
        [0, -q, -p],
        [p, 0, q],
        [p, 0, -q],
        [-p, 0, q],
        [-p, 0, -q],
        [q, p, 0],
        [q, -p, 0],
        [-q, p, 0],
        [-q, -p, 0],
        [1, 1, 1],
        [1, 1, -1],
        [1, -1, 1],
        [1, -1, -1],
        [-1, 1, 1],
        [-1, 1, -1],
        [-1, -1, 1],
        [-1, -1, -1],
      ];
      faces = [
        [2, 14, 4, 12, 0, 1],
        [15, 9, 11, 19, 3, 2],
        [16, 10, 17, 7, 6, 3],
        [6, 7, 19, 11, 18, 4],
        [6, 18, 2, 0, 16, 5],
        [18, 11, 9, 14, 2, 6],
        [1, 17, 10, 8, 13, 7],
        [1, 13, 5, 15, 3, 8],
        [13, 8, 12, 4, 5, 9],
        [5, 4, 14, 9, 15, 10],
        [0, 12, 8, 10, 16, 11],
        [3, 19, 7, 17, 1, 12],
      ];
      scaleFactor = 0.9;
      break;
    }
    case 20: {
      let t = (1 + Math.sqrt(5)) / 2;
      tab = -0.2;
      af = -Math.PI / 4 / 2;
      chamfer = 0.955;
      vertices = [
        [-1, t, 0],
        [1, t, 0],
        [-1, -t, 0],
        [1, -t, 0],
        [0, -1, t],
        [0, 1, t],
        [0, -1, -t],
        [0, 1, -t],
        [t, 0, -1],
        [t, 0, 1],
        [-t, 0, -1],
        [-t, 0, 1],
      ];
      faces = [
        [0, 11, 5, 1],
        [0, 5, 1, 2],
        [0, 1, 7, 3],
        [0, 7, 10, 4],
        [0, 10, 11, 5],
        [1, 5, 9, 6],
        [5, 11, 4, 7],
        [11, 10, 2, 8],
        [10, 7, 6, 9],
        [7, 1, 8, 10],
        [3, 9, 4, 11],
        [3, 4, 2, 12],
        [3, 2, 6, 13],
        [3, 6, 8, 14],
        [3, 8, 9, 15],
        [4, 9, 5, 16],
        [2, 4, 11, 17],
        [6, 2, 10, 18],
        [8, 6, 7, 19],
        [9, 8, 1, 20],
      ];
      scaleFactor = 1;
      break;
    }
    default:
      throw new RangeError('Supported dice: D4, D6, D8, D10, D12, D20');
  }
  return { vertices, faces, scaleFactor, chamfer, tab, af };
}

export function shapeVertices(shape: ShapeDefinition, size: number): Vector3[] {
  return shape.vertices.map((v) =>
    new Vector3()
      .fromArray(v)
      .normalize()
      .multiplyScalar(size * shape.scaleFactor),
  );
}
