import { randomBytes } from "node:crypto";
import type { Order, OrderItem, OrderRequest } from "@/data/orders";
import { getProductVisualSrc, isActive, type Product } from "@/data/products";
import type { CommerceSettings } from "@/data/siteSettings";
import { getProduct, upsertProduct } from "@/lib/db";
import { insertOrder, nextOrderNumber } from "@/lib/ordersDb";
import { getSettingsSection } from "@/lib/settingsDb";
import { toPublicProduct } from "@/lib/productAssets";

/**
 * Turns what the storefront submits into a priced, numbered order.
 *
 * Nothing about money is trusted from the client: prices come from the
 * catalogue rows, the delivery fee from the configured zone, and the total
 * is computed here. The client sends product ids and quantities only.
 */

export class CheckoutError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Arabic-Indic and Persian digits to ASCII, everything but digits dropped. */
export function normalizePhone(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/\D/g, "");
}

export function isValidPhone(digits: string): boolean {
  return digits.length >= 10 && digits.length <= 15;
}

const MAX_QTY = 10;
const MAX_ITEMS = 20;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function deliveryFeeFor(commerce: CommerceSettings, governorate: string, subtotal: number): number | null {
  const zone = commerce.zones.find((z) => z.active && z.name === governorate);
  if (!zone) return null;
  if (commerce.freeDeliveryThreshold > 0 && subtotal >= commerce.freeDeliveryThreshold) return 0;
  return zone.fee;
}

export async function placeOrder(raw: unknown): Promise<Order> {
  if (!raw || typeof raw !== "object") throw new CheckoutError("صيغة الطلب غير صحيحة.");
  const req = raw as Partial<OrderRequest>;
  const c = req.customer ?? ({} as Partial<OrderRequest["customer"]>);

  const name = text(c.name, 80);
  const phone = normalizePhone(text(c.phone, 30));
  const governorate = text(c.governorate, 60);
  const city = text(c.city, 80);
  const address = text(c.address, 300);
  const notes = text(c.notes, 500);

  if (name.length < 2) throw new CheckoutError("اكتب الاسم الكامل.");
  if (!isValidPhone(phone)) throw new CheckoutError("رقم الهاتف غير صحيح.");
  if (!governorate) throw new CheckoutError("اختر المحافظة.");
  if (address.length < 4) throw new CheckoutError("اكتب العنوان بالتفصيل.");

  const items = Array.isArray(req.items) ? req.items : [];
  if (items.length === 0) throw new CheckoutError("السلة فارغة.");
  if (items.length > MAX_ITEMS) throw new CheckoutError("عدد المنتجات في الطلب كبير جداً.");

  const { data: commerce } = await getSettingsSection("commerce");

  const method = commerce.paymentMethods.find((m) => m.active && m.id === req.paymentMethodId);
  if (!method) throw new CheckoutError("اختر طريقة الدفع.");

  // Price every line from the database, merging duplicate lines.
  const lines = new Map<string, { product: Product; updatedAt: Date; quantity: number; color?: string }>();
  for (const item of items) {
    const productId = text(item?.productId, 64);
    const quantity = Math.floor(Number(item?.quantity));
    if (!productId || !(quantity >= 1)) throw new CheckoutError("صيغة الطلب غير صحيحة.");
    const key = `${productId}|${text(item?.color, 40)}`;
    const existing = lines.get(key);
    if (existing) {
      existing.quantity = Math.min(MAX_QTY, existing.quantity + quantity);
      continue;
    }
    const row = await getProduct(productId);
    if (!row || !isActive(row.data)) throw new CheckoutError("أحد المنتجات لم يعد متوفراً.");
    lines.set(key, {
      product: row.data,
      updatedAt: row.updatedAt,
      quantity: Math.min(MAX_QTY, quantity),
      color: text(item?.color, 40) || undefined,
    });
  }

  const orderItems: OrderItem[] = [];
  let subtotal = 0;
  for (const { product, updatedAt, quantity, color } of lines.values()) {
    if (typeof product.stock === "number" && product.stock < quantity && !commerce.allowBackorder) {
      throw new CheckoutError(`الكمية المطلوبة من "${product.name}" غير متوفرة حالياً.`);
    }
    // The picture is stored inline; the order keeps the served URL, which
    // is what the admin list and the customer's tracking page display.
    const served = toPublicProduct(product, updatedAt);
    orderItems.push({
      productId: product.id,
      name: product.name,
      brand: product.brand,
      sku: product.sku,
      slug: product.slug,
      image: getProductVisualSrc(served),
      unitPrice: product.price,
      quantity,
      color,
    });
    subtotal += product.price * quantity;
  }

  if (commerce.minOrderAmount > 0 && subtotal < commerce.minOrderAmount) {
    throw new CheckoutError(`الحد الأدنى للطلب هو ${commerce.minOrderAmount.toLocaleString("en-US")}.`);
  }

  const deliveryFee = deliveryFeeFor(commerce, governorate, subtotal);
  if (deliveryFee === null) throw new CheckoutError("التوصيل غير متاح لهذه المحافظة حالياً.");

  const discount = 0;
  const now = new Date().toISOString();
  const order: Order = {
    id: `o${Date.now().toString(36)}${randomBytes(3).toString("hex")}`,
    number: await nextOrderNumber(commerce.orderPrefix || "AT"),
    status: "pending",
    paymentStatus: "unpaid",
    customer: { name, phone, governorate, city, address, notes },
    items: orderItems,
    subtotal,
    discount,
    deliveryFee,
    total: subtotal - discount + deliveryFee,
    payment: { id: method.id, label: method.label, instructions: method.instructions },
    adminNotes: "",
    history: [{ status: "pending", at: now }],
    createdAt: now,
    updatedAt: now,
  };

  await insertOrder(order);

  // Reserve stock where it is tracked. Best-effort and after the insert: an
  // order must never be lost because a counter failed to move.
  for (const { product, quantity } of lines.values()) {
    if (typeof product.stock !== "number") continue;
    const fresh = await getProduct(product.id);
    if (!fresh || typeof fresh.data.stock !== "number") continue;
    await upsertProduct({ ...fresh.data, stock: Math.max(0, fresh.data.stock - quantity) }).catch(() => {});
  }

  return order;
}
