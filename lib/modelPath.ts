/**
 * Helpers for a product's `tryOn.model3d` when it is a site path rather than
 * an embedded data URL. Shared by the API (which versions the path for
 * caching) and the admin panel (which shows the path for editing).
 */

/** Where served models live; the folder is bind-mounted into the container. */
export const FRAMES_PREFIX = "/assets/frames/";

/**
 * Tidies a hand-typed model path: Windows backslashes become slashes and a
 * bare `assets/frames/...` gets its leading slash. Without it a relative
 * path resolves against whatever page the try-on was opened from, and the
 * same file gets cached under several different URLs.
 */
export function normalizeModelPath(value: string): string {
  if (!value || value.startsWith("data:")) return value;
  let path = value.trim().replace(/\\/g, "/");
  if (/^assets\/frames\//i.test(path)) path = `/${path}`;
  return path;
}

/**
 * Drops the `?v=` cache-buster the API adds to a served model, so the admin
 * edits and stores the plain path. Anything else is returned untouched.
 */
export function stripModelVersion(value: string): string {
  const path = normalizeModelPath(value);
  if (!path.startsWith(FRAMES_PREFIX)) return path;
  return path.replace(/\?v=[^&#]*$/, "");
}
