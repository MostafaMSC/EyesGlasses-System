#!/usr/bin/env node
/**
 * Prepares a 3D frame model for the try-on, in one step.
 *
 *   npm run prepare-model -- <input.glb> [name]
 *
 * A raw model straight out of an AI generator is unusable as-is: hundreds of
 * thousands of triangles and tens of megabytes. This simplifies it, shrinks
 * its textures, drops it into `public/assets/frames/`, and prints the path to
 * paste into /admin.
 *
 * Run it from the checkout you actually deploy — a model prepared in a
 * different clone isn't on the server at all. `public/assets/frames` is
 * bind-mounted into the container, so no image rebuild is needed, but the
 * web container does need restarting: Next's standalone server settles which
 * static paths exist at startup, so a file that appears underneath it stays
 * a 404 until then.
 *
 * No dependency to install: gltf-transform is fetched by npx on first use.
 */

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

/** Triangles to aim for. Plenty for eyewear, cheap enough to render on a phone. */
const TARGET_TRIANGLES = 50_000;
const TEXTURE_SIZE = 1024;
const DEST_DIR = join("public", "assets", "frames");
const GLTF_TRANSFORM = "npx --yes @gltf-transform/cli@4";

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/**
 * Reads the glTF JSON chunk out of a .glb without a parser. A GLB is a
 * 12-byte header followed by length-prefixed chunks, the first of which is
 * the JSON — enough to get triangle counts and the bounding box, since glTF
 * stores each accessor's own min/max.
 */
function readGlbJson(path) {
  const buf = readFileSync(path);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) {
    fail(`${path} is not a binary .glb file. Export as glTF-Binary (.glb).`);
  }
  const chunkLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + chunkLength).toString("utf8"));
}

function describe(gltf) {
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

const [inputArg, nameArg] = process.argv.slice(2);
if (!inputArg) {
  fail("Usage: npm run prepare-model -- <input.glb> [name]");
}

const input = resolve(inputArg);
if (!existsSync(input)) fail(`No such file: ${input}`);
if (!existsSync("public")) {
  fail("Run this from the project root (no ./public here) — and from the checkout you deploy.");
}

const name = (nameArg || basename(input, extname(input)))
  .toLowerCase()
  .replace(/[^a-z0-9-_]+/g, "-")
  .replace(/^-+|-+$/g, "");

const before = describe(readGlbJson(input));
const inputMb = (readFileSync(input).length / 1e6).toFixed(2);
console.log(`\nInput:  ${basename(input)}  —  ${before.triangles.toLocaleString()} triangles, ${inputMb} MB`);

if (!(before.triangles > 0)) fail("Could not find any geometry in that file.");

// Simplification is proportional, so the ratio has to come from the actual
// triangle count — a fixed one would wreck a light model and barely touch a
// heavy one.
const ratio = Math.min(1, TARGET_TRIANGLES / before.triangles);

const work = mkdtempSync(join(tmpdir(), "frame-model-"));
const step1 = join(work, "1.glb");
const step2 = join(work, "2.glb");
const step3 = join(work, "3.glb");

try {
  const q = (p) => `"${p}"`;
  if (ratio < 1) {
    console.log(`\nSimplifying to ~${TARGET_TRIANGLES.toLocaleString()} triangles (ratio ${ratio.toFixed(3)})…`);
    execSync(`${GLTF_TRANSFORM} simplify ${q(input)} ${q(step1)} --ratio ${ratio} --error 0.002`, {
      stdio: ["ignore", "inherit", "inherit"],
    });
  } else {
    console.log("\nAlready light enough — skipping simplification.");
    copyFileSync(input, step1);
  }

  console.log(`\nResizing textures to ${TEXTURE_SIZE}px…`);
  execSync(`${GLTF_TRANSFORM} resize ${q(step1)} ${q(step2)} --width ${TEXTURE_SIZE} --height ${TEXTURE_SIZE}`, {
    stdio: ["ignore", "inherit", "inherit"],
  });

  console.log("\nPruning unused data…");
  execSync(`${GLTF_TRANSFORM} prune ${q(step2)} ${q(step3)}`, {
    stdio: ["ignore", "inherit", "inherit"],
  });

  mkdirSync(DEST_DIR, { recursive: true });
  const dest = join(DEST_DIR, `${name}.glb`);
  copyFileSync(step3, dest);

  const after = describe(readGlbJson(step3));
  const outMb = (readFileSync(dest).length / 1e6).toFixed(2);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Result: ${after.triangles.toLocaleString()} triangles, ${outMb} MB`);
  console.log(`Size:   ${after.size.map((v) => v.toFixed(2)).join(" x ")}  (width x height x depth)`);

  // A pair of glasses is about as wide as it is deep, and roughly a third as
  // tall. Proportions far off that usually mean the model is rotated, which
  // the loader can't detect for itself.
  const [w, h, d] = after.size;
  const looksRight = w > h && d > h && Math.abs(w - d) / Math.max(w, d) < 0.45;
  console.log(
    looksRight
      ? "Shape:  looks like eyewear (wide and deep, shallow height) ✓"
      : "Shape:  ⚠ unexpected proportions — the model may be rotated. Check it in /try-on-debug."
  );

  console.log(`\nSaved to: ${dest}`);
  console.log(`\nNext:`);
  console.log(`  1. docker compose restart web            (~1s, no rebuild needed)`);
  console.log(`  2. In /admin, set the model path to:`);
  console.log(`\n       /assets/frames/${name}.glb\n`);
  console.log(`  3. Open the try-on and turn your head. If the lenses hide your eyes,`);
  console.log(`     delete the lens faces in Blender — that can't be fixed from code.`);
  console.log(`${"─".repeat(60)}\n`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
