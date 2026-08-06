"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../app/constants";
import { FadeIn } from "./FadeIn";

interface Branch {
  _id: string;
  name: string;
  address: string;
  phone: string;
  city?: string;
  state?: string;
  pincode?: string;
  is_active: boolean;
}

function fullAddress(b: Branch) {
  return [b.address, b.pincode].filter(Boolean).join(", ");
}

export default function MapSection() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState<Branch | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/branches`)
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        // Corporate/back-office branches aren't shopping destinations — exclude them from
        // "visit our showroom" messaging so customers aren't directed to a non-retail address.
        const active = data.filter((b: Branch) => b.is_active && !/office|corporate/i.test(b.name));
        setBranches(active);
        setSelected(active[0] ?? null);
      })
      .catch(() => {});
  }, []);

  if (branches.length === 0) return null;

  const mapQuery = selected ? encodeURIComponent(`RKM Jewellers, ${fullAddress(selected)}`) : "";

  return (
    <section id="visit" className="py-24 px-6 bg-white overflow-hidden">
      <div className="max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Text Content */}
          <div className="order-2 lg:order-1">
            <FadeIn delay={0}>
              <span className="uppercase tracking-[0.4em] text-[10px] font-black text-[#B8975A] mb-6 block">Visit Our Maison</span>
              <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl text-[#5C0828] mb-8 leading-[1.1]">
                {branches.length > 1 ? "Our Locations Across Punjab" : "The Art of Perfection, Located in Punjab"}
              </h2>
              <div className="space-y-6">
                {branches.map((b) => (
                  <button
                    key={b._id}
                    type="button"
                    onClick={() => setSelected(b)}
                    className={`w-full flex gap-6 text-left rounded-2xl p-4 -m-4 transition-all duration-300 ${selected?._id === b._id ? "bg-[#5C0828]/[0.04]" : "hover:bg-[#5C0828]/[0.02]"}`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${selected?._id === b._id ? "bg-[#5C0828]" : "bg-[#5C0828]/5"}`}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={selected?._id === b._id ? "#fff" : "#B8975A"} strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-[#5C0828] mb-2">{b.name}</h4>
                      <p className="text-sm text-[#7A8C85] leading-relaxed">{fullAddress(b)}</p>
                      <p className="text-sm text-[#7A8C85] leading-relaxed mt-1">{b.phone}</p>
                    </div>
                  </button>
                ))}

                <div className="pt-4">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-4 bg-[#5C0828] text-white px-8 py-5 text-[9px] font-black uppercase tracking-[0.4em] rounded-full hover:bg-[#B8975A] transition-all duration-700 shadow-xl"
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
                  {selected && (
                    <iframe
                      key={selected._id}
                      src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      allowFullScreen
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      className="grayscale-[0.4] group-hover:grayscale-0 transition-all duration-700"
                    />
                  )}
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>
    </section>
  );
}
