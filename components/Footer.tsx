"use client";

import { useEffect, useState } from "react";
import { THEME, API_BASE_URL } from "../app/constants";
import Link from "next/link";

interface Category {
  _id: string;
  name: string;
  slug: string;
}

interface Lookup {
  _id: string;
  lookup_type: string;
  label: string;
  value: string;
}

export default function Footer() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [lookups, setLookups] = useState<Record<string, Lookup[]>>({});

  useEffect(() => {
    fetch(`${API_BASE_URL}/categories`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCategories(data.slice(0, 8));
      });

    fetch(`${API_BASE_URL}/lookups`)
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setLookups(data);
        } else if (Array.isArray(data)) {
          const grouped = data.reduce((acc, item) => {
            if (!acc[item.lookup_type]) acc[item.lookup_type] = [];
            acc[item.lookup_type].push(item);
            return acc;
          }, {} as Record<string, Lookup[]>);
          setLookups(grouped);
        }
      });
  }, []);

  const socialLinks = [
    { name: "Instagram", href: "https://instagram.com", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg> },
    { name: "Facebook", href: "https://facebook.com", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg> },
    { name: "LinkedIn", href: "https://linkedin.com", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg> }
  ];

  return (
    <footer style={{ backgroundColor: THEME.colors.primaryDark, color: THEME.colors.textLight }} className="pt-24 pb-12 px-6 lg:px-12">
      <div className="max-w-[1440px] mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-12 mb-24">
        {/* Brand Column */}
        <div className="col-span-2 md:col-span-3 lg:col-span-2 pr-12">
          <h2 className="font-serif text-3xl tracking-[0.2em] uppercase mb-8" style={{ color: THEME.colors.secondary }}>
            RKM Jewellers
          </h2>
          <p className="opacity-60 text-[11px] uppercase tracking-[0.3em] leading-[2.2] mb-10 text-balance">
            A trusted legacy in Mohali & Chandigarh, specializing in handcrafted 22K Hallmarked gold and certified diamond jewellery. Combining traditional Punjabi artistry with modern elegance for your most precious moments.
          </p>
          <div className="flex gap-4">
            {socialLinks.map((social) => (
              <a 
                key={social.name}
                href={social.href} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-[#B8975A] hover:border-[#B8975A] transition-all duration-300 group"
              >
                <div className="group-hover:scale-110 transition-transform">{social.icon}</div>
              </a>
            ))}
          </div>
        </div>

        {/* Collections */}
        <div>
          <h5 className="uppercase tracking-[0.4em] text-[9px] font-black mb-8 opacity-40">Categories</h5>
          <div className="flex flex-col gap-4">
            {categories.map((cat) => (
              <Link key={cat._id} href={`/products?category=${cat.slug}`} className="text-[10px] font-bold uppercase tracking-[0.2em] hover:text-[#B8975A] transition-colors">{cat.name}</Link>
            ))}
          </div>
        </div>

        {/* Metal Lookups */}
        <div>
          <h5 className="uppercase tracking-[0.4em] text-[9px] font-black mb-8 opacity-40">Metal</h5>
          <div className="flex flex-col gap-4">
            {lookups['metal_type']?.slice(0, 6).map((item) => (
              <Link key={item._id} href={`/products?metal_type=${item.value}`} className="text-[10px] font-bold uppercase tracking-[0.2em] hover:text-[#B8975A] transition-colors">{item.label}</Link>
            ))}
          </div>
        </div>

        {/* Occasion Lookups */}
        <div>
          <h5 className="uppercase tracking-[0.4em] text-[9px] font-black mb-8 opacity-40">Occasion</h5>
          <div className="flex flex-col gap-4">
            {lookups['occasion']?.slice(0, 6).map((item) => (
              <Link key={item._id} href={`/products?occasion=${item.value}`} className="text-[10px] font-bold uppercase tracking-[0.2em] hover:text-[#B8975A] transition-colors">{item.label}</Link>
            ))}
          </div>
        </div>

        {/* Contact & Maison */}
        <div>
          <h5 className="uppercase tracking-[0.4em] text-[9px] font-black mb-8 opacity-40">Maison</h5>
          <div className="flex flex-col gap-4">
            <Link href="/" className="text-[10px] font-bold uppercase tracking-[0.2em] hover:text-[#B8975A] transition-colors">Home</Link>
            <Link href="/products" className="text-[10px] font-bold uppercase tracking-[0.2em] hover:text-[#B8975A] transition-colors">Fine Collections</Link>
            <Link href="/about" className="text-[10px] font-bold uppercase tracking-[0.2em] hover:text-[#B8975A] transition-colors">The RKM Story</Link>
            <Link href="/blogs" className="text-[10px] font-bold uppercase tracking-[0.2em] hover:text-[#B8975A] transition-colors">Artisan Journal</Link>
            <Link href="/wishlist" className="text-[10px] font-bold uppercase tracking-[0.2em] hover:text-[#B8975A] transition-colors">Wishlist</Link>
            <address className="not-italic opacity-50 text-[9px] leading-loose mt-4 uppercase tracking-[0.3em] font-medium transition-opacity hover:opacity-100">
              Phase 3B2, Mohali<br/>Punjab 160059<br/>Serving Chandigarh & Tri-city
            </address>
          </div>
        </div>
      </div>

      {/* SEO Footer Text */}
      <div className="max-w-[1440px] mx-auto mb-16 opacity-30 text-[8px] uppercase tracking-[0.2em] leading-relaxed text-center lg:text-left">
        <p>RKM Jewellers: Your trusted destination for 22K Hallmarked Gold, Certified Diamonds, and Customized Bridal Jewellery in Mohali, Chandigarh, Panchkula, and Punjab. Experience the blend of traditional artistry and modern elegance.</p>
      </div>

      <div className="max-w-[1440px] mx-auto border-t pt-8 flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] uppercase tracking-[0.1em] opacity-40 font-bold" style={{ borderColor: '#ffffff10' }}>
        <p>&copy; {new Date().getFullYear()} RKM Jewellers Mohali. Empowering Elegance Every Day.</p>
        <div className="flex gap-10">
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
        </div>
      </div>
    </footer>
  );
}
