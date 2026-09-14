import { runtimeConfig } from "@/lib/runtimeConfig";

export function formatPrice(amount: number): string {
  return `${amount.toLocaleString("en-US")} ${runtimeConfig.currency}`;
}

/** Arabic date like ١٤ أيلول ٢٠٢٦. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ar-IQ", { year: "numeric", month: "long", day: "numeric" });
}
