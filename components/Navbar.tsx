"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { API_BASE_URL } from "../app/constants";
import { SearchIcon, BagIcon, HeartIcon } from "./Icons";
import Link from "next/link";
import CartDrawer from "./CartDrawer";
import { useAppSelector } from "../store/store";

interface Lookup {
  _id: string;
  lookup_type: string;
  label: string;
  value: string;
  is_active?: boolean;
}

interface SearchProduct {
  _id: string;
  name: string;
  sku: string;
  images: string[];
  metal_type?: string;
  purity?: string;
  description?: string;
  category_id?: { _id: string; name: string; slug: string };
  pricing_breakdown?: { final_price: number };
}

const CUSTOMER_LOOKUP_TYPES = new Set([
  "gender",
  "occasion",
  "metal_type",
  "metal_color",
  "stone_type",
  "purity",
]);

const LOOKUP_LABELS: Record<string, string> = {
  gender: "By Gender",
  occasion: "By Occasion",
  metal_type: "Metal",
  metal_color: "Metal Color",
  stone_type: "Stones",
  purity: "Purity",
};

const GOLD = "#B8975A";

export default function Navbar() {
  const pathname = usePathname();
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const wishlistCount = useAppSelector((state) => state.wishlist.items.length);

  const handleOpenCart = () => {
    console.log("Opening Cart Drawer...");
    setCartDrawerOpen(true);
  };
  const cartCount = useAppSelector((state) => state.cart.items.reduce((acc, item) => acc + item.quantity, 0));
  const isHomePage = pathname === "/";
  const [isScrolled, setIsScrolled] = useState(!isHomePage);
  const [lookups, setLookups] = useState<Record<string, Lookup[]>>({});
  const [mounted, setMounted] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const shopRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [allProducts, setAllProducts] = useState<SearchProduct[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [liveResults, setLiveResults] = useState<SearchProduct[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [isBagBumping, setIsBagBumping] = useState(false);

  useEffect(() => {
    if (cartCount === 0) return;
    setIsBagBumping(true);
    const timer = setTimeout(() => setIsBagBumping(false), 400);
    return () => clearTimeout(timer);
  }, [cartCount]);

  useEffect(() => {
    setMounted(true);

    fetch(`${API_BASE_URL}/lookups`)
      .then((r) => r.json())
      .then((data: Record<string, Lookup[]>) => {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          const filtered: Record<string, Lookup[]> = {};
          for (const [type, items] of Object.entries(data)) {
            if (CUSTOMER_LOOKUP_TYPES.has(type)) {
              const active = items.filter((l) => l.is_active !== false);
              if (active.length > 0) filtered[type] = active;
            }
          }
          setLookups(filtered);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!isHomePage) {
      setIsScrolled(true);
      return;
    }
    const onScroll = () => setIsScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHomePage]);

  // Close mega-menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (shopRef.current && !shopRef.current.contains(e.target as Node))
        setShopOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Fetch products once when the overlay opens
  useEffect(() => {
    if (searchOpen && !productsLoaded) {
      fetch(`${API_BASE_URL}/products?limit=200`)
        .then((r) => r.json())
        .then((data) => {
          const items: SearchProduct[] = Array.isArray(data)
            ? data
            : Array.isArray(data?.data)
            ? data.data
            : [];
          setAllProducts(items);
          setProductsLoaded(true);
        })
        .catch(console.error);
    }
    if (!searchOpen) {
      setSearchValue("");
      setLiveResults([]);
      setLiveLoading(false);
    }
  }, [searchOpen, productsLoaded]);

  // Debounced live-filter
  useEffect(() => {
    const q = searchValue.trim();
    if (q.length < 2) {
      setLiveResults([]);
      setLiveLoading(false);
      return;
    }
    setLiveLoading(true);
    const timer = setTimeout(() => {
      const terms = q.toLowerCase().split(/\s+/);
      const results = allProducts
        .filter((p) => {
          const haystack = [
            p.name,
            p.sku,
            p.description,
            p.metal_type,
            p.purity,
            p.category_id?.name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return terms.every((t) => haystack.includes(t));
        })
        .slice(0, 8);
      setLiveResults(results);
      setLiveLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchValue, allProducts]);

  // Close everything on route change
  useEffect(() => {
    setShopOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  const solid = isScrolled || !isHomePage;
  const bg = solid ? "rgba(255,255,255,0.98)" : "transparent";
  const textCol = solid ? "#1A1A1A" : "#FFFFFF";
  const borderCol = solid ? "rgba(184,151,90,0.18)" : "transparent";
  const lookupEntries = Object.entries(lookups);
  const cols = Math.min(lookupEntries.length, 4);

  return (
    <>
      <CartDrawer 
        isOpen={cartDrawerOpen} 
        onClose={() => setCartDrawerOpen(false)} 
      />

      {/* ── Full-screen search overlay ── */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-[200] flex flex-col overflow-y-auto"
          style={{ backgroundColor: "rgba(8,10,9,0.94)", backdropFilter: "blur(28px) saturate(1.4)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSearchOpen(false);
          }}
        >
          {/* Top bar: label + close */}
          <div className="flex items-center justify-between px-5 sm:px-8 lg:px-16 pt-5 sm:pt-8 pb-4 sm:pb-6 flex-shrink-0">
            <p style={{ color: GOLD, letterSpacing: "0.38em" }} className="text-[7.5px] font-black uppercase">
              Search Fine Jewellery
            </p>
            <button
              onClick={() => setSearchOpen(false)}
              className="text-white/30 hover:text-white transition-colors duration-200 p-1.5"
              aria-label="Close search"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search input */}
          <div className="px-5 sm:px-8 lg:px-16">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const q = searchValue.trim();
                router.push(q ? `/products?search=${encodeURIComponent(q)}` : "/products");
                setSearchOpen(false);
              }}
            >
              <div className="flex items-center gap-3 sm:gap-5 border-b-2 border-white/10 focus-within:border-[#B8975A] transition-colors duration-500 pb-4 sm:pb-5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.7" strokeLinecap="round" className="flex-shrink-0 sm:w-[22px] sm:h-[22px]">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Rings, gold, diamonds…"
                  className="flex-1 min-w-0 bg-transparent text-white text-[22px] sm:text-[28px] lg:text-[36px] font-extralight placeholder-white/15 focus:outline-none caret-[#B8975A] tracking-[-0.01em]"
                  autoFocus
                />
                {searchValue && (
                  <button
                    type="button"
                    onClick={() => setSearchValue("")}
                    className="text-white/20 hover:text-white/60 transition-colors p-1 flex-shrink-0"
                    aria-label="Clear"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {/* Desktop search button — inline */}
                <button
                  type="submit"
                  className="hidden sm:flex flex-shrink-0 px-7 py-3 text-white text-[8.5px] font-black uppercase tracking-[0.38em] transition-all duration-300 hover:opacity-90 rounded-full"
                  style={{ backgroundColor: GOLD }}
                >
                  Search
                </button>
              </div>

              {/* Mobile: full-width search button */}
              <button
                type="submit"
                className="sm:hidden mt-4 w-full py-4 text-white text-[9px] font-black uppercase tracking-[0.38em] transition-opacity active:opacity-70 rounded-full"
                style={{ backgroundColor: GOLD }}
              >
                Search
              </button>

              <p className="hidden sm:block mt-3 text-white/15 text-[8px] uppercase tracking-[0.35em]">
                Enter to search · ESC to close
              </p>
            </form>
          </div>

          {/* ── Live results ── */}
          <div className="px-5 sm:px-8 lg:px-16 mt-8 sm:mt-10 pb-12 sm:pb-16 flex-1">
            {/* Loading shimmer */}
            {liveLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4">
                {[0,1,2,3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-square bg-white/5 mb-3" />
                    <div className="h-2.5 bg-white/5 rounded mb-2 w-3/4" />
                    <div className="h-2 bg-white/5 rounded w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {/* Results grid */}
            {!liveLoading && liveResults.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-5 sm:mb-6">
                  <p className="text-white/25 text-[8px] uppercase tracking-[0.38em]">
                    {liveResults.length} Piece{liveResults.length !== 1 ? "s" : ""} Found
                  </p>
                  <Link
                    href={`/products?search=${encodeURIComponent(searchValue.trim())}`}
                    onClick={() => setSearchOpen(false)}
                    style={{ color: GOLD }}
                    className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.25em] hover:gap-3 transition-all duration-300"
                  >
                    View All
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4">
                  {liveResults.map((product) => {
                    const img =
                      product.images?.length > 0
                        ? product.images[0].startsWith("http")
                          ? product.images[0]
                          : `${API_BASE_URL.replace("/api", "")}${
                              product.images[0].startsWith("/static")
                                ? product.images[0]
                                : "/static" + product.images[0]
                            }`
                        : "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=600&auto=format&fit=crop";
                    return (
                      <Link
                        key={product._id}
                        href={`/products/${product._id}`}
                        onClick={() => setSearchOpen(false)}
                        className="group block active:opacity-70 transition-opacity"
                      >
                        {/* Image */}
                        <div
                          className="aspect-square overflow-hidden mb-2.5 sm:mb-3 relative"
                          style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                        >
                          <img
                            src={img}
                            alt={product.name}
                            className="w-full h-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-110"
                          />
                          <div
                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                            style={{ background: `linear-gradient(135deg, ${GOLD}18 0%, transparent 60%)` }}
                          />
                        </div>
                        {/* Info */}
                        <p className="text-white/80 text-[10px] sm:text-[11px] font-medium leading-snug truncate group-hover:text-[#B8975A] transition-colors duration-300">
                          {product.name}
                        </p>
                        {(product.metal_type || product.purity) && (
                          <p className="text-white/25 text-[8px] uppercase tracking-[0.14em] mt-1 truncate hidden sm:block">
                            {[product.metal_type, product.purity].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {product.pricing_breakdown?.final_price ? (
                          <p style={{ color: GOLD }} className="text-[9.5px] sm:text-[10px] font-bold mt-1 sm:mt-1.5">
                            ₹{product.pricing_breakdown.final_price.toLocaleString("en-IN")}
                          </p>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </>
            )}

            {/* No results */}
            {!liveLoading && searchValue.trim().length >= 2 && liveResults.length === 0 && (
              <div className="flex flex-col items-start gap-3">
                <p className="text-white/25 text-[13px] sm:text-[15px] font-light">
                  No pieces found for{" "}
                  <span style={{ color: GOLD }} className="font-medium">&ldquo;{searchValue}&rdquo;</span>
                </p>
                <Link
                  href="/products"
                  onClick={() => setSearchOpen(false)}
                  style={{ color: GOLD }}
                  className="text-[8px] font-black uppercase tracking-[0.3em] hover:opacity-70 transition-opacity"
                >
                  Browse All Jewellery →
                </Link>
              </div>
            )}

            {/* Quick browse — shown only when not typing */}
            {!searchValue.trim() && lookupEntries.length > 0 && (
              <div>
                <p className="text-white/20 text-[8px] uppercase tracking-[0.38em] mb-4 sm:mb-5">Quick Browse</p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/products"
                    onClick={() => { setSearchOpen(false); }}
                    style={{ borderColor: `${GOLD}45`, color: GOLD }}
                    className="px-4 py-2 sm:px-5 sm:py-2.5 border text-[8.5px] font-bold uppercase tracking-[0.22em] hover:bg-white/5 active:bg-white/5 transition-colors rounded-full"
                  >
                    All Jewellery
                  </Link>
                  {lookupEntries.slice(0, 3).flatMap(([type, items]) =>
                    items.slice(0, 3).map((item) => (
                      <Link
                        key={item._id}
                        href={`/products?${type}=${item.value}`}
                        onClick={() => { setSearchOpen(false); }}
                        className="px-4 py-2 sm:px-5 sm:py-2.5 border border-white/10 text-[8.5px] font-bold uppercase tracking-[0.22em] text-white/35 hover:border-white/25 hover:text-white/70 active:text-white/70 transition-all rounded-full"
                      >
                        {item.label}
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main Navbar ── */}
      <nav
        style={{ backgroundColor: bg, borderBottomColor: borderCol, color: textCol }}
        className={`fixed top-0 left-0 w-full z-50 border-b transition-all duration-700 ease-in-out ${
          solid ? "shadow-[0_2px_20px_rgba(0,0,0,0.07)] backdrop-blur-xl" : ""
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 h-[70px] flex items-center gap-8">
          {/* ── Logo ── */}
          <Link href="/" className="flex-shrink-0 flex flex-col leading-none group">
            <span
              style={{ color: textCol }}
              className="font-serif text-[28px] tracking-[-0.04em] uppercase font-semibold group-hover:opacity-70 transition-opacity duration-500"
            >
              RKM
            </span>
            <span
              style={{ color: GOLD, letterSpacing: "0.24em" }}
              className="text-[7px] font-semibold uppercase -mt-0.5"
            >
              Fine Jewellery
            </span>
          </Link>

          {/* ── Desktop Nav ── */}
          <div className="hidden lg:flex items-center gap-1 flex-1 justify-center">
            <NavLink href="/" color={textCol}>Home</NavLink>
            
            {/* ── Shop By mega-menu ── */}
            {lookupEntries.length > 0 && (
              <div ref={shopRef} className="relative">
                <button
                  onClick={() => setShopOpen((v) => !v)}
                  style={{ color: textCol }}
                  className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-black tracking-[0.32em] uppercase whitespace-nowrap hover:opacity-55 transition-opacity duration-300"
                >
                  Shop By
                  <svg
                    width="8" height="8" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2.5"
                    className={`transition-transform duration-300 ${shopOpen ? "rotate-180" : ""}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {/* Mega-dropdown panel */}
                {shopOpen && (
                  <div
                    style={{ borderTopColor: GOLD, minWidth: `${Math.max(cols * 170, 480)}px` }}
                    className="absolute top-[calc(100%+10px)] left-1/2 -translate-x-1/2 bg-white border-t-2 shadow-[0_24px_64px_rgba(0,0,0,0.13)] z-50 animate-in fade-in slide-in-from-top-1 duration-200"
                  >
                    <div
                      className="grid gap-0 p-8 divide-x divide-[#EDEAE4]"
                      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
                    >
                      {lookupEntries.map(([type, items]) => (
                        <div key={type} className="px-6 first:pl-0 last:pr-0">
                          <p
                            style={{ color: GOLD, letterSpacing: "0.28em" }}
                            className="text-[8.5px] font-black uppercase mb-4 pb-2 border-b border-[#F0EBE0]"
                          >
                            {LOOKUP_LABELS[type] ?? type.replace(/_/g, " ")}
                          </p>
                          <div className="flex flex-col gap-2">
                            {items.map((item) => (
                              <Link
                                key={item._id}
                                href={`/products?${type}=${item.value}`}
                                onClick={() => setShopOpen(false)}
                                className="text-[11.5px] font-medium text-[#3A3A3A] hover:text-[#B8975A] transition-colors duration-250 tracking-wide group flex items-center gap-1.5"
                              >
                                <span className="w-0 group-hover:w-2 h-[1px] bg-[#B8975A] transition-all duration-300 inline-block flex-shrink-0" />
                                {item.label}
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Footer strip */}
                    <div className="border-t border-[#EDEAE4] bg-[#FAFAF8] px-8 py-4 flex items-center justify-between">
                      <p className="text-[9px] text-[#999] tracking-[0.25em] uppercase">
                        Browse the full collection
                      </p>
                      <Link
                        href="/products"
                        onClick={() => setShopOpen(false)}
                        style={{ color: GOLD }}
                        className="text-[9.5px] font-black tracking-[0.25em] uppercase flex items-center gap-2 hover:gap-3.5 transition-all duration-300"
                      >
                        View All
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            <NavLink href="/about" color={textCol}>Our Story</NavLink>
            <NavLink href="/blogs" color={textCol}>Blogs</NavLink>
            <NavLink href="/terms" color={textCol}>Terms</NavLink>
            <NavLink href="/privacy" color={textCol}>Privacy</NavLink>
          </div>

          {/* ── Actions ── */}
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto lg:ml-0">
            <button
              aria-label="Search"
              style={{ color: textCol }}
              onClick={() => setSearchOpen(true)}
              className="p-2.5 rounded-full hover:bg-black/[0.05] transition-colors duration-300"
            >
              <SearchIcon />
            </button>

            <Link
              href="/wishlist"
              aria-label="Wishlist"
              style={{ color: textCol }}
              className="relative p-2.5 rounded-full hover:bg-black/[0.05] transition-colors duration-300"
            >
              <HeartIcon />
              {mounted && wishlistCount > 0 && (
                <span
                  style={{ backgroundColor: GOLD }}
                  className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-white text-[7px] font-black rounded-full flex items-center justify-center"
                >
                  {wishlistCount}
                </span>
              )}
            </Link>

            <button
              onClick={handleOpenCart}
              aria-label="Shopping Bag"
              style={{ color: textCol }}
              className={`relative p-2.5 rounded-full hover:bg-black/[0.05] transition-all duration-300 ${isBagBumping ? 'scale-125 text-[#B8975A]' : ''}`}
            >
              <div className={`${isBagBumping ? 'animate-bounce' : ''}`}>
                <BagIcon />
              </div>
              {mounted && cartCount > 0 && (
                <span
                  style={{ backgroundColor: GOLD }}
                  className={`absolute top-1.5 right-1.5 w-3.5 h-3.5 text-white text-[7px] font-black rounded-full flex items-center justify-center transition-transform duration-300 ${isBagBumping ? 'scale-125' : ''}`}
                >
                  {cartCount}
                </span>
              )}
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              style={{ color: textCol }}
              className="lg:hidden p-2.5 ml-1 rounded-full hover:bg-black/[0.05] transition-colors duration-300"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                {mobileOpen ? (
                  <>
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </>
                ) : (
                  <>
                    <path d="M4 6h16" />
                    <path d="M4 12h10" />
                    <path d="M4 18h16" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* ── Mobile Drawer ─────────────────────────────────────────── */}
        {mobileOpen && (
          <div className="lg:hidden bg-white border-t border-[#EDEAE4] shadow-2xl">
            <div className="px-6 py-5 space-y-0 max-h-[80vh] overflow-y-auto">
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between py-4 text-[11px] font-black tracking-[0.28em] uppercase text-[#1A1A1A] hover:text-[#B8975A] border-b border-[#F2EEE8] transition-colors"
              >
                Home
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </Link>
              <Link
                href="/blogs"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between py-4 text-[11px] font-black tracking-[0.28em] uppercase text-[#1A1A1A] hover:text-[#B8975A] border-b border-[#F2EEE8] transition-colors"
              >
                Blogs
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </Link>
              {lookupEntries.map(([type, items]) => (
                <div key={type} className="py-4 border-b border-[#F2EEE8]">
                  <p
                    style={{ color: GOLD, letterSpacing: "0.3em" }}
                    className="text-[8.5px] font-black uppercase mb-3"
                  >
                    {LOOKUP_LABELS[type] ?? type.replace(/_/g, " ")}
                  </p>
                      <div className="flex flex-wrap gap-2">
                        {items.map((item) => (
                          <Link
                            key={item._id}
                            href={`/products?${type}=${item.value}`}
                            className="text-[10px] font-semibold text-[#4A4A4A] hover:text-[#B8975A] px-4 py-2 rounded-full border border-[#E5E0D8] hover:border-[#B8975A] transition-all duration-200"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                </div>
              ))}

              <Link
                href="/about"
                className="flex items-center justify-between py-4 text-[11px] font-black tracking-[0.28em] uppercase text-[#1A1A1A] hover:text-[#B8975A] border-b border-[#F2EEE8] transition-colors"
              >
                Our Story
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </Link>

              {/* Legal – mobile */}
              <div className="flex items-center gap-6 pt-5 pb-1">
                <Link
                  href="/terms"
                  style={{ color: GOLD }}
                  className="text-[9px] font-bold tracking-[0.25em] uppercase hover:opacity-70 transition-opacity"
                >
                  Terms &amp; Conditions
                </Link>
                <Link
                  href="/privacy"
                  style={{ color: GOLD }}
                  className="text-[9px] font-bold tracking-[0.25em] uppercase hover:opacity-70 transition-opacity"
                >
                  Privacy Policy
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>
    </>
  );
}

/* ── Helper components ─────────────────────────────────────────────── */

function NavLink({
  href,
  children,
  color,
  small = false,
}: {
  href: string;
  children: React.ReactNode;
  color: string;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{ color }}
      className={`relative py-2 whitespace-nowrap group hover:opacity-55 transition-opacity duration-300 uppercase ${
        small
          ? "px-2 text-[8.5px] font-bold tracking-[0.22em] opacity-60 hover:opacity-100"
          : "px-4 text-[10px] font-black tracking-[0.32em]"
      }`}
    >
      {children}
      {!small && (
        <span
          style={{ backgroundColor: GOLD }}
          className="absolute bottom-1 left-4 right-4 h-[1px] scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left opacity-60"
        />
      )}
    </Link>
  );
}

function IconBtn({
  children,
  label,
  color,
}: {
  children: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <button
      aria-label={label}
      style={{ color }}
      className="p-2.5 rounded-full hover:bg-black/[0.05] transition-colors duration-300"
    >
      {children}
    </button>
  );
}
