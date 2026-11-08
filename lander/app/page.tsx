import { LaneDivider } from "@/components/engraving/LaneDivider";
import { Comparison } from "@/components/sections/Comparison";
import { Faq } from "@/components/sections/Faq";
import { FinalCta } from "@/components/sections/FinalCta";
import { Footer } from "@/components/sections/Footer";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Nav } from "@/components/sections/Nav";
import { Nigeria } from "@/components/sections/Nigeria";
import { Safety } from "@/components/sections/Safety";
import { Tickers } from "@/components/sections/Tickers";
import { BackToTop } from "@/components/islands/BackToTop";
import { RevealObserver } from "@/components/islands/RevealObserver";
import { SmoothScroll } from "@/components/islands/SmoothScroll";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <HowItWorks />
        <div className="ground-paper">
          <LaneDivider className="block h-12 w-full" />
        </div>
        <Comparison />
        <Safety />
        <Tickers />
        <Nigeria />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <RevealObserver />
      <SmoothScroll />
      <BackToTop />
    </>
  );
}
