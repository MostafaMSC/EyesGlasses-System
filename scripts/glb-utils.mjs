/**
 * Shared bits for the model scripts: reading a .glb's JSON chunk without a
 * parser, summarising it, and the compression pass every served model gets.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const GLTF_TRANSFORM = "npx --yes @gltf-transform/cli@4";

/** Lossy WebP for every texture. 85 is visually lossless on eyewear textures. */
const WEBP_QUALITY = 85;

export function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/**
 * Reads the glTF JSON chunk out of a .glb without a parser. A GLB is a
 * 12-byte header followed by length-prefixed chunks, the first of which is
 * the JSON — enough to get triangle counts and the bounding box, since glTF
 * stores each accessor's own min/max.
 */
export function readGlbJson(path) {
  const buf = readFileSync(path);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) {
    fail(`${path} is not a binary .glb file. Export as glTF-Binary (.glb).`);
  }
  const chunkLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + chunkLength).toString("utf8"));
}

export function describe(gltf) {
  let triangles = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (const mesh of gltf.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const indices = gltf.accessors?.[prim.indices];
      const position = gltf.accessors?.[prim.attributes?.POSITION];
      // Un-indexed geometry counts its vertices instead.
      triangles += Math.floor((indices?.count ?? position?.count ?? 0) / 3);
      if (position?.min && position?.max) {
        for (let a = 0; a < 3; a++) {
          min[a] = Math.min(min[a], position.min[a]);
          max[a] = Math.max(max[a], position.max[a]);
        }
      }
    }
  }

  const size = max.map((v, a) => v - min[a]);
  return { triangles, size };
}

/** True once a model has been through `compress` — its geometry is meshopt-coded. */
export function isCompressed(gltf) {
  return (gltf.extensionsUsed ?? []).includes("EXT_meshopt_compression");
}

function run(command) {
  execSync(command, { stdio: ["ignore", "inherit", "inherit"] });
}

/**
 * The download-size pass: textures to WebP, geometry quantised and
 * meshopt-compressed. Together these take a typical generated frame from
 * ~5 MB to under 1 MB with no visible change — the try-on's loader has the
 * meshopt decoder wired in, and every current browser decodes WebP.
 *
 * `scratch` must be an existing directory for the intermediate file.
 */
export function compress(input, output, scratch) {
  const q = (p) => `"${p}"`;
  const mid = `${scratch}/webp.glb`;
  console.log(`\nConverting textures to WebP (quality ${WEBP_QUALITY})…`);
  run(`${GLTF_TRANSFORM} webp ${q(input)} ${q(mid)} --quality ${WEBP_QUALITY}`);
  console.log("\nCompressing geometry (meshopt)…");
  run(`${GLTF_TRANSFORM} meshopt ${q(mid)} ${q(output)}`);
}
