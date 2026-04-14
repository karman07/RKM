"use client";

import { THEME } from "../app/constants";
import { FadeIn } from "./FadeIn";

export default function Newsletter() {
  return (
    <section className="py-32 px-6" style={{ backgroundColor: THEME.colors.primaryDark, color: THEME.colors.textLight }}>
      <div className="max-w-4xl mx-auto text-center">
        <FadeIn delay={0}>
          <div className="space-y-4 mb-12">
            <span className="uppercase tracking-[0.4em] text-[10px] font-black" style={{ color: THEME.colors.secondary }}>Keep In Touch</span>
            <h3 className="font-serif text-4xl md:text-6xl font-light">Join The Inner Circle</h3>
            <p className="text-sm md:text-base opacity-70 font-light leading-relaxed max-w-xl mx-auto italic">
              Subscribe for exclusive access to newest collections, private sales, and behind-the-scenes insights.
            </p>
          </div>
          
          <form className="max-w-md mx-auto relative group">
            <input 
              type="email" 
              placeholder="Enter your email address" 
              className="w-full bg-transparent border-b border-white/20 outline-none py-4 px-0 text-sm placeholder:text-white/30 focus:border-white transition-all duration-700 font-light italic"
            />
            <button 
              type="button"
              className="absolute right-0 bottom-4 uppercase tracking-[0.3em] text-[10px] font-black hover:text-[#B8975A] transition-colors"
            >
              Subscribe
            </button>
            <div className="absolute bottom-0 left-0 h-[1px] bg-white scale-x-0 group-focus-within:scale-x-100 transition-transform duration-700 origin-left" />
          </form>
        </FadeIn>
      </div>
    </section>
  );
}
