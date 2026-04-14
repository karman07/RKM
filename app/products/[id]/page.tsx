"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { THEME, API_BASE_URL } from "../../constants";
import { FadeIn } from "../../../components/FadeIn";
import { BagIcon, SparklesIcon } from "../../../components/Icons";
import Link from "next/link";
import { useAppDispatch, useAppSelector } from "../../../store/store";
import { addToCart, updateQuantity } from "../../../store/cartSlice";
import { trackEvent } from "../../analytics";

interface Product {
  _id: string;
  name: string;
  sku: string;
  description?: string;
  images: string[];
  net_weight: number;
  gross_weight: number;
  stone_weight?: number;
  metal_type: string;
  purity: string;
  metal_color: string;
  hallmark_number?: string;
  collection_name?: string;
  occasion?: string;
  gender?: string;
  ring_size?: string;
  dimensions?: string;
  stone_type?: string;
  pricing_breakdown?: {
    metal_price: number;
    making_charges: number;
    stone_price: number;
    tax_amount: number;
    final_price: number;
  };
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const dispatch = useAppDispatch();
  const cartItems = useAppSelector((state) => state.cart.items);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [added, setAdded] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!id) return;

    async function fetchProduct() {
      try {
        const res = await fetch(`${API_BASE_URL}/products/${id}`);
        const data = await res.json();
        setProduct(data);
      } catch (error) {
        console.error("Error fetching product details:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProduct();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0]">
        <div className="text-[10px] uppercase tracking-[0.4em] animate-pulse opacity-50">Revealing Brilliance...</div>
      </div>
    );
  }

  if (!product) {
    return (
       <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F5F0] gap-8">
         <div className="font-serif text-3xl">Product Not Found</div>
         <Link href="/" className="text-[10px] uppercase tracking-widest border-b border-black pb-1">Return to HOME</Link>
       </div>
    );
  }

  const imageUrls = product.images.map(img => 
    img.startsWith('http') 
      ? img 
      : `${API_BASE_URL.replace('/api', '')}${img.startsWith('/static') ? img : '/static' + img}`
  );

  if (imageUrls.length === 0) {
    imageUrls.push("https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1500&auto=format&fit=crop");
  }

  const description = product.description || "";
  const displayDescription = isExpanded ? description : (description.length > 180 ? description.substring(0, 180) + "..." : description);

  const handleAddToCart = () => {
    if (product) {
      dispatch(addToCart(product as any));
      trackEvent('add_to_cart', { id: product._id, productName: product.name });
      setAdded(true);
      setTimeout(() => setAdded(false), 2200);
    }
  };

  const cartQty = product
    ? cartItems.find((i) => i._id === product._id)?.quantity ?? 0
    : 0;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[1440px] mx-auto px-5 sm:px-6 lg:px-12 pt-20 sm:pt-24 pb-12 sm:pb-16">
        {/* Simplified Breadcrumbs */}
        <nav className="mb-8 sm:mb-10 flex items-center gap-2 sm:gap-3 text-[8px] font-bold uppercase tracking-[0.3em] text-[#7A8C85] overflow-x-auto scrollbar-none">
          <Link href="/" className="flex-shrink-0 hover:text-[#B8975A] transition-colors">HOME</Link>
          <span className="opacity-30 flex-shrink-0">/</span>
          <Link href="/products" className="flex-shrink-0 hover:text-[#B8975A] transition-colors">PRODUCTS</Link>
          <span className="opacity-30 flex-shrink-0">/</span>
          <span className="text-[#1A2E26] truncate">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 xl:gap-20 items-start">
          {/* Left: Gallery (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <FadeIn delay={0}>
              <div className="relative bg-[#FAFAFA] aspect-[4/5] overflow-hidden shadow-sm shadow-[#1A2E26]/5 rounded-3xl">
                <img 
                  src={imageUrls[selectedImage]} 
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-[2s] hover:scale-105"
                />
              </div>
            </FadeIn>
            
            {imageUrls.length > 1 && (
              <div className="grid grid-cols-5 gap-2 sm:gap-4">
                {imageUrls.map((url, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(idx)}
                    className={`relative aspect-square bg-[#FAFAFA] overflow-hidden transition-all duration-500 rounded-lg sm:rounded-xl ${selectedImage === idx ? 'ring-2 ring-[#B8975A]' : 'opacity-60 hover:opacity-100'}`}
                  >
                    <img src={url} alt={`${product.name} shadow ${idx}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Consolidated Info (5 cols) */}
          <div className="lg:col-span-5 space-y-12">
            <FadeIn delay={200}>
              <div className="space-y-10">
                {/* Product Header */}
                <div className="space-y-6">
                  <div className="space-y-2">
                    <span className="text-[9px] uppercase font-black tracking-[0.4em] text-[#B8975A]">
                      {product.collection_name || 'Signature Series'}
                    </span>
                    <h1 className="font-serif text-4xl sm:text-5xl xl:text-6xl text-[#1A2E26] leading-[1.1]">
                      {product.name}
                    </h1>
                  </div>
                  
                  <div className="flex items-baseline justify-between pt-2 border-t border-[#F0EDEA]">
                    <div className="space-y-0.5">
                      <span className="text-[8px] uppercase tracking-[0.2em] font-bold text-[#7A8C85] opacity-50">Investment (Excl. Tax)</span>
                      <p className="font-serif text-4xl text-[#1A2E26]">
                        ₹{((product.pricing_breakdown?.final_price || 0) - (product.pricing_breakdown?.tax_amount || 0)).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] uppercase tracking-[0.1em] font-bold text-[#B8975A] block">Authenticity</span>
                      <span className="text-[9px] font-sans font-bold text-[#1A2E26] uppercase">SKU: {product.sku}</span>
                    </div>
                  </div>
                </div>

                {/* Acquisition Actions - Solid Premium Aesthetic */}
                <div className="pt-4">
                  {cartQty > 0 ? (
                    <FadeIn direction="none" delay={0}>
                      <div className="flex items-center w-full border-2 border-[#1A2E26] rounded-full overflow-hidden h-20 shadow-lg">
                        <button 
                          onClick={() => dispatch(updateQuantity({ id: product._id, quantity: Math.max(0, cartQty - 1) }))}
                          className="flex-1 h-full bg-[#FAFAFA] hover:bg-[#F0EEE8] text-[#1A2E26] flex items-center justify-center transition-all duration-300 group"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:scale-125 transition-transform"><path d="M5 12h14"/></svg>
                        </button>
                        <div className="flex-[2] h-full flex flex-col items-center justify-center bg-white border-x-2 border-[#1A2E26]/10">
                          <span className="text-[9px] uppercase font-black tracking-[0.3em] text-[#B8975A] mb-1">In Your Bag</span>
                          <span className="font-serif text-3xl text-[#1A2E26]">{cartQty}</span>
                        </div>
                        <button 
                          onClick={() => dispatch(updateQuantity({ id: product._id, quantity: cartQty + 1 }))}
                          className="flex-1 h-full bg-[#FAFAFA] hover:bg-[#F0EEE8] text-[#1A2E26] flex items-center justify-center transition-all duration-300 group"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:scale-125 transition-transform"><path d="M12 5v14M5 12h14"/></svg>
                        </button>
                      </div>
                    </FadeIn>
                  ) : (
                    <button
                      onClick={handleAddToCart}
                      className="w-full bg-[#1A2E26] text-white py-10 uppercase tracking-[0.6em] text-[11px] font-black transition-all duration-700 shadow-2xl flex items-center justify-center gap-4 hover:bg-[#B8975A] transform hover:-translate-y-1 active:scale-95 group rounded-full"
                    >
                      <span className="group-hover:rotate-12 transition-transform duration-500">
                        <BagIcon />
                      </span>
                      Add to Cart
                    </button>
                  )}
                </div>

                {/* Artisan Narrative */}
                {description && (
                  <div className="space-y-4 pt-4 border-t border-[#F0EDEA]">
                    <h5 className="text-[10px] uppercase tracking-[0.3em] font-black text-[#1A2E26]">Artisan Narrative</h5>
                    <p className="text-[#1A2E26]/70 leading-relaxed font-light text-xl italic tracking-wide">
                      "{description}"
                    </p>
                  </div>
                )}

                {/* Specifications Grid */}
                <div className="space-y-8 pt-4 border-t border-[#F0EDEA]">
                  <h5 className="text-[10px] uppercase tracking-[0.3em] font-black text-[#1A2E26]">Technical Essence</h5>
                  <div className="grid grid-cols-2 gap-y-6 text-[11px]">
                    <div className="space-y-1">
                      <span className="text-[#7A8C85] uppercase tracking-wider text-[9px]">Composition</span>
                      <p className="text-[#1A2E26] font-medium capitalize">{product.purity}K {product.metal_color} {product.metal_type}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[#7A8C85] uppercase tracking-wider text-[9px]">Net Weight</span>
                      <p className="text-[#1A2E26] font-medium">{product.net_weight}g</p>
                    </div>
                    {product.stone_weight !== undefined && product.stone_weight > 0 && (
                      <div className="space-y-1">
                        <span className="text-[#7A8C85] uppercase tracking-wider text-[9px]">Stone Weight</span>
                        <p className="text-[#1A2E26] font-medium">{product.stone_weight}g</p>
                      </div>
                    )}
                    <div className="space-y-1">
                      <span className="text-[#7A8C85] uppercase tracking-wider text-[9px]">Gross Weight</span>
                      <p className="text-[#1A2E26] font-medium">{product.gross_weight}g</p>
                    </div>
                    {product.hallmark_number && (
                      <div className="space-y-1">
                        <span className="text-[#7A8C85] uppercase tracking-wider text-[9px]">Hallmark</span>
                        <p className="text-[#1A2E26] font-medium">{product.hallmark_number}</p>
                      </div>
                    )}
                    {product.stone_type && (
                      <div className="space-y-1">
                        <span className="text-[#7A8C85] uppercase tracking-wider text-[9px]">Gemstone Type</span>
                        <p className="text-[#1A2E26] font-medium capitalize">{product.stone_type}</p>
                      </div>
                    )}
                    {product.dimensions && (
                      <div className="space-y-1">
                        <span className="text-[#7A8C85] uppercase tracking-wider text-[9px]">Dimensions</span>
                        <p className="text-[#1A2E26] font-medium">{product.dimensions}</p>
                      </div>
                    )}
                    {product.ring_size && (
                      <div className="space-y-1">
                        <span className="text-[#7A8C85] uppercase tracking-wider text-[9px]">Ring Size</span>
                        <p className="text-[#1A2E26] font-medium">Size {product.ring_size}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cost Breakdown */}
                {product.pricing_breakdown && (
                  <div className="space-y-5 bg-[#FAFAF8] p-6 rounded-2xl border border-[#F0EDEA]">
                    <h6 className="text-[9px] uppercase tracking-[0.2em] font-black text-[#B8975A]">Price Transparency</h6>
                    <div className="space-y-3">
                      <div className="flex justify-between text-[11px] text-[#1A2E26]/60 font-medium">
                        <span>Gold Component</span>
                        <span>₹{product.pricing_breakdown.metal_price.toLocaleString('en-IN')}</span>
                      </div>
                      {product.pricing_breakdown.stone_price > 0 && (
                        <div className="flex justify-between text-[11px] text-[#1A2E26]/60 font-medium">
                          <span>Stones / Gemwork</span>
                          <span>₹{product.pricing_breakdown.stone_price.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[11px] text-[#1A2E26]/60 font-medium">
                        <span>Artisanship</span>
                        <span>₹{product.pricing_breakdown.making_charges.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-[#1A2E26]/60 font-medium">
                        <span>Tax / GST</span>
                        <span>₹{product.pricing_breakdown.tax_amount.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Trust Signifiers */}
                <div className="pt-8 flex flex-wrap justify-between items-center gap-4 opacity-40 grayscale">
                  <div className="flex flex-col items-center gap-2">
                    <SparklesIcon />
                    <span className="text-[7px] uppercase font-black tracking-widest text-center">Ethically Sourced</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <span className="text-[7px] uppercase font-black tracking-widest text-center">Certified Origin</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="15" height="13" /><path d="M16 8l4 0l3 3l0 5l-7 0" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
                    <span className="text-[7px] uppercase font-black tracking-widest text-center">Global Assurance</span>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>
    </div>
  );
}
