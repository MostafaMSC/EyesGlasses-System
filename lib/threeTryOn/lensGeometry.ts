import { Box3, BufferAttribute, Mesh, Object3D, Vector3 } from "three";

/**
 * Removes the lens surfaces from a frame model, leaving the rims open.
 *
 * A generated model arrives as one mesh with one material — there is no
 * "lens" object to hide, and no material to make transparent without also
 * making the frame transparent. So the lenses have to be found in the
 * geometry itself.
 *
 * A face is lens if it sits inside one of the two lens openings, faces the
 * viewer (front surface) or away (back surface — lenses are thin solids),
 * and lies at lens depth rather than out on the rim's front. Each test on its
 * own is weak; together they are decisive, and the ellipse is set just
 * *inside* a typical lens, so at worst a hair of lens is left at the rim's
 * edge — invisible under it — and the rim itself can never be taken.
 *
 * Deliberately not a region-grow: generated surfaces are bumpy, and growing
 * face-to-face across them breaks into islands wherever a normal wobbles.
 */

/** Same assumption the loader makes: lens centres at 45% of the total width. */
const LENS_SPAN_FRACTION = 0.45;
/** Depth slice, from the front, the lenses live in. */
const FRONT_SLICE = 0.15;
/** |normal·Z| a face needs to count as a lens surface (front or back). */
const FACING = 0.5;
/**
 * The lens region, in lens-span units. A real lens isn't centred on its
 * optical centre — it reaches further out toward the temple than in toward
 * the nose — so the ellipse is nudged outward to cover that flare without
 * reaching the bridge.
 */
const LENS_RX = 0.5;
const LENS_RY = 0.38;
const LENS_OUTWARD_SHIFT = 0.06;
/**
 * Depth window around the front lens surface, as fractions of width. Reaches
 * back far enough to take the lens's rear surface; forward only a little, so
 * the rim's front — which stands proud of the lens — is left alone.
 */
const DEPTH_BEHIND = 0.06;
const DEPTH_AHEAD = 0.02;

/**
 * Strips the lens faces out of every mesh under `root`, in place. Returns how
 * many faces were removed, so a caller can tell whether anything was found.
 */
export function stripLenses(root: Object3D): number {
  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  if (!(size.x > 0)) return 0;
  const centreX = (box.min.x + box.max.x) / 2;
  const lensSpan = size.x * LENS_SPAN_FRACTION;
  const rx = lensSpan * LENS_RX;
  const ry = lensSpan * LENS_RY;
  const frontCut = box.max.z - size.z * FRONT_SLICE;

  let removed = 0;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();

  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    if (!position) return;
    const index = geometry.index;
    const faceCount = index ? index.count / 3 : position.count / 3;
    const vertexOf = (f: number, k: number) => (index ? index.getX(f * 3 + k) : f * 3 + k);

    mesh.updateWorldMatrix(true, false);
    const cx = new Float32Array(faceCount);
    const cy = new Float32Array(faceCount);
    const cz = new Float32Array(faceCount);
    const nz = new Float32Array(faceCount);
    for (let f = 0; f < faceCount; f++) {
      a.fromBufferAttribute(position, vertexOf(f, 0)).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, vertexOf(f, 1)).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, vertexOf(f, 2)).applyMatrix4(mesh.matrixWorld);
      cx[f] = (a.x + b.x + c.x) / 3;
      cy[f] = (a.y + b.y + c.y) / 3;
      cz[f] = (a.z + b.z + c.z) / 3;
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      ab.cross(ac);
      const len = ab.length();
      nz[f] = len > 0 ? ab.z / len : 0;
    }

    // Lens height, and the depth of the front lens surface: taken from the
    // forward-facing faces in the two lens columns of the front slice.
    let ySum = 0;
    let zSum = 0;
    let count = 0;
    for (let f = 0; f < faceCount; f++) {
      if (cz[f] < frontCut || nz[f] < FACING) continue;
      if (Math.abs(Math.abs(cx[f] - centreX) - lensSpan / 2) > size.x * 0.04) continue;
      ySum += cy[f];
      zSum += cz[f];
      count++;
    }
    if (count < 20) return;
    const lensY = ySum / count;
    const lensZ = zSum / count;
    const zMin = lensZ - size.x * DEPTH_BEHIND;
    const zMax = lensZ + size.x * DEPTH_AHEAD;

    const keep: number[] = [];
    let dropped = 0;
    for (let f = 0; f < faceCount; f++) {
      let isLens = false;
      if (Math.abs(nz[f]) >= FACING && cz[f] >= zMin && cz[f] <= zMax) {
        for (const sign of [-1, 1]) {
          const ellipseX = centreX + sign * (lensSpan / 2 + lensSpan * LENS_OUTWARD_SHIFT);
          const dx = (cx[f] - ellipseX) / rx;
          const dy = (cy[f] - lensY) / ry;
          if (dx * dx + dy * dy <= 1) {
            isLens = true;
            break;
          }
        }
      }
      if (isLens) dropped++;
      else keep.push(vertexOf(f, 0), vertexOf(f, 1), vertexOf(f, 2));
    }
    if (dropped === 0) return;

    geometry.setIndex(new BufferAttribute(Uint32Array.from(keep), 1));
    removed += dropped;
  });
  return removed;
}
