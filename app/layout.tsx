import type { Metadata, Viewport } from "next";
import { Cairo, Tajawal } from "next/font/google";
import { storeConfig } from "@/data/storeConfig";
import { ShopUIProvider } from "@/context/ShopUIContext";
import { ThemeProvider, themeBootstrapScript } from "@/context/ThemeContext";
import { ProductsProvider } from "@/lib/productStore";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductDetailsModal } from "@/components/eyewear/ProductDetailsModal";
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

export const metadata: Metadata = {
  title: `${storeConfig.storeName} | تجربة افتراضية للنظارات`,
  description:
    "اكتشف تشكيلة عوينات أبي ذر، جرّب النظارة على وجهك مباشرة من كاميرا موبايلك، واطلب عبر واتساب.",
};

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
          <ProductsProvider>
            <ShopUIProvider>
              <Header />
              <main className="min-h-screen">{children}</main>
              <Footer />
              <ProductDetailsModal />
              <VirtualTryOnModal />
            </ShopUIProvider>
          </ProductsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
