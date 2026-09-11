import {
  CatmullRomCurve3,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Path,
  Shape,
  TubeGeometry,
  Vector3,
} from "three";
import type { FrameShape } from "@/lib/frameShapes";
import type { TryOnConfig } from "@/data/products";

/**
 * A stand-in 3D frame, built from the same shape/colour fields that drive the
 * generated 2D artwork in lib/frameShapes.ts.
 *
 * Real products need a real GLB — this will never match an actual frame's
 * design. It exists so the 3D tracking pipeline can be evaluated on a live
 * face (does the frame stay on the eyes, do the arms go behind the ears?)
 * before anyone has modelled anything, and so products without a GLB still
 * have something to render in 3D mode.
 *
 * Everything is built in "lens-span units": the two lens centres sit at
 * x = ±0.5, exactly 1 unit apart. `fitGlassesModel` scales from there, so the
 * absolute size here is arbitrary as long as that one invariant holds.
 */

/** Lens centres at ±0.5 — the unit every other measurement here is in. */
const LENS_HALF_SPAN = 0.5;

interface ShapeProfile {
  /** Lens width and height, in lens-span units. */
  lensWidth: number;
  lensHeight: number;
  /** Corner rounding as a fraction of the lens half-height (1 = fully round). */
  roundness: number;
  /** Lifts the outer top corner, for cat-eye / aviator style brows. */
  browLift: number;
  rimThickness: number;
  metalness: number;
  roughness: number;
}

const ACETATE = { rimThickness: 0.085, metalness: 0.08, roughness: 0.28 };
const METAL = { rimThickness: 0.032, metalness: 0.95, roughness: 0.22 };

const SHAPE_PROFILES: Record<FrameShape, ShapeProfile> = {
  aviator: { lensWidth: 0.78, lensHeight: 0.68, roundness: 0.85, browLift: 0.06, ...METAL },
  wayfarer: { lensWidth: 0.82, lensHeight: 0.62, roundness: 0.34, browLift: 0.1, ...ACETATE },
  round: { lensWidth: 0.74, lensHeight: 0.74, roundness: 1, browLift: 0, ...METAL },
  rectangle: { lensWidth: 0.86, lensHeight: 0.5, roundness: 0.2, browLift: 0, ...ACETATE },
  catEye: { lensWidth: 0.8, lensHeight: 0.6, roundness: 0.45, browLift: 0.2, ...ACETATE },
  oversized: { lensWidth: 0.94, lensHeight: 0.78, roundness: 0.4, browLift: 0.05, ...ACETATE },
  sport: { lensWidth: 0.88, lensHeight: 0.56, roundness: 0.5, browLift: 0.04, ...ACETATE },
  opticalSquare: { lensWidth: 0.82, lensHeight: 0.6, roundness: 0.24, browLift: 0.02, ...METAL },
  acetateSquare: { lensWidth: 0.84, lensHeight: 0.62, roundness: 0.22, browLift: 0.03, ...ACETATE },
  metalSquare: { lensWidth: 0.82, lensHeight: 0.58, roundness: 0.18, browLift: 0.02, ...METAL },
};

/** How far the rim stands proud of the lens plane, along Z. */
const RIM_DEPTH = 0.1;

/**
 * Rounded-rectangle lens outline, as a closed 2D contour centred on the
 * origin. `browLift` raises only the outer top corner, which is what separates
 * a cat-eye from a plain rounded rectangle.
 */
function lensContour(profile: ShapeProfile, outwardSign: number, inset: number): Shape | Path {
  const halfW = profile.lensWidth / 2 - inset;
  const halfH = profile.lensHeight / 2 - inset;
  const radius = Math.min(halfW, halfH) * profile.roundness;
  const lift = profile.browLift * profile.lensHeight;

  const shape = new Shape();
  // Drawn as four corner arcs joined by straight edges. The outer top corner
  // is pushed up by `lift`, so the curve through it leans into a brow.
  const outerX = outwardSign * halfW;
  const innerX = -outwardSign * halfW;

  shape.moveTo(innerX + outwardSign * radius, halfH);
  shape.lineTo(outerX - outwardSign * radius, halfH + lift);
  shape.quadraticCurveTo(outerX, halfH + lift, outerX, halfH + lift - radius);
  shape.lineTo(outerX, -halfH + radius);
  shape.quadraticCurveTo(outerX, -halfH, outerX - outwardSign * radius, -halfH);
  shape.lineTo(innerX + outwardSign * radius, -halfH);
  shape.quadraticCurveTo(innerX, -halfH, innerX, -halfH + radius);
  shape.lineTo(innerX, halfH - radius);
  shape.quadraticCurveTo(innerX, halfH, innerX + outwardSign * radius, halfH);
  return shape;
}

function buildRim(profile: ShapeProfile, outwardSign: number): ExtrudeGeometry {
  const outer = lensContour(profile, outwardSign, 0) as Shape;
  // The hole makes it a rim rather than a solid disc; `Path` (not `Shape`) is
  // what ExtrudeGeometry expects for holes.
  const inner = lensContour(profile, outwardSign, profile.rimThickness);
  outer.holes.push(new Path((inner as Shape).getPoints(64)));

  return new ExtrudeGeometry(outer, {
    depth: RIM_DEPTH,
    bevelEnabled: true,
    bevelThickness: profile.rimThickness * 0.3,
    bevelSize: profile.rimThickness * 0.25,
    bevelSegments: 2,
    curveSegments: 24,
  });
}

function buildLensGlass(profile: ShapeProfile, outwardSign: number): ExtrudeGeometry {
  // Slightly *inside* the rim opening so the two never z-fight along the edge.
  const contour = lensContour(profile, outwardSign, profile.rimThickness * 0.6) as Shape;
  return new ExtrudeGeometry(contour, {
    depth: 0.012,
    bevelEnabled: false,
    curveSegments: 24,
  });
}

/**
 * Half the frame's total front width, in lens-span units. A real frame spans
 * about 140mm with its optical centres 63mm apart, so the endpieces reach
 * ~1.1 lens-spans out from the centre — noticeably wider than the lenses
 * themselves.
 *
 * This is load-bearing for occlusion, not just looks: the arms have to run at
 * the true width of the head, because the invisible head mask is sized from
 * the face's measured temple width. Arms modelled too narrow would sit inside
 * the mask and be hidden even looking straight ahead.
 */
const TEMPLE_OUT_X = 1.1;

/**
 * One temple arm, as a tube following the path a real arm takes: out over the
 * endpiece, straight back alongside the head, then bending down behind the
 * ear. The length and the bend position matter for occlusion — an arm that
 * stopped short of the ear would never reach the part of the head that hides
 * it.
 */
function buildTemple(profile: ShapeProfile, outwardSign: number, hingeY: number): TubeGeometry {
  const x = outwardSign;
  const lensEdge = profile.lensWidth / 2 + LENS_HALF_SPAN;
  const curve = new CatmullRomCurve3([
    new Vector3(x * lensEdge, hingeY, 0.01),
    new Vector3(x * Math.max(TEMPLE_OUT_X, lensEdge), hingeY * 0.97, -0.25),
    new Vector3(x * Math.max(TEMPLE_OUT_X, lensEdge), hingeY * 0.88, -0.9),
    new Vector3(x * Math.max(TEMPLE_OUT_X, lensEdge) * 0.93, hingeY * 0.35, -1.5),
    new Vector3(x * Math.max(TEMPLE_OUT_X, lensEdge) * 0.86, -0.18, -1.72),
  ]);
  return new TubeGeometry(curve, 40, profile.rimThickness * 0.34, 10, false);
}

function buildBridge(profile: ShapeProfile): TubeGeometry {
  const innerEdge = LENS_HALF_SPAN - profile.lensWidth / 2;
  const y = profile.lensHeight / 2 - profile.rimThickness;
  const curve = new CatmullRomCurve3([
    new Vector3(-innerEdge, y - 0.03, RIM_DEPTH * 0.4),
    new Vector3(0, y + 0.04, RIM_DEPTH * 0.55),
    new Vector3(innerEdge, y - 0.03, RIM_DEPTH * 0.4),
  ]);
  return new TubeGeometry(curve, 20, profile.rimThickness * 0.36, 10, false);
}

/**
 * Builds the placeholder frame. Returns a root whose lens centres are exactly
 * 1 unit apart (see the module comment), facing +Z with the temple arms
 * running back along -Z.
 */
export function buildProceduralFrame(tryOn: TryOnConfig): Object3D {
  const profile = SHAPE_PROFILES[tryOn.frameShape] ?? SHAPE_PROFILES.acetateSquare;

  const frameMaterial = new MeshStandardMaterial({
    color: new Color(tryOn.color),
    metalness: profile.metalness,
    roughness: profile.roughness,
  });
  const templeMaterial = new MeshStandardMaterial({
    color: new Color(tryOn.templeColor ?? tryOn.color),
    metalness: profile.metalness,
    roughness: profile.roughness,
  });
  const lensMaterial = new MeshPhysicalMaterial({
    color: new Color(tryOn.lensColor ?? "#ffffff"),
    // A clear optical lens still needs to catch a highlight or the frame reads
    // as empty holes; a tinted lens gets its opacity from the product.
    transparent: true,
    opacity: Math.min(Math.max(tryOn.lensOpacity ?? 0.18, 0.05), 0.9),
    roughness: 0.06,
    metalness: 0,
    transmission: 0.6,
    thickness: 0.05,
    side: DoubleSide,
    depthWrite: false,
  });

  const root = new Group();
  const hingeY = profile.lensHeight * (0.5 - profile.browLift * 0.5) - profile.rimThickness;

  for (const sign of [-1, 1] as const) {
    const rim = new Mesh(buildRim(profile, sign), frameMaterial);
    rim.position.set(sign * LENS_HALF_SPAN, 0, -RIM_DEPTH / 2);
    root.add(rim);

    const lens = new Mesh(buildLensGlass(profile, sign), lensMaterial);
    lens.position.set(sign * LENS_HALF_SPAN, 0, -RIM_DEPTH / 2 + RIM_DEPTH * 0.4);
    // Lenses draw after the rim so their transparency blends over it rather
    // than the rim punching through.
    lens.renderOrder = 1;
    root.add(lens);

    root.add(new Mesh(buildTemple(profile, sign, hingeY), templeMaterial));
  }

  root.add(new Mesh(buildBridge(profile), frameMaterial));
  return root;
}
