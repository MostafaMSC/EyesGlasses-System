/**
 * Generic version of what `lib/productAssets.ts` does for products: walks a
 * JSON document, swaps every embedded `data:` URL for a small URL that
 * serves the same bytes, and — on the way back in — restores the stored
 * data behind such a URL so the document is written with real content.
 *
 * Paths are dotted, arrays by index: `hero.image`, `banners.2.image`.
 */

type Json = unknown;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns a copy with every data URL replaced by `makeUrl(path)`. */
export function projectDataUrls(doc: Json, makeUrl: (path: string) => string, prefix = ""): Json {
  if (typeof doc === "string") return doc.startsWith("data:") ? makeUrl(prefix) : doc;
  if (Array.isArray(doc)) return doc.map((v, i) => projectDataUrls(v, makeUrl, prefix ? `${prefix}.${i}` : String(i)));
  if (isPlainObject(doc)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(doc)) out[k] = projectDataUrls(v, makeUrl, prefix ? `${prefix}.${k}` : k);
    return out;
  }
  return doc;
}

/** Reads the value at a dotted path, or undefined. */
export function getAtPath(doc: Json, path: string): unknown {
  let cur: unknown = doc;
  for (const key of path.split(".")) {
    if (Array.isArray(cur)) cur = cur[Number(key)];
    else if (isPlainObject(cur)) cur = cur[key];
    else return undefined;
  }
  return cur;
}

/**
 * Returns a copy of `incoming` where every string `isOwnUrl` recognises is
 * replaced by the data URL at the same path in `stored` — or dropped to ""
 * when the stored document has no data there any more.
 */
export function restoreDataUrls(
  incoming: Json,
  stored: Json,
  isOwnUrl: (value: string, path: string) => boolean,
  prefix = ""
): Json {
  if (typeof incoming === "string") {
    if (!isOwnUrl(incoming, prefix)) return incoming;
    const data = getAtPath(stored, prefix);
    return typeof data === "string" && data.startsWith("data:") ? data : "";
  }
  if (Array.isArray(incoming)) {
    return incoming.map((v, i) => restoreDataUrls(v, stored, isOwnUrl, prefix ? `${prefix}.${i}` : String(i)));
  }
  if (isPlainObject(incoming)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(incoming)) {
      out[k] = restoreDataUrls(v, stored, isOwnUrl, prefix ? `${prefix}.${k}` : k);
    }
    return out;
  }
  return incoming;
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

/**
 * Fills gaps in `stored` from `defaults`: a missing key takes the default,
 * a nested object is merged the same way, and an array or scalar the store
 * does have wins as-is. That is what lets a new field appear in the code
 * with a default without touching rows already saved.
 */
export function mergeDefaults<T>(defaults: T, stored: unknown): T {
  if (!isPlainObject(defaults) || !isPlainObject(stored)) {
    return (stored === undefined || stored === null ? defaults : stored) as T;
  }
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(stored)) {
    const d = (defaults as Record<string, unknown>)[k];
    out[k] = isPlainObject(d) && isPlainObject(v) ? mergeDefaults(d, v) : v;
  }
  return out as T;
}
