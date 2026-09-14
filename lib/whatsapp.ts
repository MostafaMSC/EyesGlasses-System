import type { Product } from "@/data/products";
import type { Order } from "@/data/orders";
import { formatPrice } from "@/lib/format";
import { runtimeConfig } from "@/lib/runtimeConfig";

const NL = "\n";

/** The product's page on this site, for pasting into a message. */
function productUrl(product: Pick<Product, "slug">): string {
  if (typeof window === "undefined") return `/products/${product.slug}`;
  return `${window.location.origin}/products/${product.slug}`;
}

export function buildProductWhatsAppMessage(product: Product, options?: { triedOn?: boolean }): string {
  const lines = [
    "السلام عليكم، أريد الاستفسار/طلب النظارة:",
    `الماركة: ${product.brand}`,
    `الموديل: ${product.name}`,
  ];
  if (product.sku) lines.push(`الكود: ${product.sku}`);
  lines.push(`السعر: ${formatPrice(product.price)}`);
  lines.push(productUrl(product));
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
  const message = buildProductWhatsAppMessage(product, options);
  const url = buildWhatsAppUrl(message);
  window.open(url, "_blank", "noopener,noreferrer");
}
