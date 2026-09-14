import { getProduct } from "@/lib/db";
import { normalizePhone, isValidPhone } from "@/lib/checkout";
import { insertReview, listApprovedReviews } from "@/lib/reviewsDb";

export const dynamic = "force-dynamic";

/** Approved reviews of one product. */
export async function GET(request: Request) {
  const productId = new URL(request.url).searchParams.get("productId") ?? "";
  if (!productId) return Response.json({ error: "productId مطلوب." }, { status: 400 });
  try {
    return Response.json({ reviews: await listApprovedReviews(productId) }, { headers: { "Cache-Control": "no-cache" } });
  } catch (err) {
    console.error("[api/reviews] list failed", err);
    return Response.json({ error: "تعذّر قراءة التقييمات." }, { status: 500 });
  }
}

/** A customer submits a review; it waits for the admin's approval. */
export async function POST(request: Request) {
  let body: { productId?: unknown; rating?: unknown; name?: unknown; phone?: unknown; text?: unknown; image?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صحيحة." }, { status: 400 });
  }
  const productId = typeof body.productId === "string" ? body.productId.slice(0, 64) : "";
  const rating = Math.round(Number(body.rating));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
  const image = typeof body.image === "string" && body.image.startsWith("data:image/") && body.image.length < 400_000 ? body.image : undefined;

  if (!productId || !(await getProduct(productId))) return Response.json({ error: "المنتج غير موجود." }, { status: 404 });
  if (!(rating >= 1 && rating <= 5)) return Response.json({ error: "اختر تقييماً من ١ إلى ٥." }, { status: 400 });
  if (name.length < 2) return Response.json({ error: "اكتب اسمك." }, { status: 400 });
  if (!isValidPhone(phone)) return Response.json({ error: "رقم الهاتف غير صحيح." }, { status: 400 });
  if (text.length < 5) return Response.json({ error: "اكتب رأيك بالمنتج." }, { status: 400 });

  try {
    const review = await insertReview({ productId, rating, name, phone, text, image });
    return Response.json({ id: review.id, status: review.status }, { status: 201 });
  } catch (err) {
    console.error("[api/reviews] create failed", err);
    return Response.json({ error: "تعذّر إرسال التقييم." }, { status: 500 });
  }
}
