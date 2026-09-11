import { deleteProduct } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  try {
    const removed = await deleteProduct(id);
    if (!removed) return Response.json({ error: "المنتج غير موجود." }, { status: 404 });
    return Response.json({ deleted: id });
  } catch (err) {
    console.error("[api/products] delete failed", err);
    return Response.json({ error: "تعذّر حذف المنتج." }, { status: 500 });
  }
}
