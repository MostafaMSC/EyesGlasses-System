import { Hero } from "@/components/home/Hero";
import { TrustSection } from "@/components/home/TrustSection";
import { FeaturedSection } from "@/components/home/FeaturedSection";
import { SocialSection } from "@/components/home/SocialSection";

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustSection />
      <FeaturedSection />
      <SocialSection />
    </>
  );
}
