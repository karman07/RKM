'use client';

import { useAppSelector } from '../../store/store';
import ProductCard from '../../components/ProductCard';
import { FadeIn } from '../../components/FadeIn';
import Link from 'next/link';
import { THEME } from '../constants';

import { useEffect, useState } from 'react';

export default function WishlistPage() {
  const wishlistItems = useAppSelector(state => state.wishlist.items);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="min-h-screen bg-[#F7F5F0]" />;

  return (
    <div className="min-h-screen bg-[#F7F5F0] py-24 px-6 md:px-12">
      <div className="max-w-[1440px] mx-auto">
        <FadeIn delay={0}>
          <div className="flex flex-col md:flex-row items-center justify-between mb-16 gap-8 text-center md:text-left">
            <div className="space-y-4">
              <div className="flex items-center justify-center md:justify-start gap-4">
                <span className="w-12 h-[1px] bg-[#B8975A]" />
                <span className="uppercase tracking-[0.6em] text-[10px] font-black text-[#B8975A]">
                  My Private Selection
                </span>
              </div>
              <h1 className="font-serif text-5xl md:text-7xl text-[#1A2E26] leading-none">
                Wishlist
              </h1>
              <p className="text-[11px] uppercase tracking-[0.4em] text-[#7A8C85] font-bold opacity-60">
                {wishlistItems.length} {wishlistItems.length === 1 ? 'Exquisite Piece' : 'Exquisite Pieces'} Saved
              </p>
            </div>

            <Link
              href="/products"
              className="px-10 py-5 bg-[#1A2E26] text-white text-[10px] uppercase tracking-[0.4em] font-black hover:bg-[#B8975A] transition-all duration-700 shadow-xl"
            >
              Continue Exploring
            </Link>
          </div>
        </FadeIn>

        {wishlistItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-y-24 gap-x-12">
            {wishlistItems.map((product, index) => (
              <ProductCard key={product._id} product={product} index={index} />
            ))}
          </div>
        ) : (
          <FadeIn delay={200}>
            <div className="py-40 text-center space-y-8">
              <div className="flex justify-center">
                <div className="w-24 h-24 rounded-full bg-[#B8975A]/5 flex items-center justify-center">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#B8975A" strokeWidth="1" className="opacity-40">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-serif text-3xl text-[#1A2E26]">Your heart is still open.</h3>
                <p className="text-[#7A8C85] max-w-sm mx-auto text-sm leading-relaxed font-light">
                  Explore our collections to find a piece that speaks to your soul. Every masterpiece begins with a single look.
                </p>
              </div>
              <Link
                href="/products"
                className="inline-block text-[10px] uppercase tracking-[0.5em] font-black text-[#B8975A] border-b border-[#B8975A]/40 pb-2 hover:border-[#B8975A] transition-all"
              >
                View Collections
              </Link>
            </div>
          </FadeIn>
        )}
      </div>
    </div>
  );
}
