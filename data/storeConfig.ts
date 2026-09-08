/**
 * Central store configuration.
 * Replace these values with the real store's details — nothing else in the
 * codebase should need to change.
 */
export const storeConfig = {
  storeName: "عوينات أبي ذر",
  storeNameEn: "Abu Thar Eyewear",
  tagline: "تجربتك تبدأ من هنا",

  // Digits only, international format without "+" (country code + number).
  // Example Iraq mobile: "9647701234567"
  whatsappNumber: "9647701234567",

  instagramUrl: "https://instagram.com/abu.thar.eyewear",
  instagramHandle: "@abu.thar.eyewear",

  currency: "د.ع",
  location: "العراق",

  deliveryText: "نوصل لك داخل العراق",

  trustPoints: [
    "توصيل داخل العراق",
    "تشكيلة أصلية",
    "تجربة افتراضية قبل الشراء",
    "طلب مباشر عبر واتساب",
  ],
} as const;

export type StoreConfig = typeof storeConfig;
