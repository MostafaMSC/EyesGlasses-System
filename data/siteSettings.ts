/**
 * Everything the shop owner can change from the admin panel without a
 * developer: store identity and contact details, delivery and payment
 * options, categories and brands, the homepage, navigation and the
 * information pages.
 *
 * Stored as one JSON document per section in the `settings` table (see
 * `lib/settingsDb.ts`), so adding a field is a matter of adding it here with
 * a default — a section the database doesn't have yet, or has an older shape
 * of, is filled in from these defaults. The defaults are the content the
 * site shipped with, so a fresh install looks exactly as it did before any
 * of this was editable.
 */

export interface WorkingHours {
  /** 0 = Sunday … 6 = Saturday, matching `Date#getDay`. */
  day: number;
  open: string;
  close: string;
  closed: boolean;
}

export interface StoreSettings {
  name: string;
  nameEn: string;
  tagline: string;
  /** Data URL (stored) / asset URL (served). Empty means the built-in icon. */
  logo: string;
  currency: string;
  /** Digits only, international format without "+", e.g. 9647701234567. */
  whatsappNumber: string;
  phone: string;
  email: string;
  instagramUrl: string;
  instagramHandle: string;
  facebookUrl: string;
  tiktokUrl: string;
  address: string;
  mapsUrl: string;
  workingHours: WorkingHours[];
  about: {
    title: string;
    text: string;
    story: string;
    coverImage: string;
  };
  footerText: string;
  deliveryText: string;
  seo: {
    title: string;
    description: string;
    ogImage: string;
    googleAnalyticsId: string;
  };
}

export interface DeliveryZone {
  id: string;
  /** Governorate name as shown to the customer. */
  name: string;
  fee: number;
  active: boolean;
  /** Optional areas/cities inside the governorate, for the checkout picker. */
  areas: string[];
}

export type PaymentMethodKind = "cod" | "whatsapp" | "bank" | "other";

export interface PaymentMethod {
  id: string;
  kind: PaymentMethodKind;
  label: string;
  description: string;
  /** Shown after ordering, e.g. bank account details. */
  instructions: string;
  active: boolean;
}

export interface CommerceSettings {
  minOrderAmount: number;
  /** Delivery is free at or above this subtotal; 0 disables. */
  freeDeliveryThreshold: number;
  zones: DeliveryZone[];
  paymentMethods: PaymentMethod[];
  /** Order numbers look like `${orderPrefix}-000123`. */
  orderPrefix: string;
  /** Whether the customer can still order when stock is tracked and empty. */
  allowBackorder: boolean;
}

export interface CategoryDef {
  slug: string;
  name: string;
  nameEn: string;
  description: string;
  image: string;
  order: number;
  active: boolean;
}

export interface BrandDef {
  name: string;
  logo: string;
  description: string;
  country: string;
  active: boolean;
}

export interface CatalogSettings {
  categories: CategoryDef[];
  brands: BrandDef[];
}

export interface TrustBadge {
  id: string;
  /** Name of an icon in `components/ui/Icons` (see `trustIcons` in TrustSection). */
  icon: string;
  title: string;
  description: string;
  order: number;
  active: boolean;
}

export interface Banner {
  id: string;
  title: string;
  description: string;
  image: string;
  ctaText: string;
  ctaLink: string;
  /** ISO dates; empty means no bound. */
  startsAt: string;
  endsAt: string;
  priority: number;
  active: boolean;
}

export interface HomepageSettings {
  hero: {
    badge: string;
    title: string;
    /** Rendered with the accent gradient, after `title`. */
    highlight: string;
    subtitle: string;
    ctaText: string;
    secondaryCtaText: string;
    secondaryCtaLink: string;
    image: string;
    active: boolean;
  };
  stats: { value: string; label: string }[];
  trust: TrustBadge[];
  featured: {
    title: string;
    subtitle: string;
    /** Explicit picks; when empty the featured/bestseller flags decide. */
    productIds: string[];
    active: boolean;
  };
  newArrivals: { title: string; subtitle: string; active: boolean };
  social: { title: string; highlight: string; subtitle: string; active: boolean };
  banners: Banner[];
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  visible: boolean;
  order: number;
}

export interface NavigationSettings {
  header: NavItem[];
  footer: NavItem[];
}

export interface PageDef {
  slug: string;
  title: string;
  /** Plain text; blank lines separate paragraphs, a line starting with "## " is a heading. */
  body: string;
  published: boolean;
  updatedAt: string;
}

export interface PagesSettings {
  pages: PageDef[];
}

export type CouponType = "percent" | "fixed";

export interface Coupon {
  id: string;
  /** Upper-cased; what the customer types. */
  code: string;
  type: CouponType;
  /** Percent (1–100) or a fixed amount in the store currency. */
  value: number;
  minOrderAmount: number;
  /** Restrict to these products / categories; empty means the whole order. */
  productIds: string[];
  categorySlugs: string[];
  /** ISO date; empty means never. */
  expiresAt: string;
  /** 0 = unlimited. Uses are counted from orders that carry the code. */
  maxUses: number;
  perCustomerLimit: number;
  active: boolean;
}

export interface PromotionsSettings {
  coupons: Coupon[];
}

export interface SiteSettings {
  store: StoreSettings;
  commerce: CommerceSettings;
  catalog: CatalogSettings;
  homepage: HomepageSettings;
  navigation: NavigationSettings;
  pages: PagesSettings;
  promotions: PromotionsSettings;
}

export type SettingsSection = keyof SiteSettings;
export const SETTINGS_SECTIONS: SettingsSection[] = [
  "store",
  "commerce",
  "catalog",
  "homepage",
  "navigation",
  "pages",
  "promotions",
];

const IRAQ_GOVERNORATES = [
  "بغداد",
  "البصرة",
  "نينوى",
  "أربيل",
  "النجف",
  "كربلاء",
  "كركوك",
  "ذي قار",
  "الأنبار",
  "ديالى",
  "بابل",
  "واسط",
  "صلاح الدين",
  "السليمانية",
  "دهوك",
  "القادسية",
  "ميسان",
  "المثنى",
];

export const defaultSettings: SiteSettings = {
  store: {
    name: "عوينات أبي ذر",
    nameEn: "Abu Thar Eyewear",
    tagline: "تجربتك تبدأ من هنا",
    logo: "",
    currency: "د.ع",
    whatsappNumber: "9647701234567",
    phone: "",
    email: "",
    instagramUrl: "https://instagram.com/abu.thar.eyewear",
    instagramHandle: "@abu.thar.eyewear",
    facebookUrl: "",
    tiktokUrl: "",
    address: "العراق",
    mapsUrl: "",
    workingHours: [6, 0, 1, 2, 3, 4, 5].map((day) => ({
      day,
      open: "10:00",
      close: "22:00",
      closed: day === 5,
    })),
    about: {
      title: "من نحن",
      text: "نظارات أصلية بأسلوب فاخر، مع تجربة افتراضية تخليك تشوف شكل النظارة عليك قبل ما تطلبها.",
      story: "",
      coverImage: "",
    },
    footerText:
      "نظارات أصلية بأسلوب فاخر، مع تجربة افتراضية تخليك تشوف شكل النظارة عليك قبل ما تطلبها.",
    deliveryText: "نوصل لك داخل العراق",
    seo: {
      title: "عوينات أبي ذر | تجربة افتراضية للنظارات",
      description:
        "اكتشف تشكيلة عوينات أبي ذر، جرّب النظارة على وجهك مباشرة من كاميرا موبايلك، واطلب عبر واتساب.",
      ogImage: "",
      googleAnalyticsId: "",
    },
  },
  commerce: {
    minOrderAmount: 0,
    freeDeliveryThreshold: 0,
    zones: IRAQ_GOVERNORATES.map((name, i) => ({
      id: `z${i + 1}`,
      name,
      fee: name === "بغداد" ? 5000 : 8000,
      active: true,
      areas: [],
    })),
    paymentMethods: [
      {
        id: "cod",
        kind: "cod",
        label: "الدفع عند الاستلام",
        description: "تدفع نقداً للمندوب عند وصول الطلب.",
        instructions: "",
        active: true,
      },
      {
        id: "whatsapp",
        kind: "whatsapp",
        label: "تأكيد عبر واتساب",
        description: "نتواصل معك على واتساب لتأكيد الطلب وطريقة الدفع.",
        instructions: "",
        active: true,
      },
      {
        id: "bank",
        kind: "bank",
        label: "تحويل بنكي / محفظة",
        description: "حوّل المبلغ ثم أرسل صورة الإيصال على واتساب.",
        instructions: "",
        active: false,
      },
    ],
    orderPrefix: "AT",
    allowBackorder: true,
  },
  catalog: {
    categories: [
      {
        slug: "sunglasses",
        name: "نظارات شمسية",
        nameEn: "Sunglasses",
        description: "",
        image: "",
        order: 1,
        active: true,
      },
      {
        slug: "optical",
        name: "نظارات طبية",
        nameEn: "Optical",
        description: "",
        image: "",
        order: 2,
        active: true,
      },
    ],
    brands: [],
  },
  homepage: {
    hero: {
      badge: "تجربة افتراضية بالكاميرا",
      title: "اختار نظارتك...",
      highlight: "جربها",
      subtitle:
        "اكتشف تشكيلتنا من النظارات وجرب الإطار على وجهك مباشرة من كاميرا موبايلك — بدون تطبيق، وبدون ما تطلع من البيت.",
      ctaText: "جرّب النظارة الآن",
      secondaryCtaText: "تصفح المجموعة",
      secondaryCtaLink: "/catalog",
      image: "",
      active: true,
    },
    stats: [
      { value: "+٥٠٠", label: "عميل جرّب المجموعة" },
      { value: "٢٤ س", label: "رد على واتساب" },
      { value: "٣D", label: "تجربة على الوجه" },
    ],
    trust: [
      { id: "t1", icon: "truck", title: "توصيل داخل العراق", description: "", order: 1, active: true },
      { id: "t2", icon: "gem", title: "تشكيلة أصلية", description: "", order: 2, active: true },
      { id: "t3", icon: "camera", title: "تجربة افتراضية قبل الشراء", description: "", order: 3, active: true },
      { id: "t4", icon: "whatsapp", title: "طلب مباشر عبر واتساب", description: "", order: 4, active: true },
    ],
    featured: {
      title: "الأكثر مبيعاً",
      subtitle: "الإطارات التي يختارها زبائننا أكثر من غيرها — جرّب أي واحدة منها على وجهك مباشرة.",
      productIds: [],
      active: true,
    },
    newArrivals: { title: "وصل حديثاً", subtitle: "آخر الإطارات التي أضفناها للتشكيلة.", active: true },
    social: {
      title: "شفت نظارة على إنستغرام؟",
      highlight: "جربها هنا قبل ما تطلبها",
      subtitle: "ابحث عن الموديل في التشكيلة، شغّل الكاميرا، وشوف شكلها على وجهك خلال ثوانٍ.",
      active: true,
    },
    banners: [],
  },
  navigation: {
    header: [
      { id: "n1", label: "الرئيسية", href: "/", visible: true, order: 1 },
      { id: "n2", label: "التشكيلة", href: "/catalog", visible: true, order: 2 },
      { id: "n3", label: "النظارات الشمسية", href: "/catalog?category=sunglasses", visible: true, order: 3 },
      { id: "n4", label: "النظارات الطبية", href: "/catalog?category=optical", visible: true, order: 4 },
    ],
    footer: [
      { id: "f1", label: "كل التشكيلة", href: "/catalog", visible: true, order: 1 },
      { id: "f2", label: "النظارات الشمسية", href: "/catalog?category=sunglasses", visible: true, order: 2 },
      { id: "f3", label: "النظارات الطبية", href: "/catalog?category=optical", visible: true, order: 3 },
      { id: "f4", label: "تتبع طلبك", href: "/track", visible: true, order: 4 },
      { id: "f5", label: "الأسئلة الشائعة", href: "/pages/faq", visible: true, order: 5 },
      { id: "f6", label: "سياسة التوصيل", href: "/pages/shipping", visible: true, order: 6 },
      { id: "f7", label: "سياسة الاستبدال", href: "/pages/returns", visible: true, order: 7 },
      { id: "f8", label: "من نحن", href: "/pages/about", visible: true, order: 8 },
    ],
  },
  pages: {
    pages: [
      {
        slug: "about",
        title: "من نحن",
        body: "عوينات أبي ذر متجر نظارات يقدّم تشكيلة أصلية من النظارات الشمسية والطبية، مع تجربة افتراضية تخليك تشوف شكل النظارة على وجهك قبل ما تطلبها.",
        published: true,
        updatedAt: "",
      },
      {
        slug: "contact",
        title: "تواصل معنا",
        body: "يسعدنا تواصلك في أي وقت عبر واتساب أو إنستغرام. تفاصيل التواصل وساعات العمل تجدها في أسفل هذه الصفحة.",
        published: true,
        updatedAt: "",
      },
      {
        slug: "faq",
        title: "الأسئلة الشائعة",
        body: "## كيف أجرّب النظارة افتراضياً؟\nافتح أي نظارة واضغط «جربها»، ثم اسمح للموقع باستخدام الكاميرا. تظهر النظارة على وجهك مباشرة وتتحرك مع حركة رأسك.\n\n## هل النظارات أصلية؟\nنعم، كل ما نعرضه أصلي ومضمون.\n\n## كم يستغرق التوصيل؟\nداخل بغداد خلال ٢٤–٤٨ ساعة، وباقي المحافظات خلال ٢–٤ أيام عمل.\n\n## كيف أدفع؟\nالدفع عند الاستلام متاح لكل المحافظات، ويمكن التأكيد عبر واتساب.",
        published: true,
        updatedAt: "",
      },
      {
        slug: "shipping",
        title: "سياسة التوصيل",
        body: "نوصل إلى جميع محافظات العراق. تُحسب أجرة التوصيل حسب المحافظة وتظهر لك قبل تأكيد الطلب.\n\nيتواصل معك المندوب قبل التسليم.",
        published: true,
        updatedAt: "",
      },
      {
        slug: "returns",
        title: "سياسة الاستبدال والإرجاع",
        body: "يمكنك استبدال النظارة خلال ٧ أيام من الاستلام بشرط أن تكون بحالتها الأصلية مع العلبة والملحقات.\n\nللاستبدال تواصل معنا عبر واتساب برقم الطلب.",
        published: true,
        updatedAt: "",
      },
      {
        slug: "privacy",
        title: "سياسة الخصوصية",
        body: "نستخدم معلوماتك (الاسم، رقم الهاتف، العنوان) فقط لتجهيز طلبك وتوصيله، ولا نشاركها مع أي جهة أخرى.\n\nالتجربة الافتراضية تعمل بالكامل داخل متصفحك: صورة الكاميرا لا تُرسل إلى خوادمنا ولا تُخزَّن.",
        published: true,
        updatedAt: "",
      },
      {
        slug: "terms",
        title: "الشروط والأحكام",
        body: "الأسعار المعروضة بالدينار العراقي وتشمل النظارة والعلبة. أجرة التوصيل تُضاف حسب المحافظة.\n\nيحق للمتجر إلغاء أي طلب لا يمكن تأكيده هاتفياً.",
        published: true,
        updatedAt: "",
      },
      {
        slug: "try-on-guide",
        title: "دليل التجربة الافتراضية",
        body: "## قبل البدء\nاستخدم إضاءة جيدة وواجه الكاميرا مباشرة.\n\n## أثناء التجربة\nحرّك رأسك يميناً ويساراً لتشوف النظارة من كل الزوايا، وبدّل بين الموديلات من الشريط السفلي.\n\n## التقاط صورة\nاضغط زر الكاميرا لحفظ صورة بالنظارة ومشاركتها.",
        published: true,
        updatedAt: "",
      },
      {
        slug: "size-guide",
        title: "دليل المقاسات",
        body: "تُكتب مقاسات الإطار عادة على الذراع بالشكل 52□18 140:\n\n## عرض العدسة\nالرقم الأول (مثلاً 52 ملم).\n\n## عرض الجسر\nالرقم الثاني (مثلاً 18 ملم) — المسافة بين العدستين.\n\n## طول الذراع\nالرقم الثالث (مثلاً 140 ملم).\n\nكقاعدة عامة: الوجه الضيق يناسبه عرض عدسة 50 أو أقل، والمتوسط 51–54، والعريض 55 وأكثر.",
        published: true,
        updatedAt: "",
      },
      {
        slug: "frame-guide",
        title: "دليل اختيار الإطار",
        body: "## الوجه الدائري\nالإطارات المربعة والمستطيلة تعطي توازناً.\n\n## الوجه المربع\nالإطارات الدائرية والبيضاوية تلطّف الزوايا.\n\n## الوجه البيضاوي\nيناسبه معظم الأشكال.\n\n## الوجه القلبي\nالإطارات الخفيفة وكات آي.\n\nوالأسهل: جرّبها افتراضياً على وجهك!",
        published: true,
        updatedAt: "",
      },
    ],
  },
  promotions: { coupons: [] },
};

/** Store-owner-facing names for the sections, used by the admin panel. */
export const settingsSectionLabel: Record<SettingsSection, string> = {
  store: "معلومات المتجر",
  commerce: "التوصيل والدفع",
  catalog: "التصنيفات والماركات",
  homepage: "الصفحة الرئيسية",
  navigation: "القوائم",
  pages: "الصفحات",
  promotions: "الكوبونات",
};
