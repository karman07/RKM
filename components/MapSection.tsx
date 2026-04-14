"use client";

import { THEME } from "../app/constants";
import { FadeIn } from "./FadeIn";

export default function MapSection() {
  return (
    <section className="py-24 px-6 bg-white overflow-hidden">
      <div className="max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Text Content */}
          <div className="order-2 lg:order-1">
            <FadeIn delay={0}>
              <span className="uppercase tracking-[0.4em] text-[10px] font-black text-[#B8975A] mb-6 block">Visit Our Maison</span>
              <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl text-[#1A2E26] mb-8 leading-[1.1]">The Art of Perfection, Located in Punjab</h2>
              <div className="space-y-8">
                <div className="flex gap-6">
                  <div className="w-10 h-10 rounded-full bg-[#1A2E26]/5 flex items-center justify-center flex-shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B8975A" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-[#1A2E26] mb-2">Flagship Boutique</h4>
                    <p className="text-sm text-[#7A8C85] leading-relaxed">
                      QP23+643, Jujhar Nagar, Near 39 West,<br/>Chandigarh, Punjab 160014
                    </p>
                  </div>
                </div>

                <div className="flex gap-6">
                  <div className="w-10 h-10 rounded-full bg-[#1A2E26]/5 flex items-center justify-center flex-shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B8975A" strokeWidth="2"><path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07L19.07 4.93"/></svg>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-[#1A2E26] mb-2">Bespoke Experience</h4>
                    <p className="text-sm text-[#7A8C85] leading-relaxed">
                      Experience our handcrafted collections in person. Our master consultants are ready to assist you in finding your next heirloom.
                    </p>
                  </div>
                </div>

                <div className="pt-8">
                  <a 
                    href="https://www.google.com/maps/dir//RKM+Jewellers,+QP23%2B643,+Jujhar+Nagar,+Chandigarh,+Punjab+160014/@30.7505583,76.7027982,15z" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-4 bg-[#1A2E26] text-white px-8 py-5 text-[9px] font-black uppercase tracking-[0.4em] rounded-full hover:bg-[#B8975A] transition-all duration-700 shadow-xl"
                  >
                    Get Directions
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </a>
                </div>
              </div>
            </FadeIn>
          </div>

          {/* Interactive Map */}
          <div className="order-1 lg:order-2">
            <FadeIn delay={200}>
              <div className="relative group">
                <div className="absolute -inset-4 bg-[#B8975A]/10 rounded-3xl blur-2xl group-hover:bg-[#B8975A]/20 transition-all duration-700" />
                <div className="relative aspect-square md:aspect-[4/3] w-full rounded-2xl overflow-hidden shadow-2xl border border-[#F0EBE0]">
                  <iframe 
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3430.41846467!2d76.7027982!3d30.7505583!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390fefe7d6e75627%3A0x3ea8b5d8509fb2ec!2sRKM%20Jewellers!5e0!3m2!1sen!2sin!4v1713000000000!5m2!1sen!2sin"
                    width="100%" 
                    height="100%" 
                    style={{ border: 0 }} 
                    allowFullScreen 
                    loading="lazy" 
                    referrerPolicy="no-referrer-when-downgrade"
                    className="grayscale-[0.4] group-hover:grayscale-0 transition-all duration-700"
                  />
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>
    </section>
  );
}
