import type { Product } from "@/data/products";
import type { Order } from "@/data/orders";
import { formatPrice } from "@/lib/format";
import { runtimeConfig } from "@/lib/runtimeConfig";

const NL = "\n";

export function buildProductWhatsAppMessage(
  product: Product,
  options?: { triedOn?: boolean; origin?: string }
): string {
  const lines = [
    "السلام عليكم، أريد الاستفسار/طلب النظارة:",
    `الماركة: ${product.brand}`,
    `الموديل: ${product.name}`,
  ];
  if (product.sku) lines.push(`الكود: ${product.sku}`);
  lines.push(`السعر: ${formatPrice(product.price)}`);
  // The product's page, for the shop to open straight from the chat.
  lines.push(`${options?.origin ?? ""}/products/${product.slug}`);
  if (options?.triedOn) {
    lines.push("وقد جربتها افتراضياً على الموقع.");
  }
  return lines.join(NL);
}

export function buildOrderWhatsAppMessage(order: Order): string {
  const lines = [
    `السلام عليكم، طلبي رقم ${order.number}:`,
    `الاسم: ${order.customer.name}`,
    ...order.items.map((i) => `• ${i.brand} ${i.name}${i.color ? ` (${i.color})` : ""} × ${i.quantity}`),
    `المجموع: ${formatPrice(order.total)}`,
    `التوصيل إلى: ${order.customer.governorate}${order.customer.city ? ` – ${order.customer.city}` : ""}`,
    `الدفع: ${order.payment.label}`,
  ];
  return lines.join(NL);
}

export function buildWhatsAppUrl(message: string): string {
  const params = new URLSearchParams({ text: message });
  return `https://wa.me/${runtimeConfig.whatsappNumber}?${params.toString()}`;
}

export function openWhatsAppOrder(product: Product, options?: { triedOn?: boolean }): void {
  const message = buildProductWhatsAppMessage(product, { ...options, origin: window.location.origin });
  const url = buildWhatsAppUrl(message);
  window.open(url, "_blank", "noopener,noreferrer");
}
