"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Home, LayoutGrid, ShoppingBag, Heart, User } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../store/store";
import { openAuthDialog } from "../store/authSlice";
import CartDrawer from "./CartDrawer";

const GOLD = "#B8975A";

export default function BottomNav() {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const authState = useAppSelector((state) => state.auth);
  const cartCount = useAppSelector((state) =>
    state.cart.items.reduce((acc, item) => acc + item.quantity, 0)
  );
  const wishlistCount = useAppSelector((state) => state.wishlist.items.length);
  const [cartOpen, setCartOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />

      <nav
        className="fixed bottom-0 left-0 w-full z-40 lg:hidden bg-white/98 backdrop-blur-xl border-t border-[#EDEAE4] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-stretch justify-around h-16">
          <NavItem href="/" label="Home" active={isActive("/")}>
            <Home size={21} strokeWidth={isActive("/") ? 2.3 : 1.7} />
          </NavItem>

          <NavItem href="/products" label="Shop" active={isActive("/products")}>
            <LayoutGrid size={21} strokeWidth={isActive("/products") ? 2.3 : 1.7} />
          </NavItem>

          <button
            onClick={() => setCartOpen(true)}
            aria-label="Shopping Bag"
            className="relative flex flex-col items-center justify-center gap-1 flex-1 transition-colors duration-200 text-[#1A1A1A]/60 active:text-[#B8975A]"
          >
            <div className="relative">
              <ShoppingBag size={21} strokeWidth={1.7} />
              {cartCount > 0 && (
                <span
                  style={{ backgroundColor: GOLD }}
                  className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-[3px] text-white text-[8.5px] font-black rounded-full flex items-center justify-center"
                >
                  {cartCount}
                </span>
              )}
            </div>
            <span className="text-[9px] font-bold tracking-wide">Cart</span>
          </button>

          <NavItem href="/wishlist" label="Wishlist" active={isActive("/wishlist")}>
            <div className="relative">
              <Heart size={21} strokeWidth={isActive("/wishlist") ? 2.3 : 1.7} />
              {wishlistCount > 0 && (
                <span
                  style={{ backgroundColor: GOLD }}
                  className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-[3px] text-white text-[8.5px] font-black rounded-full flex items-center justify-center"
                >
                  {wishlistCount}
                </span>
              )}
            </div>
          </NavItem>

          {authState.token ? (
            <NavItem href="/profile" label="Account" active={isActive("/profile")}>
              <User size={21} strokeWidth={isActive("/profile") ? 2.3 : 1.7} />
            </NavItem>
          ) : (
            <button
              onClick={() => dispatch(openAuthDialog())}
              aria-label="Sign In"
              className="flex flex-col items-center justify-center gap-1 flex-1 transition-colors duration-200 text-[#1A1A1A]/60 active:text-[#B8975A]"
            >
              <User size={21} strokeWidth={1.7} />
              <span className="text-[9px] font-bold tracking-wide">Account</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}

function NavItem({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-1 flex-1 transition-colors duration-200"
      style={{ color: active ? GOLD : "rgba(26,26,26,0.6)" }}
    >
      {children}
      <span className="text-[9px] font-bold tracking-wide">{label}</span>
    </Link>
  );
}
