import type { Availability } from "@/data/products";

export const availabilityLabel: Record<Availability, string> = {
  in_stock: "متوفر",
  low_stock: "كمية محدودة",
  preorder: "بحسب الطلب",
};

export const availabilityTone: Record<Availability, "success" | "accent" | "muted"> = {
  in_stock: "success",
  low_stock: "accent",
  preorder: "muted",
};
