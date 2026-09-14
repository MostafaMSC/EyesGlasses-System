import { randomBytes } from "node:crypto";
import { ensureSchema, pool } from "@/lib/db";

/**
 * Product reviews. Submitted by customers, shown only once the admin
 * approves them. The reviewer's phone is kept for the admin (to match an
 * order) and never sent to the storefront.
 */

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface Review {
  id: string;
  productId: string;
  rating: number;
  name: string;
  phone: string;
  text: string;
  /** Data URL of an optional photo, resized client-side. */
  image?: string;
  status: ReviewStatus;
  createdAt: string;
}

/** What the storefront sees. */
export type PublicReview = Omit<Review, "phone" | "status">;

let reviewsReady: Promise<void> | null = null;
function ensureReviews(): Promise<void> {
  if (!reviewsReady) {
    reviewsReady = ensureSchema()
      .then(() =>
        pool().query(
          `CREATE TABLE IF NOT EXISTS reviews (
             id          text PRIMARY KEY,
             product_id  text NOT NULL,
             status      text NOT NULL,
             rating      int NOT NULL,
             data        jsonb NOT NULL,
             created_at  timestamptz NOT NULL DEFAULT now()
           );
           CREATE INDEX IF NOT EXISTS reviews_product_status_idx ON reviews (product_id, status);
           CREATE INDEX IF NOT EXISTS reviews_status_idx ON reviews (status, created_at DESC);`
        )
      )
      .then(() => undefined);
    reviewsReady.catch(() => {
      reviewsReady = null;
    });
  }
  return reviewsReady;
}

export async function insertReview(input: Omit<Review, "id" | "status" | "createdAt">): Promise<Review> {
  await ensureReviews();
  const review: Review = {
    ...input,
    id: `r${Date.now().toString(36)}${randomBytes(3).toString("hex")}`,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await pool().query("INSERT INTO reviews (id, product_id, status, rating, data) VALUES ($1, $2, $3, $4, $5)", [
    review.id,
    review.productId,
    review.status,
    review.rating,
    review,
  ]);
  return review;
}

export async function listApprovedReviews(productId: string): Promise<PublicReview[]> {
  await ensureReviews();
  const { rows } = await pool().query<{ data: Review }>(
    "SELECT data FROM reviews WHERE product_id = $1 AND status = 'approved' ORDER BY created_at DESC LIMIT 100",
    [productId]
  );
  return rows.map(({ data }) => {
    const { phone: _phone, status: _status, ...visible } = data;
    void _phone;
    void _status;
    return visible;
  });
}

export async function listReviews(status?: ReviewStatus): Promise<Review[]> {
  await ensureReviews();
  const { rows } = await pool().query<{ data: Review }>(
    status
      ? "SELECT data FROM reviews WHERE status = $1 ORDER BY created_at DESC LIMIT 300"
      : "SELECT data FROM reviews ORDER BY created_at DESC LIMIT 300",
    status ? [status] : []
  );
  return rows.map((r) => r.data);
}

export async function setReviewStatus(id: string, status: ReviewStatus): Promise<boolean> {
  await ensureReviews();
  const { rowCount } = await pool().query(
    "UPDATE reviews SET status = $2, data = data || jsonb_build_object('status', $2::text) WHERE id = $1",
    [id, status]
  );
  return (rowCount ?? 0) > 0;
}

export async function deleteReview(id: string): Promise<boolean> {
  await ensureReviews();
  const { rowCount } = await pool().query("DELETE FROM reviews WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}

/** Average and count of approved reviews per product, for cards and sorting. */
export async function ratingSummary(): Promise<Map<string, { average: number; count: number }>> {
  await ensureReviews();
  const { rows } = await pool().query<{ product_id: string; avg: string; count: string }>(
    "SELECT product_id, avg(rating) AS avg, count(*) AS count FROM reviews WHERE status = 'approved' GROUP BY product_id"
  );
  return new Map(rows.map((r) => [r.product_id, { average: Math.round(Number(r.avg) * 10) / 10, count: Number(r.count) }]));
}
