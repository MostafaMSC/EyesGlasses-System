import { requireAdmin } from "@/lib/adminAuth";
import { SETTINGS_SECTIONS, type SettingsSection } from "@/data/siteSettings";
import { getSettingsSection, resolveIncomingSection, saveSettingsSection } from "@/lib/settingsDb";

export const dynamic = "force-dynamic";

function isSection(value: string): value is SettingsSection {
  return (SETTINGS_SECTIONS as string[]).includes(value);
}

/** The stored form of one section, pictures inline — for the admin editor. */
export async function GET(_request: Request, { params }: { params: Promise<{ section: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { section } = await params;
  if (!isSection(section)) return Response.json({ error: "قسم غير معروف." }, { status: 404 });
  const row = await getSettingsSection(section);
  return Response.json({ section, data: row.data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ section: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { section } = await params;
  if (!isSection(section)) return Response.json({ error: "قسم غير معروف." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صحيحة." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "صيغة الطلب غير صحيحة." }, { status: 400 });
  }
  // Roughly 4 MB of JSON is plenty for a section with a few pictures in it.
  if (JSON.stringify(body).length > 4_000_000) {
    return Response.json({ error: "حجم البيانات كبير جداً — صغّر الصور." }, { status: 413 });
  }

  try {
    const stored = await getSettingsSection(section);
    const resolved = resolveIncomingSection(section, body as never, stored.data);
    await saveSettingsSection(section, resolved);
    return Response.json({ saved: section });
  } catch (err) {
    console.error("[api/settings] save failed", err);
    return Response.json({ error: "تعذّر حفظ الإعدادات." }, { status: 500 });
  }
}
