"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { THEME, API_BASE_URL } from "../app/constants";
import { FadeIn } from "./FadeIn";
import { useAppDispatch, useAppSelector } from "../store/store";
import { toggleWishlist } from "../store/wishlistSlice";
import { addToCart, updateQuantity } from "../store/cartSlice";
import { trackEvent } from "../app/analytics";

interface Product {
  _id: string;
  name: string;
  sku: string;
  images: string[];
  net_weight: number;
  metal_type: string;
  purity: string;
  description?: string;
  pricing_breakdown?: {
    final_price: number;
    tax_amount?: number;
  };
}

interface ProductCardProps {
  product: Product;
  index: number;
  badge?: string;
}

export default function ProductCard({ product, index, badge }: ProductCardProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const wishlistItems = useAppSelector(state => state.wishlist.items);
  const cartItems = useAppSelector(state => state.cart.items);
  const isWishlisted = wishlistItems.some(item => item._id === product._id);
  const cartItem = cartItems.find(item => item._id === product._id);

  const imageUrl = product.images && product.images.length > 0 
    ? (product.images[0].startsWith('http') 
        ? product.images[0] 
        : `${API_BASE_URL.replace('/api', '')}${product.images[0].startsWith('/static') ? product.images[0] : '/static' + product.images[0]}`)
    : "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1500&auto=format&fit=crop";

  const handleCardClick = () => {
    trackEvent('view_product', { productId: product._id, productName: product.name, sku: product.sku });
    router.push(`/products/${product._id}`);
  };

  return (
    <div 
      key={product._id} 
      onClick={handleCardClick}
      className="group cursor-pointer block relative"
    >
      <FadeIn delay={index * 150}>
        <div className="relative overflow-hidden mb-8 aspect-[3/4] bg-[#F8F8F8] shadow-sm transition-all duration-700 group-hover:shadow-2xl rounded-2xl">
          {/* Subtle Badge */}
          {badge && (
            <div className="absolute top-0 left-0 z-20 px-4 py-2 bg-[#0D1B15] text-[#D4B07A] text-[8px] font-bold uppercase tracking-[0.4em] rounded-br-2xl">
              {badge}
            </div>
          )}

          {/* Luxury Zoom Image */}
          <div className="w-full h-full transition-all duration-[1.5s] ease-out">
            <img 
              src={imageUrl}
              alt={product.name}
              className="w-full h-full object-cover transition-transform duration-[2.5s] ease-out group-hover:scale-105"
            />
          </div>
          
          {/* Elegant Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"/>
          
          <div className="absolute bottom-4 lg:bottom-8 left-0 right-0 px-2 lg:px-4 translate-y-0 lg:translate-y-[120%] lg:group-hover:translate-y-0 transition-all duration-700 ease-[cubic-bezier(0.2,1,0.3,1)] flex gap-2">
            <Link 
              href={`/products/${product._id}`}
              onClick={(e) => e.stopPropagation()}
              className="group/btn flex-1 py-3 lg:py-4 bg-white text-[#0D1B15] text-[8px] lg:text-[9px] uppercase tracking-[0.2em] lg:tracking-[0.4em] font-bold shadow-2xl hover:bg-[#B8975A] hover:text-white transition-all duration-500 text-center rounded-full hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
            >
              Explore
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                className="w-0 opacity-0 group-hover/btn:w-3 group-hover/btn:opacity-100 transition-all duration-300"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
            {cartItem ? (
              <div className="flex-[1.2] flex items-center bg-[#0D1B15] rounded-full overflow-hidden shadow-2xl hover:scale-105 active:scale-95 transition-all duration-500" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dispatch(updateQuantity({ id: product._id, quantity: cartItem.quantity - 1 }));
                  }}
                  className="flex-1 h-full text-white hover:bg-[#B8975A] transition-colors flex items-center justify-center border-r border-white/10 py-3 lg:py-4"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14"/></svg>
                </button>
                <div className="flex-1 h-full flex flex-col items-center justify-center bg-[#0D1B15] border-x border-white/5 py-3 lg:py-4">
                  <span className="text-white text-[10px] lg:text-[11px] font-bold">{cartItem.quantity}</span>
                </div>
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dispatch(updateQuantity({ id: product._id, quantity: cartItem.quantity + 1 }));
                    trackEvent('add_to_cart', { id: product._id, productName: product.name });
                  }}
                  className="flex-1 h-full text-white hover:bg-[#B8975A] transition-colors flex items-center justify-center border-l border-white/10 py-3 lg:py-4"
                >
                   <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              </div>
            ) : (
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  trackEvent('add_to_cart', { productId: product._id, productName: product.name, price: product.pricing_breakdown?.final_price });
                  dispatch(addToCart(product));
                }}
                className="relative overflow-hidden flex-[0.8] py-3 lg:py-4 bg-[#0D1B15] text-white text-[8px] lg:text-[9px] uppercase tracking-[0.2em] lg:tracking-[0.4em] font-bold shadow-2xl hover:bg-[#B8975A] transition-all duration-500 rounded-full hover:scale-105 active:scale-95 group/bag"
              >
                <span className="relative z-10">+ Bag</span>
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/bag:animate-shine transition-transform duration-1000" />
              </button>
            )}
          </div>

          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-20">
            <button 
              onClick={(e) => { 
                e.preventDefault(); 
                e.stopPropagation(); 
                dispatch(toggleWishlist(product));
              }}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm ${isWishlisted ? 'bg-[#B8975A] scale-110 shadow-lg' : 'bg-white/80 backdrop-blur-md hover:bg-white'}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={isWishlisted ? "white" : "none"} stroke={isWishlisted ? "white" : "#B8975A"} strokeWidth="1.2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="space-y-4 px-1">
          <div className="space-y-2">
            <div className="flex justify-between items-baseline gap-4">
              <h4 className="font-serif text-2xl tracking-wide text-[#1A2E26] leading-snug group-hover:text-[#B8975A] transition-colors duration-500 truncate">
                {product.name}
              </h4>
              <span className="font-serif text-xl font-light text-[#B8975A] whitespace-nowrap">
                ₹{((product.pricing_breakdown?.final_price || 0) - (product.pricing_breakdown?.tax_amount || 0)).toLocaleString('en-IN')}
                <span className="text-[7px] uppercase tracking-tighter ml-1 opacity-60">Excl. Tax</span>
              </span>
            </div>
            
            <div className="flex items-center gap-3 text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-[#7A8C85] group-hover:text-[#1A2E26] transition-colors duration-500">
              <span className="px-2 py-0.5 border border-[#B8975A]/20 rounded-full">{product.purity}</span>
              <span className="w-1 h-1 rounded-full bg-[#B8975A]/20" />
              <span>{product.net_weight}g Total weight</span>
            </div>

            {product.description && (
              <p className="text-[#7A8C85] text-xs leading-relaxed line-clamp-2 font-light italic">
                {product.description}
              </p>
            )}
          </div>
          
          <div className="h-[1px] w-8 group-hover:w-full transition-all duration-700 bg-gradient-to-r from-[#B8975A]/40 to-transparent" />
        </div>
      </FadeIn>
    </div>
  );
}
