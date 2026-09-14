import { requireAdmin } from "@/lib/adminAuth";
import { listReviews, type ReviewStatus } from "@/lib/reviewsDb";

export const dynamic = "force-dynamic";

/** All reviews for moderation, optionally by status. */
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const status = new URL(request.url).searchParams.get("status") ?? "";
  const valid = ["pending", "approved", "rejected"].includes(status) ? (status as ReviewStatus) : undefined;
  try {
    return Response.json({ reviews: await listReviews(valid) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[api/admin/reviews] list failed", err);
    return Response.json({ error: "تعذّر قراءة التقييمات." }, { status: 500 });
  }
}
