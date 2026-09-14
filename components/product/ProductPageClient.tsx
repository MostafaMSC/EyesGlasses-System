"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  canTryOn,
  galleryKindLabel,
  genderLabel,
  getProductVisualSrc,
  isActive,
  materialLabel,
  sizeLabel,
  type Product,
} from "@/data/products";
import { frameShapeLabel } from "@/lib/frameShapes";
import { useProductStore } from "@/lib/productStore";
import { useSettings } from "@/lib/settingsStore";
import { useCart } from "@/lib/cartStore";
import { useWishlist } from "@/lib/wishlistStore";
import { useShopUI } from "@/context/ShopUIContext";
import { formatPrice } from "@/lib/format";
import { availabilityLabel, availabilityTone } from "@/lib/availability";
import { buildProductWhatsAppMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import { track } from "@/lib/analytics";
import { useOrigin } from "@/lib/useOrigin";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProductGrid } from "@/components/eyewear/ProductGrid";
import { PageBody } from "@/components/pages/PageBody";
import {
  IconCamera,
  IconCart,
  IconCheck,
  IconChevron,
  IconHeart,
  IconRefresh,
  IconStar,
  IconTruck,
  IconWhatsApp,
  IconShieldCheck,
} from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

export function ProductPageClient({ product: initial, discount }: { product: Product; discount: number }) {
  const router = useRouter();
  const { products, getById, hydrated } = useProductStore();
  const { settings } = useSettings();
  const cart = useCart();
  const wishlist = useWishlist();
  const { openTryOn } = useShopUI();

  // The server rendered the row as it was; once the catalogue has loaded,
  // follow it so a price change in admin shows without a reload.
  const product = (hydrated && getById(initial.id)) || initial;
  const [color, setColor] = useState<string | undefined>(product.colors.length > 1 ? product.colors[0].name : undefined);
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    track("product_view", product.id);
  }, [product.id]);

  const images = useMemo(() => {
    const list = (product.gallery ?? []).map((g) => ({ src: g.src, label: galleryKindLabel[g.kind] }));
    if (list.length === 0) list.push({ src: getProductVisualSrc(product), label: "أمامية" });
    return list;
  }, [product]);

  const category = settings.catalog.categories.find((c) => c.slug === product.category);
  const soldOut = typeof product.stock === "number" && product.stock <= 0;
  const lowStock = typeof product.stock === "number" && product.stock > 0 && product.stock <= (product.lowStockThreshold ?? 3);
  const saved = wishlist.has(product.id);
  const tryOn = canTryOn(product);

  const related = useMemo(
    () =>
      products
        .filter(isActive)
        .filter((p) => p.id !== product.id && (p.brand === product.brand || p.category === product.category))
        .slice(0, 4),
    [products, product]
  );

  const addToCart = () => {
    cart.add(product.id, 1, color);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };
  const buyNow = () => {
    cart.add(product.id, 1, color);
    router.push("/checkout");
  };

  const specs = product.specs ?? {};
  const dims = specs.dimensions ?? {};
  const specRows: [string, string | undefined][] = [
    ["الماركة", product.brand],
    ["الكود", product.sku],
    ["النوع", category?.name],
    ["شكل الإطار", frameShapeLabel[product.tryOn.frameShape]],
    ["لون الإطار", specs.colorName || product.colors.map((c) => c.name).join("، ")],
    ["الخامة", specs.material ? materialLabel[specs.material] : undefined],
    ["الفئة", specs.gender ? genderLabel[specs.gender] : undefined],
    ["المقاس", specs.size ? sizeLabel[specs.size] : undefined],
    ["حماية UV", specs.uvProtection ? "نعم" : undefined],
    ["يقبل عدسات طبية", specs.prescriptionCompatible ? "نعم" : specs.prescriptionCompatible === false ? "لا" : undefined],
    ["العدسات", specs.lensCompatibility],
    ["الوزن", dims.weight ? `${dims.weight} غم` : undefined],
  ];
  const dimRows: [string, number | undefined][] = [
    ["عرض العدسة", dims.lensWidth],
    ["ارتفاع العدسة", dims.lensHeight],
    ["عرض الجسر", dims.bridgeWidth],
    ["طول الذراع", dims.templeLength],
    ["عرض الإطار الكلي", dims.frameWidth],
  ];
  const hasDims = dimRows.some(([, v]) => v);

  const shippingPage = settings.pages.pages.find((p) => p.slug === "shipping" && p.published);
  const returnsPage = settings.pages.pages.find((p) => p.slug === "returns" && p.published);
  const origin = useOrigin();
  const whatsappAsk = buildWhatsAppUrl(buildProductWhatsAppMessage(product, { origin }));

  return (
    <div className="pb-28 pt-6 sm:pb-16 sm:pt-10">
      <Container>
        <nav aria-label="مسار الصفحة" className="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Link href="/" className="transition hover:text-accent">
            الرئيسية
          </Link>
          <IconChevron className="h-3 w-3 rotate-180" />
          <Link href="/catalog" className="transition hover:text-accent">
            التشكيلة
          </Link>
          {category && (
            <>
              <IconChevron className="h-3 w-3 rotate-180" />
              <Link href={`/catalog?category=${category.slug}`} className="transition hover:text-accent">
                {category.name}
              </Link>
            </>
          )}
          <IconChevron className="h-3 w-3 rotate-180" />
          <span className="text-ink">{product.name}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          {/* Gallery */}
          <div>
            <div className="relative overflow-hidden rounded-[32px] border border-line bg-gradient-to-br from-surface-2 to-surface">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_35%,rgba(255,255,255,0.10),transparent_70%)]" />
              <div className="relative flex aspect-[5/4] items-center justify-center p-[8%] sm:aspect-[4/3]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={images[activeImage]?.src}
                  src={images[activeImage]?.src}
                  alt={`${product.brand} ${product.name} — ${images[activeImage]?.label ?? ""}`}
                  className="max-h-full w-full object-contain drop-shadow-[0_24px_30px_rgba(0,0,0,0.45)]"
                />
              </div>
              <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-1.5">
                {discount > 0 && <Badge tone="danger">خصم {discount}%</Badge>}
                {product.bestseller && (
                  <Badge tone="accent" icon={<IconStar className="h-3 w-3" />}>
                    الأكثر مبيعاً
                  </Badge>
                )}
                {product.isNew && <Badge tone="ink">جديد</Badge>}
              </div>
              {tryOn && (
                <button
                  type="button"
                  onClick={() => openTryOn(product.id)}
                  className="glass shine absolute bottom-4 left-4 flex items-center gap-2 overflow-hidden rounded-full px-4 py-2.5 text-xs font-bold text-ink transition hover:border-accent/50 active:scale-95"
                >
                  <IconCamera className="h-4 w-4 text-accent" /> جرّبها على وجهك
                </button>
              )}
            </div>
            {images.length > 1 && (
              <div className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={img.src + i}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    aria-label={img.label}
                    aria-pressed={i === activeImage}
                    className={cn(
                      "flex h-20 w-24 shrink-0 items-center justify-center rounded-2xl border bg-surface-2 p-2 transition",
                      i === activeImage ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-accent/40"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.src} alt="" loading="lazy" className="max-h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-accent">{product.brand}</p>
              <h1 className="mt-1 font-display text-2xl font-extrabold text-ink sm:text-3xl">{product.name}</h1>
              {product.sku && (
                <p className="mt-1 text-xs text-muted">
                  الكود: <span dir="ltr">{product.sku}</span>
                </p>
              )}
              {product.shortDescription && <p className="mt-3 text-sm leading-7 text-ink-soft">{product.shortDescription}</p>}
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-extrabold text-ink">{formatPrice(product.price)}</span>
              {discount > 0 && product.compareAtPrice && (
                <>
                  <span className="text-base text-muted line-through">{formatPrice(product.compareAtPrice)}</span>
                  <span className="rounded-full bg-danger/12 px-2.5 py-1 text-xs font-bold text-danger">
                    وفّر {formatPrice(product.compareAtPrice - product.price)}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={soldOut ? "muted" : availabilityTone[product.availability]}>
                {soldOut ? "نفد المخزون" : availabilityLabel[product.availability]}
              </Badge>
              {lowStock && <Badge tone="accent">بقي {product.stock} فقط</Badge>}
              {tryOn && (
                <Badge tone="outline" icon={<IconCamera className="h-3 w-3 text-accent" />}>
                  متاح للتجربة الافتراضية
                </Badge>
              )}
            </div>

            {product.colors.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                  اللون{color ? `: ${color}` : product.colors.length === 1 ? `: ${product.colors[0].name}` : ""}
                </p>
                <div className="flex items-center gap-2.5">
                  {product.colors.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      title={c.name}
                      aria-label={c.name}
                      aria-pressed={color === c.name}
                      onClick={() => product.colors.length > 1 && setColor(c.name)}
                      className={cn(
                        "h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-bg transition",
                        color === c.name || product.colors.length === 1 ? "ring-accent" : "ring-line hover:ring-accent/60"
                      )}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-2.5 sm:grid-cols-2">
              {tryOn && (
                <Button
                  variant="primary"
                  size="lg"
                  className="sm:col-span-2"
                  icon={<IconCamera className="h-5 w-5" />}
                  onClick={() => openTryOn(product.id)}
                >
                  جرّبها على وجهك بالكاميرا
                </Button>
              )}
              <Button
                variant="solid"
                size="lg"
                icon={added ? <IconCheck className="h-5 w-5" /> : <IconCart className="h-5 w-5" />}
                disabled={soldOut}
                onClick={addToCart}
              >
                {added ? "أُضيفت للسلة" : "أضف إلى السلة"}
              </Button>
              <Button variant="secondary" size="lg" disabled={soldOut} onClick={buyNow}>
                اشترِ الآن
              </Button>
              <button
                type="button"
                onClick={() => wishlist.toggle(product.id)}
                aria-pressed={saved}
                className={cn(
                  "btn btn-md flex items-center justify-center gap-2 rounded-full border text-sm font-bold transition",
                  saved ? "border-danger/40 bg-danger/10 text-danger" : "border-line text-ink-soft hover:border-accent/40 hover:text-ink"
                )}
              >
                <IconHeart className="h-4.5 w-4.5" filled={saved} /> {saved ? "في المفضلة" : "أضف للمفضلة"}
              </button>
              <Button variant="whatsapp" size="md" href={whatsappAsk} target="_blank" rel="noopener noreferrer" icon={<IconWhatsApp className="h-4.5 w-4.5" />}>
                اسأل عن المنتج
              </Button>
            </div>

            <ul className="grid gap-2 rounded-2xl border border-line bg-surface-2 p-4 text-xs text-ink-soft sm:grid-cols-3">
              <li className="flex items-center gap-2">
                <IconTruck className="h-4 w-4 shrink-0 text-accent" /> {settings.store.deliveryText}
              </li>
              <li className="flex items-center gap-2">
                <IconShieldCheck className="h-4 w-4 shrink-0 text-success" /> منتج أصلي ومضمون
              </li>
              <li className="flex items-center gap-2">
                <IconRefresh className="h-4 w-4 shrink-0 text-accent" /> استبدال سهل
              </li>
            </ul>
          </div>
        </div>

        {/* Details */}
        <div className="mt-12 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          <div className="flex flex-col gap-8">
            <Section title="الوصف">
              <p className="whitespace-pre-line text-sm leading-8 text-ink-soft">{product.description}</p>
            </Section>

            <Section title="المواصفات">
              <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                {specRows
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-sm">
                      <dt className="text-muted">{k}</dt>
                      <dd className="font-bold text-ink">{v}</dd>
                    </div>
                  ))}
              </dl>
            </Section>

            {hasDims && (
              <Section title="أبعاد الإطار">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {dimRows
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="rounded-2xl border border-line bg-surface-2 p-3 text-center">
                        <p className="text-lg font-extrabold text-ink">
                          {v} <span className="text-xs font-bold text-muted">ملم</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">{k}</p>
                      </div>
                    ))}
                </div>
                <Link href="/pages/size-guide" className="mt-3 inline-block text-xs font-bold text-accent">
                  دليل المقاسات ←
                </Link>
              </Section>
            )}
          </div>

          <div className="flex flex-col gap-6">
            {shippingPage && (
              <Section title={shippingPage.title} compact>
                <PageBody body={shippingPage.body} compact />
              </Section>
            )}
            {returnsPage && (
              <Section title={returnsPage.title} compact>
                <PageBody body={returnsPage.body} compact />
              </Section>
            )}
            <Section title="أسئلة شائعة" compact>
              <p className="text-sm leading-7 text-ink-soft">
                كل ما تحتاج معرفته عن التجربة الافتراضية والتوصيل والدفع.{" "}
                <Link href="/pages/faq" className="font-bold text-accent">
                  اقرأ الأسئلة الشائعة
                </Link>
              </p>
            </Section>
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-14">
            <h2 className="mb-5 font-display text-xl font-extrabold text-ink">قد تعجبك أيضاً</h2>
            <ProductGrid products={related} />
          </div>
        )}
      </Container>

      {/* Sticky action bar — phones. */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 px-3 py-2.5 backdrop-blur-xl sm:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => wishlist.toggle(product.id)}
            aria-label={saved ? "إزالة من المفضلة" : "أضف إلى المفضلة"}
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border",
              saved ? "border-danger/40 bg-danger/10 text-danger" : "border-line bg-surface-2 text-ink-soft"
            )}
          >
            <IconHeart className="h-5 w-5" filled={saved} />
          </button>
          {tryOn && (
            <Button variant="secondary" size="md" className="flex-1" icon={<IconCamera className="h-4.5 w-4.5" />} onClick={() => openTryOn(product.id)}>
              جرّبها
            </Button>
          )}
          <Button variant="primary" size="md" className="flex-[1.3]" icon={<IconCart className="h-4.5 w-4.5" />} disabled={soldOut} onClick={addToCart}>
            {added ? "أُضيفت" : "أضف للسلة"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, compact = false }: { title: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <section className={cn("rounded-3xl border border-line bg-surface p-5", compact ? "" : "sm:p-7")}>
      <h2 className={cn("mb-3 font-display font-extrabold text-ink", compact ? "text-base" : "text-lg")}>{title}</h2>
      {children}
    </section>
  );
}
