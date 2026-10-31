import { Vector3 } from 'three';

// Bevel topology adapted from the original MIT implementation.
export function bevel(vectors: Vector3[], faces: number[][], chamfer: number) {
  const chamfer_vectors: Vector3[] = [],
    chamfer_faces: number[][] = [],
    corner_faces: number[][] = new Array(vectors.length);
  for (let i = 0; i < vectors.length; ++i) corner_faces[i] = [];
  for (let i = 0; i < faces.length; ++i) {
    let ii = faces[i],
      fl = ii.length - 1;
    let center_point = new Vector3();
    const face = new Array<number>(fl);
    for (let j = 0; j < fl; ++j) {
      let vv = vectors[ii[j]].clone();
      center_point.add(vv);
      corner_faces[ii[j]].push((face[j] = chamfer_vectors.push(vv) - 1));
    }
    center_point.divideScalar(fl);
    for (let j = 0; j < fl; ++j) {
      let vv = chamfer_vectors[face[j]];
      vv.subVectors(vv, center_point)
        .multiplyScalar(chamfer)
        .addVectors(vv, center_point);
    }
    face.push(ii[fl]);
    chamfer_faces.push(face);
  }
  for (let i = 0; i < faces.length - 1; ++i) {
    for (let j = i + 1; j < faces.length; ++j) {
      const pairs: number[][] = [];
      let lastm = -1;
      for (let m = 0; m < faces[i].length - 1; ++m) {
        let n = faces[j].indexOf(faces[i][m]);
        if (n >= 0 && n < faces[j].length - 1) {
          if (lastm >= 0 && m !== lastm + 1) pairs.unshift([i, m], [j, n]);
          else pairs.push([i, m], [j, n]);
          lastm = m;
        }
      }
      if (pairs.length !== 4) continue;
      chamfer_faces.push([
        chamfer_faces[pairs[0][0]][pairs[0][1]],
        chamfer_faces[pairs[1][0]][pairs[1][1]],
        chamfer_faces[pairs[3][0]][pairs[3][1]],
        chamfer_faces[pairs[2][0]][pairs[2][1]],
        -1,
      ]);
    }
  }
  for (let i = 0; i < corner_faces.length; ++i) {
    let cf = corner_faces[i],
      face = [cf[0]],
      count = cf.length - 1;
    while (count) {
      for (let m = faces.length; m < chamfer_faces.length; ++m) {
        let index = chamfer_faces[m].indexOf(face[face.length - 1]);
        if (index >= 0 && index < 4) {
          if (--index === -1) index = 3;
          let next_vertex = chamfer_faces[m][index];
          if (cf.indexOf(next_vertex) >= 0) {
            face.push(next_vertex);
            break;
          }
        }
      }
      --count;
    }
    face.push(-1);
    chamfer_faces.push(face);
  }
  return { vectors: chamfer_vectors, faces: chamfer_faces };
}
