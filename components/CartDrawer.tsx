"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../store/store";
import { removeFromCart, updateQuantity } from "../store/cartSlice";
import { API_BASE_URL } from "../app/constants";
import Link from "next/link";

const GOLD = "#B8975A";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const cartItems = useAppSelector((state) => state.cart.items);
  const dispatch = useAppDispatch();

  useEffect(() => {
    setMounted(true);
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!mounted) return null;

  const subtotal = cartItems.reduce(
    (acc, item) =>
      acc +
      ((item.pricing_breakdown?.final_price || 0) - (item.pricing_breakdown?.tax_amount || 0)) *
        item.quantity,
    0
  );

  const total = cartItems.reduce(
    (acc, item) => acc + (item.pricing_breakdown?.final_price || 0) * item.quantity,
    0
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] transition-opacity duration-700 ease-in-out ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer Canvas */}
      <div
        className={`fixed inset-y-0 right-0 z-[70] w-full max-w-[480px] bg-white shadow-2xl transition-transform duration-700 ease-in-out flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-10 border-b border-[#F0EBE0]/60">
          <div>
            <h2 className="font-serif text-3xl text-[#1A2E26]">Shopping Bag</h2>
            <p className="text-[9px] uppercase tracking-[0.3em] text-[#7A8C85] mt-2">
              {cartItems.length} Piece{cartItems.length !== 1 && "s"} Selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="group flex flex-col items-center gap-1.5 transition-all duration-500 hover:scale-110"
          >
            <div className="w-9 h-9 rounded-full border border-[#F0EBE0] flex items-center justify-center group-hover:bg-[#B8975A] group-hover:border-[#B8975A] transition-all duration-500 ease-out group-hover:rotate-90">
              <svg 
                width="14" height="14" viewBox="0 0 24 24" fill="none" 
                stroke="currentColor" strokeWidth="2.5" 
                className="group-hover:text-white transition-colors duration-500"
                style={{ color: '#1A2E26'}}
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </div>
            <span className="text-[7px] font-black uppercase tracking-[0.4em] text-[#7A8C85] group-hover:text-[#B8975A] transition-all duration-500">Close</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar">
          {cartItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-8">
              <div className="font-serif text-2xl text-[#1A2E26] opacity-30 italic">
                Your bag is currently empty
              </div>
              <button
                onClick={onClose}
                style={{ backgroundColor: GOLD }}
                className="px-10 py-4 text-white text-[9px] font-black uppercase tracking-[0.4em] rounded-full hover:bg-[#1A2E26] transition-all duration-500 shadow-lg"
              >
                Continue Exploring
              </button>
            </div>
          ) : (
            <div className="space-y-10">
              {cartItems.map((item) => {
                const imageUrl =
                  item.images && item.images.length > 0
                    ? item.images[0].startsWith("http")
                      ? item.images[0]
                      : `${API_BASE_URL.replace("/api", "")}${
                          item.images[0].startsWith("/static")
                            ? item.images[0]
                            : "/static" + item.images[0]
                        }`
                    : "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1500&auto=format&fit=crop";

                return (
                  <div key={item._id} className="flex gap-6 group">
                    <div className="w-24 aspect-[3/4] overflow-hidden bg-[#F8F8F8] rounded-lg border border-[#F0EBE0]/40">
                      <img
                        src={imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-110"
                      />
                    </div>
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div>
                        <div className="flex justify-between items-start">
                          <h3 className="font-serif text-lg text-[#1A2E26] leading-tight mb-2">
                            {item.name}
                          </h3>
                          <button
                            onClick={() => dispatch(removeFromCart(item._id))}
                            className="text-[#B8975A] opacity-40 hover:opacity-100 transition-opacity"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <p className="text-[8px] uppercase tracking-widest text-[#7A8C85]">
                          {item.purity} Gold • {item.net_weight}g
                        </p>
                      </div>

                      <div className="flex justify-between items-end mt-4">
                        <div className="flex items-center border border-[#F0EBE0]/60 p-0.5 rounded-full">
                          <button
                            onClick={() =>
                              dispatch(updateQuantity({ id: item._id, quantity: item.quantity - 1 }))
                            }
                            className="w-7 h-7 flex items-center justify-center text-xs hover:bg-[#F9F9F9] rounded-full transition-colors"
                          >
                            -
                          </button>
                          <span className="w-6 text-center text-[11px] font-serif">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              dispatch(updateQuantity({ id: item._id, quantity: item.quantity + 1 }))
                            }
                            className="w-7 h-7 flex items-center justify-center text-xs hover:bg-[#F9F9F9] rounded-full transition-colors"
                          >
                            +
                          </button>
                        </div>
                        <p className="font-serif text-lg text-[#1A2E26]">
                          ₹
                          {(
                            ((item.pricing_breakdown?.final_price || 0) -
                              (item.pricing_breakdown?.tax_amount || 0)) *
                            item.quantity
                          ).toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer / Summary */}
        {cartItems.length > 0 && (
          <div className="bg-[#FAFAF8] border-t border-[#F0EBE0] px-10 py-8 space-y-5">
            <div className="space-y-3">
              <div className="flex justify-between text-[9px] uppercase tracking-[0.2em] font-black text-[#1A2E26]/60">
                <span>Subtotal (Excl. Tax)</span>
                <span>₹{subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-[9px] uppercase tracking-[0.2em] font-black text-[#7A8C85]">
                <span>Shipping</span>
                <span>Complimentary</span>
              </div>
            </div>

            <div className="flex justify-between items-baseline py-3 border-t border-[#F0EBE0]/60">
              <span className="font-serif text-xl text-[#1A2E26]">Total</span>
              <span className="font-serif text-3xl text-[#B8975A]">
                ₹{total.toLocaleString("en-IN")}
              </span>
            </div>

            <div className="space-y-2">
              <Link
                href="/checkout"
                onClick={onClose}
                className="block w-full bg-[#1A2E26] text-white py-4.5 text-[9px] font-black uppercase tracking-[0.4em] text-center hover:bg-[#B8975A] transition-all duration-700 shadow-xl rounded-full"
              >
                Proceed to Checkout
              </Link>
              <Link
                href="/cart"
                onClick={onClose}
                className="block w-full py-2.5 text-[8px] font-black uppercase tracking-[0.3em] text-center text-[#7A8C85] hover:text-[#1A2E26] transition-colors"
              >
                View Full Detailed Bag
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
