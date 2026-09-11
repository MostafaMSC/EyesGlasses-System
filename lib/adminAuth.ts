import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Password gate for the admin panel.
 *
 * While products lived in the visitor's own browser, an open `/admin` could
 * only ever affect that one browser. Now that it writes to a shared database,
 * an unprotected panel would let anyone edit the real catalogue — so every
 * write goes through `requireAdmin`.
 */

export const ADMIN_COOKIE = "abu_thar_admin";
/** A week, so the shop owner isn't retyping the password every visit. */
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error(
      "ADMIN_PASSWORD is missing or shorter than 8 characters — the admin panel is disabled until it is set. See .env.example."
    );
  }
  return password;
}

/** True when an admin password is configured at all. */
export function adminConfigured(): boolean {
  const password = process.env.ADMIN_PASSWORD;
  return Boolean(password && password.length >= 8);
}

function sign(expiresAt: number): string {
  return createHmac("sha256", secret()).update(String(expiresAt)).digest("hex");
}

/** Constant-time compare, so a wrong value can't be narrowed down by timing. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function checkPassword(candidate: string): boolean {
  return safeEqual(candidate, secret());
}

/**
 * Session token: the expiry, plus an HMAC of it keyed by the password. No
 * server-side session store to keep, and changing the password invalidates
 * every existing session for free.
 */
export function createSessionToken(): { value: string; maxAge: number } {
  const expiresAt = Date.now() + SESSION_MS;
  return {
    value: `${expiresAt}.${sign(expiresAt)}`,
    maxAge: Math.floor(SESSION_MS / 1000),
  };
}

export function isValidSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [expiresRaw, signature] = token.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  if (!signature) return false;
  try {
    return safeEqual(signature, sign(expiresAt));
  } catch {
    // No password configured — treat every session as invalid.
    return false;
  }
}

/** Whether the current request carries a valid admin session. */
export async function isAdminRequest(): Promise<boolean> {
  const store = await cookies();
  return isValidSessionToken(store.get(ADMIN_COOKIE)?.value);
}

/**
 * Guard for write endpoints. Returns a 401 response to return as-is, or null
 * when the caller may proceed.
 */
export async function requireAdmin(): Promise<Response | null> {
  if (!adminConfigured()) {
    return Response.json(
      { error: "لوحة التحكم غير مهيأة على هذا السيرفر." },
      { status: 503 }
    );
  }
  if (!(await isAdminRequest())) {
    return Response.json({ error: "غير مصرّح." }, { status: 401 });
  }
  return null;
}
