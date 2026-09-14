import type { Coupon } from "@/data/siteSettings";
import type { Product } from "@/data/products";
import { ensureSchema, pool } from "@/lib/db";
import { getSettingsSection } from "@/lib/settingsDb";

/**
 * Coupon evaluation, used both to preview a discount at checkout and to
 * apply it when the order is placed — the same function, so the customer
 * never sees a number the order won't honour.
 */

export interface CouponLine {
  product: Product;
  quantity: number;
}

export interface CouponResult {
  coupon: Coupon;
  discount: number;
}

export class CouponError extends Error {}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/** How many orders already carry this code, overall and for this phone. */
async function usage(code: string, phone: string | null): Promise<{ total: number; byCustomer: number }> {
  await ensureSchema();
  const { rows } = await pool().query<{ total: string; mine: string }>(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE phone = $2) AS mine
       FROM orders
      WHERE upper(data->>'couponCode') = $1 AND status NOT IN ('cancelled')`,
    [code, phone ?? ""]
  );
  return { total: Number(rows[0]?.total ?? 0), byCustomer: Number(rows[0]?.mine ?? 0) };
}

export async function evaluateCoupon(rawCode: string, lines: CouponLine[], phone: string | null): Promise<CouponResult> {
  const code = normalizeCode(rawCode);
  if (!code) throw new CouponError("اكتب رمز الكوبون.");
  const { data } = await getSettingsSection("promotions");
  const coupon = data.coupons.find((c) => c.active && normalizeCode(c.code) === code);
  if (!coupon) throw new CouponError("الكوبون غير صالح.");
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) throw new CouponError("انتهت صلاحية الكوبون.");

  const eligible = lines.filter(
    (l) =>
      (coupon.productIds.length === 0 || coupon.productIds.includes(l.product.id)) &&
      (coupon.categorySlugs.length === 0 || coupon.categorySlugs.includes(l.product.category))
  );
  const eligibleTotal = eligible.reduce((n, l) => n + l.product.price * l.quantity, 0);
  const orderTotal = lines.reduce((n, l) => n + l.product.price * l.quantity, 0);
  if (eligible.length === 0) throw new CouponError("الكوبون لا ينطبق على منتجات السلة.");
  if (coupon.minOrderAmount > 0 && orderTotal < coupon.minOrderAmount) {
    throw new CouponError(`الكوبون يتطلب طلباً بقيمة ${coupon.minOrderAmount.toLocaleString("en-US")} على الأقل.`);
  }

  if (coupon.maxUses > 0 || coupon.perCustomerLimit > 0) {
    const used = await usage(code, phone);
    if (coupon.maxUses > 0 && used.total >= coupon.maxUses) throw new CouponError("استُنفد هذا الكوبون.");
    if (coupon.perCustomerLimit > 0 && phone && used.byCustomer >= coupon.perCustomerLimit) {
      throw new CouponError("استخدمت هذا الكوبون من قبل.");
    }
  }

  const raw = coupon.type === "percent" ? (eligibleTotal * Math.min(100, Math.max(0, coupon.value))) / 100 : coupon.value;
  const discount = Math.max(0, Math.min(eligibleTotal, Math.round(raw)));
  return { coupon, discount };
}
