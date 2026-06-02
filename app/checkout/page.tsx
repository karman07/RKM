"use client";
import { useState, useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "../../store/store";
import { clearCart } from "../../store/cartSlice";
import { API_BASE_URL, STATIC_BASE_URL } from "../constants";
import Link from "next/link";
import { toast } from "sonner";

declare global { interface Window { Razorpay: any } }

const GOLD = "#B8975A";
const DARK = "#5C0828";

function staticImg(path: string) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${STATIC_BASE_URL}${path.startsWith("/static") ? path : "/static" + path}`;
}

interface DeliveryZone { min_km: number; max_km: number; charge: number; label?: string; }
interface DeliverySettings {
  store_latitude: number; store_longitude: number; free_delivery_above: number;
  zones: DeliveryZone[]; max_delivery_radius_km: number; is_delivery_enabled: boolean;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CheckoutPage() {
  const dispatch = useAppDispatch();
  const customer = useAppSelector((s) => s.auth.customer);
  const cartItems = useAppSelector((s) => s.cart.items);
  const subtotal = cartItems.reduce((acc, i) => acc + (i.pricing_breakdown?.final_price || 0) * i.quantity, 0);

  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", city: "", state: "Punjab", pincode: "", notes: "" });
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings | null>(null);
  const [loadingDelivery, setLoadingDelivery] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [outOfRange, setOutOfRange] = useState(false);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [states, setStates] = useState<string[]>(["Punjab", "Haryana", "Delhi", "Chandigarh"]);
  const [loadingStates, setLoadingStates] = useState(true);

  const total = subtotal + deliveryCharge;

  useEffect(() => {
    if (!customer) return;
    setForm((f) => ({
      ...f,
      name: customer.name || "",
      email: customer.email || "",
      phone: customer.phone || "",
    }));
  }, [customer]);

  // Load Razorpay SDK
  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => setRazorpayLoaded(true);
    document.body.appendChild(s);
  }, []);

  // Load delivery settings
  useEffect(() => {
    fetch(`${API_BASE_URL}/online-orders/delivery-settings`)
      .then(r => r.json()).then(d => setDeliverySettings(d)).catch(() => { })
      .finally(() => setLoadingDelivery(false));

    // Fetch Indian states
    fetch("https://countriesnow.space/api/v0.1/countries/states", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: "India" })
    })
      .then(r => r.json())
      .then(d => {
        if (d && d.data && d.data.states) {
          const names = d.data.states.map((s: any) => s.name).sort();
          setStates(names);
        }
      })
      .catch(() => { })
      .finally(() => setLoadingStates(false));
  }, []);

  const calcDelivery = useCallback((km: number, orderTotal: number, settings: DeliverySettings) => {
    if (orderTotal >= settings.free_delivery_above) { setDeliveryCharge(0); setOutOfRange(false); return; }
    if (km > settings.max_delivery_radius_km) { setOutOfRange(true); setDeliveryCharge(0); return; }
    setOutOfRange(false);
    const zone = settings.zones.find(z => km >= z.min_km && km < z.max_km);
    setDeliveryCharge(zone ? zone.charge : 0);
  }, []);

  useEffect(() => {
    if (coords && deliverySettings) {
      const km = haversineKm(coords.lat, coords.lng, deliverySettings.store_latitude, deliverySettings.store_longitude);
      setDistanceKm(km);
      calcDelivery(km, subtotal, deliverySettings);
    }
  }, [coords, deliverySettings, subtotal, calcDelivery]);

  function detectLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      setCoords({ lat, lng });
      // Reverse geocode using nominatim (free)
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const d = await r.json();
        const addr = d.address || {};
        
        // Find best match for state
        const detectedState = addr.state || "";
        const matchedState = states.find(s => 
          s.toLowerCase() === detectedState.toLowerCase() || 
          detectedState.toLowerCase().includes(s.toLowerCase()) ||
          s.toLowerCase().includes(detectedState.toLowerCase())
        );

        setForm(f => ({
          ...f,
          address: [addr.road, addr.suburb, addr.neighbourhood].filter(Boolean).join(", ") || f.address,
          city: addr.city || addr.town || addr.village || f.city,
          state: matchedState || addr.state || f.state,
          pincode: addr.postcode || f.pincode,
        }));
      } catch { }
      setLocating(false);
      toast.success("Location detected!");
    }, () => { setLocating(false); toast.error("Could not detect location."); });
  }

  function set(k: keyof typeof form) { return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value })); }

  async function handlePlaceOrder() {
    const required = ["name", "email", "phone", "address", "city", "pincode"] as const;
    if (required.some(k => !form[k])) { toast.error("Please fill all required fields."); return; }
    if (outOfRange) { toast.error("Sorry, we don't deliver to your location."); return; }
    if (!razorpayLoaded) { toast.error("Payment gateway loading, try again."); return; }

    setPlacing(true);
    try {
      // 1. Create order on backend
      const orderRes = await fetch(`${API_BASE_URL}/online-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: form.name, customer_email: form.email, customer_phone: form.phone,
          delivery_address: form.address, delivery_city: form.city, delivery_state: form.state,
          delivery_pincode: form.pincode, notes: form.notes,
          latitude: coords?.lat, longitude: coords?.lng, distance_km: distanceKm,
          delivery_charge: deliveryCharge, subtotal, total,
          items: cartItems.map(i => ({ product_id: i._id, name: i.name, quantity: i.quantity, price: i.pricing_breakdown?.final_price || 0, image: i.images?.[0] })),
        }),
      });
      if (!orderRes.ok) throw new Error((await orderRes.json()).message || "Order failed");
      const { order_id, razorpay_order_id, key_id } = await orderRes.json();

      // 2. Open Razorpay
      const rzp = new window.Razorpay({
        key: key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_SgRfxMd5cy2i1U',
        amount: total * 100,
        currency: "INR",
        name: "RKM Jewellers",
        description: "Online Order Payment",
        order_id: razorpay_order_id,
        prefill: { name: form.name, email: form.email, contact: form.phone },
        theme: { color: GOLD },
        handler: async (response: any) => {
          try {
            // 3. Verify payment on backend before completing checkout
            const verifyRes = await fetch(`${API_BASE_URL}/online-orders/${order_id}/verify-payment`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            if (!verifyRes.ok) {
              const err = await verifyRes.json().catch(() => ({ message: "Payment verification failed" }));
              throw new Error(err.message || "Payment verification failed");
            }

            // Verification succeeded; clear cart and continue to success screen
            dispatch(clearCart());
            toast.success("Order placed successfully!");
            window.location.href = `/order-success?id=${order_id}`;
          } catch (e: any) {
            setPlacing(false);
            toast.error(e.message || "Payment captured but verification failed. Please contact support.");
          }
        },
        modal: { ondismiss: () => { setPlacing(false); toast("Payment cancelled"); } },
      });
      rzp.open();
    } catch (e: any) { toast.error(e.message || "Something went wrong"); setPlacing(false); }
  }

  if (cartItems.length === 0) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]">
      <div className="text-center">
        <h2 className="font-serif text-3xl mb-6 text-[#5C0828]">Your bag is empty</h2>
        <Link href="/products" className="text-[10px] font-black uppercase tracking-[0.3em] text-white bg-[#5C0828] px-10 py-5 rounded-full hover:bg-[#B8975A] transition-all">Back to Store</Link>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#F9F8F6] pt-32 pb-24 px-6 lg:px-12">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-col lg:flex-row gap-16">

          {/* ── Left: Form ── */}
          <div className="flex-1 space-y-10">
            <h1 className="font-serif text-5xl text-[#5C0828]">Checkout</h1>

            {/* Contact */}
            <section className="space-y-4">
              <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#B8975A]">Contact Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  required
                  placeholder="Full Name *"
                  value={form.name}
                  readOnly
                  className="col-span-2 bg-slate-100 border border-[#EDEAE4] px-6 py-4 rounded-2xl text-sm text-slate-700 cursor-not-allowed"
                />
                <input
                  required
                  type="email"
                  placeholder="Email *"
                  value={form.email}
                  readOnly
                  className="bg-slate-100 border border-[#EDEAE4] px-6 py-4 rounded-2xl text-sm text-slate-700 cursor-not-allowed"
                />
                <input
                  required
                  type="tel"
                  placeholder="Phone *"
                  value={form.phone}
                  readOnly
                  className="bg-slate-100 border border-[#EDEAE4] px-6 py-4 rounded-2xl text-sm text-slate-700 cursor-not-allowed"
                />
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Contact details are auto-filled from your profile and cannot be edited here.
              </p>
            </section>

            {/* Delivery */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#B8975A]">Delivery Address</h2>
                <button onClick={detectLocation} disabled={locating} type="button"
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider border border-[#EDEAE4] bg-white hover:border-[#B8975A] hover:text-[#B8975A] transition-all">
                  {locating ? <span className="animate-spin">O</span> : ""} {locating ? "Detecting…" : "Use My Location"}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input required placeholder="Street Address *" value={form.address} onChange={set("address")} className="col-span-2 bg-white border border-[#EDEAE4] px-6 py-4 rounded-2xl text-sm focus:outline-none focus:border-[#B8975A] transition-all" />
                <input required placeholder="City *" value={form.city} onChange={set("city")} className="bg-white border border-[#EDEAE4] px-6 py-4 rounded-2xl text-sm focus:outline-none focus:border-[#B8975A] transition-all" />
                <select value={form.state} onChange={set("state")} className="bg-white border border-[#EDEAE4] px-6 py-4 rounded-2xl text-sm focus:outline-none focus:border-[#B8975A] transition-all appearance-none">
                  {loadingStates ? <option>Loading states...</option> : states.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input required placeholder="Pincode *" value={form.pincode} onChange={set("pincode")} className="bg-white border border-[#EDEAE4] px-6 py-4 rounded-2xl text-sm focus:outline-none focus:border-[#B8975A] transition-all" />
              </div>
              <textarea placeholder="Order notes (optional)" value={form.notes} onChange={set("notes")} rows={2}
                className="w-full bg-white border border-[#EDEAE4] px-6 py-4 rounded-2xl text-sm focus:outline-none focus:border-[#B8975A] transition-all resize-none" />

              {/* Delivery info card */}
              {distanceKm !== null && (
                <div className={`flex items-start gap-3 p-4 rounded-2xl border ${outOfRange ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
                  <div>
                    {outOfRange ? (
                      <>
                        <p className="text-sm font-black text-red-700">Outside delivery range</p>
                        <p className="text-xs text-red-600 mt-0.5">Your location is {distanceKm.toFixed(1)} km away — beyond our {deliverySettings?.max_delivery_radius_km} km limit.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-black text-emerald-700">{deliveryCharge === 0 ? "Free Delivery!" : `Delivery: ₹${deliveryCharge}`}</p>
                        <p className="text-xs text-emerald-600 mt-0.5">{distanceKm.toFixed(1)} km from store{deliveryCharge === 0 && subtotal >= (deliverySettings?.free_delivery_above || 0) ? " · Free above ₹" + (deliverySettings?.free_delivery_above?.toLocaleString("en-IN") || "") : ""}</p>
                      </>
                    )}
                  </div>
                </div>
              )}
              {loadingDelivery && <p className="text-xs text-slate-400 animate-pulse">Loading delivery options…</p>}
            </section>

            {/* Payment */}
            <section className="space-y-4">
              <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#B8975A]">Payment</h2>
              <div className="bg-white border border-[#EDEAE4] rounded-2xl p-6 flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900">Secure Payment via Razorpay</p>
                  <p className="text-xs text-slate-400 mt-0.5">Cards, UPI, Net Banking, Wallets — 100% Secure</p>
                </div>
                <div className="ml-auto flex gap-2">
                  {["VISA", "MC", "UPI"].map(m => (
                    <span key={m} className="text-[8px] font-black px-2 py-1 border border-slate-200 rounded-lg text-slate-500">{m}</span>
                  ))}
                </div>
              </div>
            </section>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button onClick={handlePlaceOrder} disabled={placing || outOfRange || loadingDelivery}
                className="flex-1 flex items-center justify-center gap-3 bg-[#5C0828] text-white px-10 py-5 rounded-full text-[11px] font-black uppercase tracking-[0.3em] hover:bg-[#B8975A] transition-all duration-500 shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed">
                {placing ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing…</> : <>Pay ₹{total.toLocaleString("en-IN")} →</>}
              </button>
              <Link href="/cart" className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-[#7A8C85] hover:text-[#5C0828] transition-colors flex items-center justify-center">
                ← Return to Bag
              </Link>
            </div>
          </div>

          {/* ── Right: Summary ── */}
          <div className="lg:w-[420px]">
            <aside className="bg-white border border-[#EDEAE4] rounded-[3rem] p-8 lg:sticky lg:top-32 shadow-sm">
              <h2 className="font-serif text-3xl text-[#5C0828] mb-8">Order Summary</h2>
              <div className="space-y-6 max-h-[35vh] overflow-y-auto pr-2 mb-8">
                {cartItems.map(item => (
                  <div key={item._id} className="flex gap-4 items-center">
                    <div className="w-14 h-18 bg-[#F9F8F6] rounded-xl overflow-hidden flex-shrink-0 border border-[#EDEAE4]/40 aspect-[3/4]">
                      <img src={staticImg(item.images?.[0] || "")} className="w-full h-full object-cover" alt={item.name} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-serif text-[14px] text-[#5C0828] leading-tight truncate">{item.name}</h4>
                      <p className="text-[9px] uppercase tracking-widest text-[#7A8C85] mt-0.5">Qty {item.quantity}</p>
                    </div>
                    <p className="font-serif text-[14px] text-[#5C0828] flex-shrink-0">₹{((item.pricing_breakdown?.final_price || 0) * item.quantity).toLocaleString("en-IN")}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#F0EBE0] pt-6 space-y-4">
                <div className="flex justify-between text-[10px] uppercase tracking-[0.2em] font-black text-[#7A8C85]">
                  <span>Subtotal</span><span>₹{subtotal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-[10px] uppercase tracking-[0.2em] font-black">
                  <span className="text-[#7A8C85]">Delivery</span>
                  {distanceKm === null
                    ? <span className="text-[#7A8C85] italic">Enter address</span>
                    : deliveryCharge === 0
                      ? <span className="text-emerald-600">Free</span>
                      : <span>₹{deliveryCharge}</span>}
                </div>
                <div className="flex justify-between items-baseline pt-4 border-t border-[#F0EBE0]">
                  <span className="font-serif text-2xl text-[#5C0828]">Total</span>
                  <span className="font-serif text-4xl" style={{ color: GOLD }}>₹{total.toLocaleString("en-IN")}</span>
                </div>
              </div>
              {deliverySettings && (
                <div className="mt-6 bg-[#FAFAF8] rounded-2xl p-4 border border-[#EDEAE4]/60 space-y-1">
                  <p className="text-[8px] uppercase tracking-[0.2em] font-black text-[#7A8C85]">Delivery Zones</p>
                  {deliverySettings.zones.map((z, i) => (
                    <p key={i} className="text-[9px] text-[#7A8C85]">
                      {z.label || `${z.min_km}–${z.max_km} km`}: {z.charge === 0 ? "Free" : `₹${z.charge}`}
                    </p>
                  ))}
                  <p className="text-[9px] text-emerald-600 mt-1">Free on orders above ₹{deliverySettings.free_delivery_above.toLocaleString("en-IN")}</p>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
