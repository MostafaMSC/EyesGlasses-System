import { Hero } from "@/components/home/Hero";
import { TrustSection } from "@/components/home/TrustSection";
import { FeaturedSection, NewArrivalsSection } from "@/components/home/FeaturedSection";
import { BannerSection } from "@/components/home/BannerSection";
import { CategorySection } from "@/components/home/CategorySection";
import { SocialSection } from "@/components/home/SocialSection";

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustSection />
      <BannerSection />
      <CategorySection />
      <FeaturedSection />
      <NewArrivalsSection />
      <SocialSection />
    </>
  );
}
