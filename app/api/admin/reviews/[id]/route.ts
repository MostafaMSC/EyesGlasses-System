import { requireAdmin } from "@/lib/adminAuth";
import { deleteReview, setReviewStatus } from "@/lib/reviewsDb";

export const dynamic = "force-dynamic";

/** Approve or reject. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  let body: { status?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صحيحة." }, { status: 400 });
  }
  if (body.status !== "approved" && body.status !== "rejected" && body.status !== "pending") {
    return Response.json({ error: "حالة غير معروفة." }, { status: 400 });
  }
  const ok = await setReviewStatus(id, body.status);
  return ok ? Response.json({ id, status: body.status }) : Response.json({ error: "التقييم غير موجود." }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const ok = await deleteReview(id);
  return ok ? Response.json({ deleted: id }) : Response.json({ error: "التقييم غير موجود." }, { status: 404 });
}
