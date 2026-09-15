#!/usr/bin/env node
/**
 * Prepares a 3D frame model for the try-on, in one step.
 *
 *   npm run prepare-model -- <input.glb> [name]
 *
 * A raw model straight out of an AI generator is unusable as-is: hundreds of
 * thousands of triangles and tens of megabytes. This simplifies it, shrinks
 * its textures, compresses it for download (WebP textures, meshopt geometry),
 * drops it into `public/assets/frames/`, and prints the path to paste into
 * /admin. Models that were added before this compressed can be shrunk in
 * place with `npm run optimize-models`.
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
import { compress, describe, fail, GLTF_TRANSFORM, readGlbJson } from "./glb-utils.mjs";

/** Triangles to aim for. Plenty for eyewear, cheap enough to render on a phone. */
const TARGET_TRIANGLES = 50_000;
const TEXTURE_SIZE = 1024;
const DEST_DIR = join("public", "assets", "frames");

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
const step4 = join(work, "4.glb");

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

  // Last, because simplification and resizing want the uncompressed data:
  // this is what takes the file from megabytes to hundreds of kilobytes.
  compress(step3, step4, work);

  mkdirSync(DEST_DIR, { recursive: true });
  const dest = join(DEST_DIR, `${name}.glb`);
  copyFileSync(step4, dest);

  // Measured before compression: quantised positions are stored as integers
  // with the real scale on the node, so the compressed file's accessor
  // min/max no longer read as model units.
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
  console.log(`  3. In the same form, drop the product photo you gave Hyper3D into`);
  console.log(`     "معالجة العدسات" so the lens gets the real product's colour, then`);
  console.log(`     open the try-on and turn your head.`);
  console.log(`${"─".repeat(60)}\n`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
