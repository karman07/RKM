"use client";

import { THEME } from "../app/constants";
import { FadeIn } from "./FadeIn";
import Link from "next/link";

export default function AboutTeaser() {
  return (
    <section className="py-20 px-6" style={{ backgroundColor: THEME.colors.background }}>
      <div className="max-w-4xl mx-auto text-center pt-8" style={{ borderColor: THEME.colors.border }}>
        <FadeIn delay={0}>
          <span className="uppercase tracking-[0.3em] font-semibold text-xs mb-6 block" style={{ color: THEME.colors.primaryLight }}>The RKM Heritage</span>
          <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl mb-8" style={{ color: THEME.colors.primaryDark }}>Trusted Jewellers in Mohali & Chandigarh</h2>
          <p className="text-lg leading-relaxed mb-12 opacity-80 max-w-3xl mx-auto" style={{ color: THEME.colors.textMuted }}>
            RKM Jewellers is a trusted jewellery brand based in Mohali, near Chandigarh, known for its exceptional craftsmanship and elegant designs. 
            Established to unite traditional artistry with modern aesthetics, we specialize in handcrafted gold, certified diamond, and silver jewellery 
            tailored for every occasion. Every piece follows BIS hallmark standards, ensuring the highest authenticity and style for our clients across Punjab.
          </p>
          <Link 
            href="/about" 
            className="inline-block border-b hover:-translate-y-1 transition-all uppercase tracking-[0.2em] text-xs font-semibold pb-1"
            style={{ borderColor: THEME.colors.primaryDark, color: THEME.colors.primaryDark }}
          >
            Discover the RKM Promise
          </Link>
        </FadeIn>
      </div>
    </section>
  );
}
