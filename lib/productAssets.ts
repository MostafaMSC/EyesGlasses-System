import { statSync } from "node:fs";
import { join } from "node:path";
import type { Product } from "@/data/products";
import { FRAMES_PREFIX, normalizeModelPath, stripModelVersion } from "@/lib/modelPath";

/**
 * Keeps the heavy parts of a product — its pictures, and any model uploaded
 * "inside the product" — out of the catalogue listing.
 *
 * The admin panel stores every picture as a base64 data URL inside the
 * product's own JSON, and that is still how a product is stored: one `jsonb`
 * document, nothing to migrate. But sent as-is, `/api/products` was several
 * megabytes that every page load pulled down before it could show a single
 * card. So the listing swaps each data URL for a small, versioned URL to
 * `/api/products/{id}/asset/{key}`, and the pictures are fetched one by one
 * — lazily, by the cards that show them — and cached by the browser.
 *
 * The version in the URL is the row's `updated_at`, which changes on every
 * save, so the asset response can be cached as immutable without a changed
 * picture ever being stuck behind the old one.
 *
 * The reverse direction matters just as much: the admin panel edits a
 * product it fetched from the listing, so what it saves back carries those
 * asset URLs in place of the data. `resolveIncomingAssets` puts the stored
 * data back before the row is written, and a URL never ends up stored.
 */

const KEY_PATTERN = /^(overlay|left|right|model|image-\d+)$/;

/** Well-formed asset key, and nothing else — this ends up in a URL. */
export function isAssetKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

function isDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

/** Every field that may hold a data URL, keyed as it appears in the asset URL. */
function assetFields(product: Product): Array<[key: string, value: string | undefined]> {
  const t = product.tryOn;
  return [
    ["overlay", t.overlayImage],
    ["left", t.leftImage],
    ["right", t.rightImage],
    ["model", t.model3d],
    ...(product.images ?? []).map((img, i): [string, string | undefined] => [`image-${i}`, img]),
  ];
}

function setAssetField(product: Product, key: string, value: string | undefined) {
  const t = product.tryOn;
  const image = /^image-(\d+)$/.exec(key);
  if (image) {
    const i = Number(image[1]);
    if (value === undefined) product.images.splice(i, 1);
    else product.images[i] = value;
    return;
  }
  const field = ({ overlay: "overlayImage", left: "leftImage", right: "rightImage", model: "model3d" } as const)[
    key as "overlay" | "left" | "right" | "model"
  ];
  if (!field) return;
  if (value === undefined) delete t[field];
  else t[field] = value;
}

/** Reads one asset out of a stored product, if it has data for it. */
export function getAssetField(product: Product, key: string): string | undefined {
  return assetFields(product).find(([k]) => k === key)?.[1];
}

function assetUrl(id: string, key: string, version: string): string {
  return `/api/products/${encodeURIComponent(id)}/asset/${key}?v=${version}`;
}

function isOwnAssetUrl(id: string, key: string, value: unknown): boolean {
  return typeof value === "string" && value.startsWith(`/api/products/${encodeURIComponent(id)}/asset/${key}`);
}

/**
 * A model path under `public/assets/frames` with the file's mtime appended,
 * so the browser can keep it forever and still pick up a replaced file.
 * Left alone when the file can't be found — the try-on then reports the
 * missing model itself, as before.
 */
function versionedModelPath(path: string): string {
  if (!path.startsWith(FRAMES_PREFIX)) return path;
  try {
    const mtime = statSync(join(process.cwd(), "public", path)).mtimeMs;
    return `${path}?v=${Math.floor(mtime).toString(36)}`;
  } catch {
    return path;
  }
}

/**
 * The product as the catalogue sees it: same shape, but every embedded
 * picture or model replaced by its asset URL.
 */
export function toPublicProduct(product: Product, updatedAt: Date): Product {
  const out: Product = { ...product, images: [...(product.images ?? [])], tryOn: { ...product.tryOn } };
  const version = updatedAt.getTime().toString(36);
  for (const [key, value] of assetFields(out)) {
    if (isDataUrl(value)) setAssetField(out, key, assetUrl(out.id, key, version));
  }
  if (out.tryOn.model3d && !out.tryOn.model3d.startsWith("data:")) {
    out.tryOn.model3d = versionedModelPath(normalizeModelPath(out.tryOn.model3d));
  }
  return out;
}

/**
 * Turns a product as submitted by the admin panel back into what should be
 * stored: asset URLs become the data they stand for (taken from the row
 * already in the database), and a served model's cache-buster is dropped.
 * A URL for an asset the stored row no longer has is simply removed.
 */
export function resolveIncomingAssets(incoming: Product, stored: Product | null): Product {
  const out: Product = { ...incoming, images: [...(incoming.images ?? [])], tryOn: { ...incoming.tryOn } };
  // Walk from the end so removing an `images[i]` entry can't shift a later key.
  for (const [key, value] of assetFields(out).reverse()) {
    if (isOwnAssetUrl(out.id, key, value)) {
      const data = stored ? getAssetField(stored, key) : undefined;
      setAssetField(out, key, isDataUrl(data) ? data : undefined);
    }
  }
  if (out.tryOn.model3d && !out.tryOn.model3d.startsWith("data:")) {
    out.tryOn.model3d = stripModelVersion(out.tryOn.model3d);
  }
  return out;
}

/** Decodes a base64 data URL into bytes and their media type. */
export function decodeDataUrl(value: string): { contentType: string; body: Buffer } | null {
  const match = /^data:([^;,]+)(;[^,]*)?,([\s\S]*)$/.exec(value);
  if (!match) return null;
  const [, contentType, params = "", payload] = match;
  const body = params.includes(";base64")
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  return { contentType, body };
}
