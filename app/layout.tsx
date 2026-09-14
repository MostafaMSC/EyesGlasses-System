import type { Metadata, Viewport } from "next";
import { Cairo, Tajawal } from "next/font/google";
import { defaultSettings } from "@/data/siteSettings";
import { ShopUIProvider } from "@/context/ShopUIContext";
import { ThemeProvider, themeBootstrapScript } from "@/context/ThemeContext";
import { ProductsProvider } from "@/lib/productStore";
import { SettingsProvider } from "@/lib/settingsStore";
import { CartProvider } from "@/lib/cartStore";
import { WishlistProvider } from "@/lib/wishlistStore";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { VirtualTryOnModal } from "@/components/try-on/VirtualTryOnModal";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["600", "700", "800"],
  variable: "--font-cairo",
});

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-tajawal",
});

// The store name, SEO text and navigation are editable in admin, so pages
// are rendered per request rather than baked at build time — which also
// means the Docker build needs no database.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  let seo = defaultSettings.store.seo;
  let name = defaultSettings.store.name;
  try {
    const { getSettingsSection } = await import("@/lib/settingsDb");
    const { data } = await getSettingsSection("store");
    seo = { ...seo, ...data.seo };
    name = data.name || name;
  } catch {
    // No database (e.g. during the build): the defaults are fine.
  }
  return {
    title: { default: seo.title || `${name} | تجربة افتراضية للنظارات`, template: `%s | ${name}` },
    description: seo.description,
    openGraph: seo.ogImage ? { images: [seo.ogImage] } : undefined,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08090d" },
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `data-theme` is written by the bootstrap script below before paint;
    // suppressHydrationWarning keeps React from flagging that attribute.
    <html
      lang="ar"
      dir="rtl"
      data-theme="dark"
      // globals.css sets `scroll-behavior: smooth`; this tells Next.js to
      // suppress it during route transitions so navigations jump instantly.
      data-scroll-behavior="smooth"
      className={`${cairo.variable} ${tajawal.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      {/*
        Browser extensions (password managers, ColorZilla, etc.) inject
        attributes onto <body> before React hydrates, which React reports as a
        mismatch. This suppresses the warning for this element's own attributes
        only — mismatches in the tree below are still reported.
      */}
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <SettingsProvider>
            <ProductsProvider>
              <CartProvider>
                <WishlistProvider>
                  <ShopUIProvider>
                    <Header />
                    <main className="min-h-screen">{children}</main>
                    <Footer />
                    <CartDrawer />
                    <VirtualTryOnModal />
                  </ShopUIProvider>
                </WishlistProvider>
              </CartProvider>
            </ProductsProvider>
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
