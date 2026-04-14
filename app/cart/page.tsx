"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../store/store";
import { removeFromCart, updateQuantity } from "../../store/cartSlice";
import { API_BASE_URL, THEME } from "../../app/constants";
import { trackEvent } from "../../app/analytics";
import Link from "next/link";
import { FadeIn } from "../../components/FadeIn";

const GOLD = "#B8975A";

export default function CartPage() {
  const [mounted, setMounted] = useState(false);
  const cartItems = useAppSelector((state) => state.cart.items);
  const dispatch = useAppDispatch();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const subtotal = cartItems.reduce((acc, item) => acc + (item.pricing_breakdown?.final_price || 0) * item.quantity, 0);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-32 pb-24">
        {/* Header */}
        <div className="mb-16">
          <h1 className="font-serif text-5xl md:text-6xl text-[#1A2E26] mb-4">Your Shopping Bag</h1>
          <p className="text-[10px] uppercase tracking-[0.4em] text-[#7A8C85]">
            {cartItems.length} {cartItems.length === 1 ? 'Exquisite Piece' : 'Exquisite Pieces'} Ready for Acquisition
          </p>
        </div>

        {cartItems.length === 0 ? (
          <FadeIn delay={200}>
            <div className="text-center py-32 space-y-8">
              <div className="font-serif text-3xl text-[#1A2E26] opacity-30 italic">Your bag is currently empty</div>
              <Link
                href="/products"
                style={{ backgroundColor: GOLD }}
                className="inline-block px-12 py-5 text-white text-[10px] font-black uppercase tracking-[0.4em] hover:bg-[#1A2E26] transition-all duration-700 rounded-full"
              >
                Discover the Collections
              </Link>
            </div>
          </FadeIn>
        ) : (
          <div className="flex flex-col lg:flex-row gap-20 items-start">
            {/* Items List */}
            <div className="w-full lg:w-2/3 space-y-12">
              {cartItems.map((item, idx) => {
                const imageUrl = item.images && item.images.length > 0
                  ? (item.images[0].startsWith('http')
                    ? item.images[0]
                    : `${API_BASE_URL.replace('/api', '')}${item.images[0].startsWith('/static') ? item.images[0] : '/static' + item.images[0]}`)
                  : "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1500&auto=format&fit=crop";

                return (
                  <FadeIn key={item._id} delay={idx * 100}>
                    <div className="flex gap-8 group">
                      <div className="w-40 aspect-[3/4] overflow-hidden bg-[#F8F8F8] rounded-xl">
                        <img src={imageUrl} alt={item.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" />
                      </div>
                      <div className="flex-1 flex flex-col justify-between py-2">
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-serif text-2xl text-[#1A2E26] mb-1">{item.name}</h3>
                              <p className="text-[8px] uppercase tracking-widest text-[#7A8C85]">SKU: {item.sku}</p>
                            </div>
                            <button
                              onClick={() => dispatch(removeFromCart(item._id))}
                              className="text-[9px] uppercase tracking-widest text-[#B8975A] border-b border-transparent hover:border-[#B8975A] transition-all"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-[#1A2E26]/60">
                            <span>{item.purity} Gold</span>
                            <span className="w-1 h-1 bg-[#B8975A]/20 rounded-full" />
                            <span>{item.net_weight}g</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-end">
                          <div className="flex items-center border border-[#F0EBE0] p-1 rounded-full px-2">
                            <button
                              onClick={() => dispatch(updateQuantity({ id: item._id, quantity: item.quantity - 1 }))}
                              className="w-10 h-10 flex items-center justify-center text-lg hover:bg-[#F9F9F9] rounded-full"
                            >
                              -
                            </button>
                            <span className="w-10 text-center font-serif">{item.quantity}</span>
                            <button
                              onClick={() => {
                                dispatch(updateQuantity({ id: item._id, quantity: item.quantity + 1 }));
                                trackEvent('add_to_cart', { id: item._id, productName: item.name });
                              }}
                              className="w-10 h-10 flex items-center justify-center text-lg hover:bg-[#F9F9F9] rounded-full"
                            >
                              +
                            </button>
                          </div>
                          <p className="font-serif text-2xl text-[#1A2E26]">
                            ₹{(((item.pricing_breakdown?.final_price || 0) - (item.pricing_breakdown?.tax_amount || 0)) * item.quantity).toLocaleString('en-IN')}
                            <span className="text-[8px] uppercase tracking-tighter ml-1 opacity-50">Excl. Tax</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </FadeIn>
                );
              })}
            </div>

            {/* Summary Box */}
            <div className="w-full lg:w-1/3 bg-[#FAFAF8] border border-[#F0EBE0] p-12 space-y-10 lg:sticky lg:top-32 rounded-3xl">
              <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-[#B8975A] border-b border-[#F0EBE0] pb-6">Order Summary</h2>

              <div className="space-y-6">
                <div className="flex justify-between text-[11px] uppercase tracking-widest font-bold text-[#1A2E26]/60">
                  <span>Subtotal (Excl. Tax)</span>
                  <span>₹{cartItems.reduce((acc, item) => acc + ((item.pricing_breakdown?.final_price || 0) - (item.pricing_breakdown?.tax_amount || 0)) * item.quantity, 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-[11px] uppercase tracking-widest font-bold text-[#1A2E26]/60">
                  <span>Estimated Tax (GST)</span>
                  <span>₹{cartItems.reduce((acc, item) => acc + (item.pricing_breakdown?.tax_amount || 0) * item.quantity, 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-[11px] uppercase tracking-widest font-bold text-[#1A2E26]/60">
                  <span>Standard Concierge Shipping</span>
                  <span className="text-[#064E3B]">Complimentary</span>
                </div>
              </div>

              <div className="border-t border-[#F0EBE0] pt-8 flex justify-between items-baseline">
                <span className="font-serif text-2xl text-[#1A2E26]">Estimated Total</span>
                <span className="font-serif text-4xl text-[#B8975A]">₹{cartItems.reduce((acc, item) => acc + (item.pricing_breakdown?.final_price || 0) * item.quantity, 0).toLocaleString('en-IN')}</span>
              </div>

              <button
                className="w-full bg-[#1A2E26] text-white py-6 text-[10px] font-black uppercase tracking-[0.5em] hover:bg-[#B8975A] transition-all duration-700 shadow-xl rounded-full"
              >
                Proceed to Checkout
              </button>

              <div className="pt-4 space-y-4">
                <p className="text-[8px] uppercase tracking-[0.2em] text-[#7A8C85] leading-loose text-center">
                  Secure checkout powered by RKM International Assurance.
                  Shipments are fully insured until delivery.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
