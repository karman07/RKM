"use client";

import { THEME } from "../app/constants";
import { FadeIn } from "./FadeIn";
import Link from "next/link";
import ProductCard from "./ProductCard";

interface Category {
  _id: string;
  name: string;
  slug: string;
}

interface Product {
  _id: string;
  name: string;
  sku: string;
  images: string[];
  net_weight: number;
  metal_type: string;
  purity: string;
}

interface CategorySectionProps {
  category: Category;
  products: Product[];
  index: number;
}

export default function CategorySection({ category, products, index }: CategorySectionProps) {
  return (
    <div key={category._id}>
      <FadeIn delay={0}>
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-8 px-2">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="w-12 h-[1px] bg-[#B8975A]" />
              <span className="uppercase tracking-[0.5em] text-[10px] font-bold text-[#B8975A]">
                Maison Brilliance
              </span>
            </div>
            <h3 className="font-serif text-5xl md:text-7xl text-[#1A2E26] leading-none">
              {category.name}
            </h3>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#7A8C85] font-medium opacity-60">
              Discover our curated selection of fine {category.name.toLowerCase()}
            </p>
          </div>

          <Link
            href={`/products?category=${category.slug}`}
            className="group flex items-center gap-4 text-[10px] uppercase tracking-[0.4em] font-bold text-[#1A2E26] hover:text-[#B8975A] transition-all duration-500 pb-2 border-b border-[#1A2E26]/10 hover:border-[#B8975A]"
          >
            Explore All
            <div className="overflow-hidden w-6 h-3 relative">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="absolute -left-full group-hover:left-0 transition-all duration-500">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="absolute left-0 group-hover:left-full transition-all duration-500">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </Link>
        </div>
      </FadeIn>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-24 gap-x-12 px-2">
        {products.map((product, pIndex) => (
          <ProductCard key={product._id} product={product} index={pIndex} />
        ))}

        {/* Placeholder Products if none exist */}
        {products.length === 0 && (
          [1, 2, 3].map((i) => (
            <div key={i} className="group cursor-pointer opacity-20">
              <div className="relative aspect-[3/4] mb-8 overflow-hidden bg-[#F0F2F5] rounded-2xl">
                <div className="absolute inset-0 flex items-center justify-center text-[8px] uppercase tracking-[0.5em] font-bold text-[#1A2E26]">Coming Soon</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
