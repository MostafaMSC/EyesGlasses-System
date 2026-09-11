import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  adminConfigured,
  checkPassword,
  createSessionToken,
  isAdminRequest,
} from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/** Lets the admin page know whether it already has a session, before rendering. */
export async function GET() {
  if (!adminConfigured()) {
    return Response.json({ configured: false, authenticated: false });
  }
  return Response.json({ configured: true, authenticated: await isAdminRequest() });
}

/** Log in. */
export async function POST(request: Request) {
  if (!adminConfigured()) {
    return Response.json(
      { error: "لم يتم تعيين كلمة مرور للوحة التحكم على هذا السيرفر." },
      { status: 503 }
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return Response.json({ error: "صيغة الطلب غير صحيحة." }, { status: 400 });
  }

  if (!checkPassword(password)) {
    return Response.json({ error: "كلمة المرور غير صحيحة." }, { status: 401 });
  }

  const { value, maxAge } = createSessionToken();
  const store = await cookies();
  store.set(ADMIN_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    // Only over HTTPS in production; over plain HTTP in local development the
    // cookie would otherwise be dropped and login would appear to do nothing.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return Response.json({ authenticated: true });
}

/** Log out. */
export async function DELETE() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  return Response.json({ authenticated: false });
}
