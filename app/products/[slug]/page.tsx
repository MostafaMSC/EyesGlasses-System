import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/db";
import { getSettingsSection } from "@/lib/settingsDb";
import { toPublicProduct } from "@/lib/productAssets";
import { discountPercent, getProductVisualSrc, isActive, type Product } from "@/data/products";
import { ProductPageClient } from "@/components/product/ProductPageClient";

export const dynamic = "force-dynamic";

async function load(slug: string): Promise<Product | null> {
  const row = await getProductBySlug(decodeURIComponent(slug));
  if (!row || !isActive(row.data)) return null;
  return toPublicProduct(row.data, row.updatedAt);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await load(slug);
  if (!product) return { title: "المنتج غير موجود" };
  const title = product.seo?.title || `${product.brand} ${product.name}`;
  const description =
    product.seo?.description || product.shortDescription || product.description.slice(0, 160);
  const image = getProductVisualSrc(product);
  return {
    title,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      images: image.startsWith("data:") ? undefined : [image],
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await load(slug);
  if (!product) notFound();

  let currency = "IQD";
  let storeName = "";
  try {
    const { data } = await getSettingsSection("store");
    storeName = data.name;
    currency = "IQD";
  } catch {
    // Structured data just goes without the store name.
  }

  const image = getProductVisualSrc(product);
  const inStock = product.availability !== "preorder" && (typeof product.stock !== "number" || product.stock > 0);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: `${product.brand} ${product.name}`,
        sku: product.sku,
        brand: { "@type": "Brand", name: product.brand },
        description: product.shortDescription || product.description,
        image: image.startsWith("data:") ? undefined : image,
        offers: {
          "@type": "Offer",
          priceCurrency: currency,
          price: product.price,
          availability: inStock ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
          url: `/products/${product.slug}`,
          seller: storeName ? { "@type": "Organization", name: storeName } : undefined,
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "الرئيسية", item: "/" },
          { "@type": "ListItem", position: 2, name: "التشكيلة", item: "/catalog" },
          { "@type": "ListItem", position: 3, name: product.name, item: `/products/${product.slug}` },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProductPageClient product={product} discount={discountPercent(product)} />
    </>
  );
}
