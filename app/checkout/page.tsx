"use client";

import { useState } from "react";
import { useAppSelector } from "../../store/store";
import { THEME, API_BASE_URL } from "../constants";
import { FadeIn } from "../../components/FadeIn";
import Link from "next/link";
import { trackEvent } from "../analytics";
import { useEffect } from "react";

const GOLD = "#B8975A";

export default function CheckoutPage() {
  const cartItems = useAppSelector((state) => state.cart.items);
  const [step, setStep] = useState(1); // 1: Info, 2: Shipping, 3: Payment
  
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

  useEffect(() => {
    trackEvent('begin_checkout', { 
      itemCount: cartItems.length, 
      totalValue: total 
    });
  }, []);

  const handlePlaceOrder = () => {
    trackEvent('purchase', {
      totalValue: total,
      itemCount: cartItems.length,
      items: cartItems.map(item => ({ id: item._id, name: item.name, price: item.pricing_breakdown?.final_price }))
    });
    alert("Thank you for your order! This is a demonstration of the analytics tracking.");
  };

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]">
        <div className="text-center">
          <h2 className="font-serif text-3xl mb-6 text-[#1A2E26]">Your bag is empty</h2>
          <Link href="/products" className="text-[10px] font-black uppercase tracking-[0.3em] text-white bg-[#1A2E26] px-10 py-5 rounded-full hover:bg-[#B8975A] transition-all">
            Return to Store
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F9F8F6] pt-32 pb-24 px-6 lg:px-12">
      <div className="max-w-[1440px] mx-auto">
        <div className="flex flex-col lg:flex-row gap-20">
          
          {/* Left Side: Forms */}
          <div className="flex-1 space-y-16">
            <header>
              <nav className="flex items-center gap-4 text-[9px] font-black uppercase tracking-[0.3em] mb-10 opacity-50">
                <span className={step >= 1 ? "text-[#1A2E26]" : ""}>Information</span>
                <span className="w-8 h-[1px] bg-current opacity-20" />
                <span className={step >= 2 ? "text-[#1A2E26]" : ""}>Shipping</span>
                <span className="w-8 h-[1px] bg-current opacity-20" />
                <span className={step >= 3 ? "text-[#1A2E26]" : ""}>Payment</span>
              </nav>
              <h1 className="font-serif text-5xl text-[#1A2E26]">Checkout</h1>
            </header>

            <form className="space-y-12">
              {/* Contact Information */}
              <FadeIn delay={0}>
                <div>
                  <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#B8975A] mb-8">Contact Information</h3>
                  <div className="grid grid-cols-1 gap-6">
                    <div className="relative group">
                      <input 
                        type="email" 
                        placeholder="Email for Order Confirmation"
                        className="w-full bg-white border border-[#EDEAE4] px-6 py-5 rounded-2xl focus:outline-none focus:border-[#B8975A] transition-all duration-300 text-[13px]"
                      />
                    </div>
                  </div>
                </div>
              </FadeIn>

              {/* Shipping Address */}
              <FadeIn delay={100}>
                <div>
                  <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#B8975A] mb-8">Shipping Address</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <input 
                      type="text" 
                      placeholder="First Name"
                      className="w-full bg-white border border-[#EDEAE4] px-6 py-5 rounded-2xl focus:outline-none focus:border-[#B8975A] transition-all duration-300 text-[13px]"
                    />
                    <input 
                      type="text" 
                      placeholder="Last Name"
                      className="w-full bg-white border border-[#EDEAE4] px-6 py-5 rounded-2xl focus:outline-none focus:border-[#B8975A] transition-all duration-300 text-[13px]"
                    />
                    <input 
                      type="text" 
                      placeholder="Address Line 1"
                      className="col-span-1 md:col-span-2 w-full bg-white border border-[#EDEAE4] px-6 py-5 rounded-2xl focus:outline-none focus:border-[#B8975A] transition-all duration-300 text-[13px]"
                    />
                    <input 
                      type="text" 
                      placeholder="Apartment, suite, etc. (optional)"
                      className="col-span-1 md:col-span-2 w-full bg-white border border-[#EDEAE4] px-6 py-5 rounded-2xl focus:outline-none focus:border-[#B8975A] transition-all duration-300 text-[13px]"
                    />
                    <input 
                      type="text" 
                      placeholder="City"
                      className="w-full bg-white border border-[#EDEAE4] px-6 py-5 rounded-2xl focus:outline-none focus:border-[#B8975A] transition-all duration-300 text-[13px]"
                    />
                    <select className="w-full bg-white border border-[#EDEAE4] px-6 py-5 rounded-2xl focus:outline-none focus:border-[#B8975A] transition-all duration-300 text-[13px] appearance-none">
                      <option>Punjab</option>
                      <option>Chandigarh</option>
                      <option>Haryana</option>
                      <option>Delhi</option>
                    </select>
                    <input 
                      type="text" 
                      placeholder="Postal Code"
                      className="w-full bg-white border border-[#EDEAE4] px-6 py-5 rounded-2xl focus:outline-none focus:border-[#B8975A] transition-all duration-300 text-[13px]"
                    />
                    <input 
                      type="tel" 
                      placeholder="Phone for Delivery"
                      className="w-full bg-white border border-[#EDEAE4] px-6 py-5 rounded-2xl focus:outline-none focus:border-[#B8975A] transition-all duration-300 text-[13px]"
                    />
                  </div>
                </div>
              </FadeIn>

              {/* Payment (Placeholder) */}
              <FadeIn delay={200}>
                <div>
                  <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#B8975A] mb-8">Payment Method</h3>
                  <div className="bg-white border border-[#EDEAE4] rounded-[2rem] p-8 opacity-60 italic text-center text-sm">
                    Strategic payment gateways (Razorpay/Stripe) will be integrated in the next phase.
                  </div>
                </div>
              </FadeIn>

              <div className="pt-10 flex flex-col md:flex-row gap-6">
                <button 
                  type="button" 
                  onClick={handlePlaceOrder}
                  className="bg-[#1A2E26] text-white px-12 py-6 rounded-full text-[10px] font-black uppercase tracking-[0.4em] hover:bg-[#B8975A] transition-all duration-500 shadow-2xl flex-1"
                >
                  Place Your Artisan Order
                </button>
                <Link 
                  href="/cart"
                  className="px-12 py-6 text-[9px] font-black uppercase tracking-[0.3em] text-[#7A8C85] hover:text-[#1A2E26] transition-colors flex items-center justify-center"
                >
                  Return to Bag
                </Link>
              </div>
            </form>
          </div>

          {/* Right Side: Order Summary */}
          <div className="lg:w-[450px]">
            <aside className="bg-white border border-[#EDEAE4] rounded-[3rem] p-10 lg:sticky lg:top-32 shadow-sm">
              <h2 className="font-serif text-3xl text-[#1A2E26] mb-10">Order Summary</h2>
              
              <div className="space-y-8 max-h-[40vh] overflow-y-auto pr-4 custom-scrollbar mb-10">
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
                    <div key={item._id} className="flex gap-6 items-center">
                      <div className="w-16 h-20 bg-[#F9F8F6] rounded-xl overflow-hidden flex-shrink-0 border border-[#EDEAE4]/40">
                        <img src={imageUrl} className="w-full h-full object-cover" alt={item.name} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-serif text-[15px] text-[#1A2E26] leading-tight mb-1">{item.name}</h4>
                        <p className="text-[8px] uppercase tracking-widest text-[#7A8C85]">{item.quantity} x ₹{((item.pricing_breakdown?.final_price || 0) - (item.pricing_breakdown?.tax_amount || 0)).toLocaleString("en-IN")}</p>
                      </div>
                      <div className="font-serif text-[15px] text-[#1A2E26]">
                        ₹{(((item.pricing_breakdown?.final_price || 0) - (item.pricing_breakdown?.tax_amount || 0)) * item.quantity).toLocaleString("en-IN")}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-[#F0EBE0] pt-10 space-y-5">
                <div className="flex justify-between text-[10px] uppercase tracking-[0.2em] font-black text-[#7A8C85]">
                  <span>Subtotal (Excl. Tax)</span>
                  <span>₹{subtotal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] uppercase tracking-[0.2em] font-black">
                  <span className="text-[#7A8C85]">Standard Concierge Shipping</span>
                  <span className="text-[#059669]">Complimentary</span>
                </div>
                <div className="flex justify-between items-baseline pt-5 border-t border-[#F0EBE0]">
                  <span className="font-serif text-2xl text-[#1A2E26]">Total</span>
                  <div className="text-right">
                    <span className="font-serif text-4xl text-[#B8975A]">₹{total.toLocaleString("en-IN")}</span>
                    <p className="text-[7px] uppercase tracking-[0.3em] text-[#7A8C85] mt-1">Inclusive of all taxes</p>
                  </div>
                </div>
              </div>

              <div className="mt-12 bg-[#FAFAF8] rounded-2xl p-6 border border-[#EDEAE4]/60">
                <p className="text-[8px] uppercase tracking-[0.2em] leading-relaxed text-[#7A8C85]">
                  Your purchase will be shipped with **BIS Hallmarked Purity Certification** and **Certified Diamond Authentication**. All shipments are fully insured.
                </p>
              </div>
            </aside>
          </div>

        </div>
      </div>
    </main>
  );
}
