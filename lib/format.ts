import { storeConfig } from "@/data/storeConfig";

export function formatPrice(amount: number): string {
  return `${amount.toLocaleString("en-US")} ${storeConfig.currency}`;
}
