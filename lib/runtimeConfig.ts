import { defaultSettings } from "@/data/siteSettings";

/**
 * The handful of settings that plain helper functions need without a React
 * hook — the currency `formatPrice` appends, the WhatsApp number links go
 * to. `SettingsProvider` writes them whenever the settings load or change;
 * until then they hold the defaults, which are the values the site shipped
 * with. Client-only: server code reads the settings row directly.
 */
export const runtimeConfig = {
  currency: defaultSettings.store.currency,
  whatsappNumber: defaultSettings.store.whatsappNumber,
  storeName: defaultSettings.store.name,
};
