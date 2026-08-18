import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Introduction } from "@/components/Introduction";
import { Manifesto } from "@/components/Manifesto";
import { Mechanism } from "@/components/Mechanism";
import { HydraDB } from "@/components/HydraDB";
import { Investigate } from "@/components/Investigate";
import { Proof } from "@/components/Proof";
import { Intermission } from "@/components/Intermission";
import { Difference } from "@/components/Difference";
import { FinalCta } from "@/components/FinalCta";
import { RepeatBand } from "@/components/motion/RepeatBand";

export default function Page() {
  return (
    <>
      <a
        href="#introduction"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[70] focus:bg-ink focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:text-paper"
      >
        Skip to content
      </a>
      <Nav />
      <main>
        <Hero />
        <Introduction />
        <RepeatBand word="VURQEL" />
        <Manifesto />
        <Mechanism />
        <HydraDB />
        <Investigate />
        <Proof />
        <Intermission />
        <Difference />
        <FinalCta />
      </main>
    </>
  );
}
