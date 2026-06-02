"use client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect } from "react";
import { useAppDispatch } from "../../store/store";
import { clearCart } from "../../store/cartSlice";

function OrderSuccessContent() {
  const dispatch = useAppDispatch();
  const params = useSearchParams();
  const id = params.get("id");

  useEffect(() => {
    // Safety clear: if user lands here after successful checkout, ensure cart is empty.
    dispatch(clearCart());
  }, [dispatch]);

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center px-6">
      <div className="text-center max-w-md mx-auto">
        <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-8 border border-emerald-100">
          <svg className="w-12 h-12 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h1 className="font-serif text-4xl text-[#5C0828] mb-4">Order Placed!</h1>
        <p className="text-[#7A8C85] text-sm leading-relaxed mb-2">
          Thank you for your purchase. Your order has been confirmed and payment received.
        </p>
        {id && <p className="text-[10px] font-black uppercase tracking-widest text-[#B8975A] mb-8">Order ID: {id.slice(-12).toUpperCase()}</p>}
        <p className="text-xs text-[#7A8C85] mb-8">You will receive a confirmation shortly. Our team will process your order and update you on the delivery status.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/products"
            className="px-8 py-4 bg-[#5C0828] text-white rounded-full text-[10px] font-black uppercase tracking-[0.3em] hover:bg-[#B8975A] transition-all">
            Continue Shopping
          </Link>
          <Link href="/"
            className="px-8 py-4 border border-[#EDEAE4] rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-[#7A8C85] hover:text-[#5C0828] transition-colors">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense>
      <OrderSuccessContent />
    </Suspense>
  );
}
