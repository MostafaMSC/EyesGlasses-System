import { storeConfig } from "@/data/storeConfig";
import type { Product } from "@/data/products";
import { formatPrice } from "@/lib/format";

export function buildProductWhatsAppMessage(product: Product, options?: { triedOn?: boolean }): string {
  const lines = [
    "السلام عليكم، أريد الاستفسار/طلب النظارة:",
    `الماركة: ${product.brand}`,
    `الموديل: ${product.name}`,
    `السعر: ${formatPrice(product.price)}`,
  ];
  if (options?.triedOn) {
    lines.push("وقد جربتها افتراضياً على الموقع.");
  }
  return lines.join("\n");
}

export function buildWhatsAppUrl(message: string): string {
  const params = new URLSearchParams({ text: message });
  return `https://wa.me/${storeConfig.whatsappNumber}?${params.toString()}`;
}

export function openWhatsAppOrder(product: Product, options?: { triedOn?: boolean }): void {
  const message = buildProductWhatsAppMessage(product, options);
  const url = buildWhatsAppUrl(message);
  window.open(url, "_blank", "noopener,noreferrer");
}
