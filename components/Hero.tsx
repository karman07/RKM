"use client";

import { THEME } from "../app/constants";
import { FadeIn } from "./FadeIn";
import { ArrowRightIcon } from "./Icons";
import { Typewriter } from "./Typewriter";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          src="/rkm_bg1.png"
          alt="Emerald Collection"
          className="w-full h-full object-cover brightness-[0.7] contrast-[1.1] scale-105"
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to top, ${THEME.colors.primaryDark} 0%, transparent 100%)`,
            opacity: 0.5
          }}
        />
      </div>

      <div className="relative z-10 text-center px-4 max-w-5xl pt-24" style={{ color: THEME.colors.textLight }}>
        <FadeIn delay={0}>
          <span
            className="uppercase tracking-[0.4em] text-xs md:text-sm mb-8 block font-semibold opacity-90"
            style={{ color: THEME.colors.secondary }}
          >
            Handcrafted Luxury | Mohali • Chandigarh
          </span>
        </FadeIn>

        <FadeIn delay={200}>
          <div className="flex items-center justify-center min-h-[120px] md:min-h-[160px] lg:min-h-[200px]">
            <h2
              className="font-serif font-normal leading-tight drop-shadow-[0_4px_30px_rgba(0,0,0,0.5)]"
              style={{ fontSize: 'clamp(2rem, 8vw, 6rem)' }}
            >
              <Typewriter
                texts={["Fine Jewellery Mohali", "Bridal Luxury Chandigarh", "Crafted Perfection"]}
                className="italic text-white"
              />
            </h2>
          </div>
        </FadeIn>

        <FadeIn delay={400}>
          <div className="flex flex-col md:flex-row gap-6 justify-center items-center mt-16">
            <Link
              href="/products"
              style={{ backgroundColor: THEME.colors.primary, color: THEME.colors.textLight }}
              className="px-10 py-5 uppercase tracking-[0.2em] text-xs hover:bg-[#059669] transition-all duration-500 shadow-2xl flex items-center gap-3 w-full md:w-auto justify-center group rounded-full"
            >
              Explore Bridal & Fine Collections
              <div className="group-hover:translate-x-2 transition-transform duration-300">
                <ArrowRightIcon />
              </div>
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
