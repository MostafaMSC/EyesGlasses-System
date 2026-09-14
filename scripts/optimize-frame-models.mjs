#!/usr/bin/env node
/**
 * Shrinks every model already in `public/assets/frames/` for download.
 *
 *   npm run optimize-models
 *
 * Models added before `prepare-model` learned to compress are 3–7 MB each,
 * which on a phone is several seconds per frame in the try-on. This runs the
 * same compression pass over them in place — WebP textures plus
 * meshopt-coded geometry — and keeps the originals in `frames-original/` at
 * the repo root (outside `public/`, so they are never served).
 *
 * Already-compressed files are skipped, so it is safe to run again after
 * dropping a new model into the folder. Run it from the checkout you deploy:
 * the folder is bind-mounted into the container, so the smaller files are
 * served as soon as the web container is restarted.
 *
 * No dependency to install: gltf-transform is fetched by npx on first use.
 */

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compress, describe, fail, isCompressed, readGlbJson } from "./glb-utils.mjs";

const FRAMES_DIR = join("public", "assets", "frames");
const BACKUP_DIR = "frames-original";

if (!existsSync(FRAMES_DIR)) {
  fail(`No ${FRAMES_DIR} here — run this from the project root, in the checkout you deploy.`);
}

const files = readdirSync(FRAMES_DIR).filter((f) => f.toLowerCase().endsWith(".glb"));
if (files.length === 0) fail(`No .glb files in ${FRAMES_DIR}.`);

const mb = (path) => (readFileSync(path).length / 1e6).toFixed(2);
const results = [];

for (const file of files) {
  const path = join(FRAMES_DIR, file);
  const gltf = readGlbJson(path);
  if (isCompressed(gltf)) {
    console.log(`\n${file}: already compressed — skipping.`);
    results.push({ file, before: mb(path), after: mb(path), skipped: true });
    continue;
  }

  console.log(`\n${"═".repeat(60)}\n${file}: ${describe(gltf).triangles.toLocaleString()} triangles, ${mb(path)} MB`);
  const before = mb(path);

  mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = join(BACKUP_DIR, file);
  // Never clobber an earlier backup: that one is the true original.
  if (!existsSync(backup)) copyFileSync(path, backup);

  const work = mkdtempSync(join(tmpdir(), "frame-optimize-"));
  try {
    const out = join(work, "out.glb");
    compress(path, out, work);
    // Sanity: the same geometry must come out the other side.
    const after = describe(readGlbJson(out));
    if (after.triangles !== describe(gltf).triangles) {
      fail(`${file}: triangle count changed during compression — original kept.`);
    }
    copyFileSync(out, path);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  results.push({ file, before, after: mb(path), skipped: false });
}

console.log(`\n${"─".repeat(60)}`);
for (const r of results) {
  if (r.skipped) {
    console.log(`${r.file.padEnd(24)} ${r.before} MB  (already compressed)`);
    continue;
  }
  const saved = Math.round((1 - Number(r.after) / Number(r.before)) * 100);
  console.log(`${r.file.padEnd(24)} ${r.before} MB → ${r.after} MB  (−${saved}%)`);
}
console.log(`\nOriginals kept in ${BACKUP_DIR}/.`);
console.log(`\nNext:  docker compose restart web`);
console.log(`${"─".repeat(60)}\n`);
