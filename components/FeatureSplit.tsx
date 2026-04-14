"use client";

import { THEME } from "../app/constants";
import { FadeIn } from "./FadeIn";
import { SparklesIcon } from "./Icons";

export default function FeatureSplit() {
  return (
    <section 
      style={{ 
        backgroundColor: THEME.colors.surfaceAlt, 
        borderColor: THEME.colors.border 
      }} 
      className="relative overflow-hidden border-y"
    >
      <div className="flex flex-col md:flex-row min-h-[80vh]">
        <div className="w-full md:w-1/2 p-12 md:p-24 lg:p-32 flex flex-col justify-center">
          <FadeIn delay={0} direction="left">
            <span className="uppercase tracking-[0.3em] font-semibold text-xs mb-8 flex items-center gap-3" style={{ color: THEME.colors.primaryLight }}>
              <SparklesIcon />
              Ethical Sourcing
            </span>
            <h3 className="font-serif text-4xl md:text-5xl lg:text-6xl mb-8 leading-[1.15]" style={{ color: THEME.colors.primaryDark }}>
              Beyond Beautiful. <br /> Consistently Conscious.
            </h3>
            <p className="text-lg leading-relaxed mb-12 max-w-xl opacity-80" style={{ color: THEME.colors.text }}>
              Our deep forest emeralds and brilliant cut diamonds are traced from mine to market. 
              We combine generations of artisanal craftsmanship with a rigorous commitment 
              to transparency, delivering pieces that are meant to be passed down.
            </p>
            
            <div>
              <button 
                style={{ borderColor: THEME.colors.primary, color: THEME.colors.primary }}
                className="px-10 py-5 border uppercase tracking-[0.2em] text-xs font-semibold hover:bg-[#064E3B] hover:text-white transition-all duration-500"
              >
                Discover Our Ethics
              </button>
            </div>
          </FadeIn>
        </div>
        
        <div className="w-full md:w-1/2 h-[60vh] md:h-auto min-h-[600px] relative bg-[#FAFAF9]">
          <img 
            src="/aboutus.png"
            alt="The Artisan Workspace"
            className="absolute inset-0 w-full h-full object-cover grayscale-[0.2] hover:grayscale-0 transition-all duration-[2s] ease-out"
          />
        </div>
      </div>
    </section>
  );
}
