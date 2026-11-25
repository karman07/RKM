"use client";

import { useEffect, useState } from "react";
import { THEME, API_BASE_URL } from "../constants";
import { FadeIn } from "../../components/FadeIn";
import { isPublicBranch } from "../../lib/priceRanges";

interface ContactBranch { _id: string; name: string; phone?: string; email?: string; address?: string; city?: string; is_active?: boolean }

const WHATSAPP_NUMBER = "918699891977";

const SUBJECTS = [
  { value: "general", label: "General enquiry" },
  { value: "order", label: "Help with an order" },
  { value: "account_deletion", label: "Delete my account and data" },
  { value: "other", label: "Other" },
];

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", mobile: "", email: "", subject: "general", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [branches, setBranches] = useState<ContactBranch[]>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/branches`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setBranches(d.filter(isPublicBranch)); })
      .catch(() => {});
  }, []);

  // The corporate office is hidden from the public branch list, so the shared official email/phone come from the showrooms.
  const officialPhone = branches.find((b) => b.phone)?.phone;
  const officialEmail = branches.find((b) => b.email)?.email;

  // /contact?subject=account_deletion pre-selects the deletion request
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("subject");
    if (s && SUBJECTS.some((o) => o.value === s)) {
      setForm((f) => ({ ...f, subject: s, message: s === "account_deletion" ? "Please delete my account and personal data." : f.message }));
    }
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, email: form.email.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = Array.isArray(data?.message) ? data.message[0] : data?.message;
        throw new Error(msg || "Could not send your message. Please try again.");
      }
      setStatus("done");
    } catch (err: any) {
      setError(err.message || "Could not send your message. Please try again.");
      setStatus("error");
    }
  };

  const field = "w-full border-b bg-transparent outline-none py-3 text-sm";

  return (
    <main style={{ backgroundColor: THEME.colors.background, color: THEME.colors.text }} className="min-h-screen pt-40 pb-32 px-6">
      <div className="max-w-xl mx-auto bg-white p-8 md:p-14 shadow-sm border" style={{ borderColor: THEME.colors.border }}>
        <FadeIn delay={0}>
          <div className="text-center mb-10">
            <span className="uppercase tracking-[0.3em] text-xs font-semibold mb-4 block" style={{ color: THEME.colors.primaryLight }}>Get In Touch</span>
            <h1 className="font-serif text-4xl" style={{ color: THEME.colors.primaryDark }}>Contact Us</h1>
            <p className="mt-4 text-sm opacity-60">Questions, order help, or a request to delete your account — send it here and our team will get back to you.</p>
          </div>
        </FadeIn>

        <FadeIn delay={100}>
          <div className="grid gap-6 mb-10 pb-10 border-b text-sm" style={{ borderColor: THEME.colors.border }}>
            <div className="grid sm:grid-cols-3 gap-4 text-center">
              {officialPhone && (
                <a href={`tel:${officialPhone.replace(/\s/g, "")}`} className="block">
                  <span className="block uppercase tracking-[0.2em] text-[10px] font-bold opacity-50 mb-1">Call us</span>
                  <span className="font-medium">{officialPhone}</span>
                </a>
              )}
              <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="block">
                <span className="block uppercase tracking-[0.2em] text-[10px] font-bold opacity-50 mb-1">WhatsApp</span>
                <span className="font-medium">+91 86998 91977</span>
              </a>
              {officialEmail && (
                <a href={`mailto:${officialEmail}`} className="block">
                  <span className="block uppercase tracking-[0.2em] text-[10px] font-bold opacity-50 mb-1">Email</span>
                  <span className="font-medium break-all">{officialEmail}</span>
                </a>
              )}
            </div>
            {branches.length > 0 && (
              <div className="grid gap-4">
                <span className="uppercase tracking-[0.2em] text-[10px] font-bold opacity-50 text-center">Our showrooms</span>
                {branches.map((b) => (
                  <div key={b._id} className="text-center">
                    <p className="font-serif text-lg" style={{ color: THEME.colors.primaryDark }}>{b.name}</p>
                    {b.address && <p className="opacity-70">{b.address}</p>}
                    {b.phone && <a href={`tel:${b.phone.replace(/\s/g, "")}`} className="opacity-70 hover:underline">{b.phone}</a>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </FadeIn>

        {status === "done" ? (
          <p className="text-center py-10 font-serif text-xl" style={{ color: THEME.colors.primaryDark }}>
            Thank you. We have received your message and will contact you shortly.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-6">
            <input required maxLength={100} placeholder="Your name" value={form.name} onChange={set("name")} className={field} style={{ borderColor: THEME.colors.border }} />
            <input required type="tel" inputMode="tel" placeholder="Mobile number (the one used to sign in)" value={form.mobile} onChange={set("mobile")} className={field} style={{ borderColor: THEME.colors.border }} />
            <input type="email" maxLength={150} placeholder="Email (optional)" value={form.email} onChange={set("email")} className={field} style={{ borderColor: THEME.colors.border }} />
            <select value={form.subject} onChange={set("subject")} className={field} style={{ borderColor: THEME.colors.border }}>
              {SUBJECTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <textarea required rows={5} maxLength={2000} placeholder="How can we help?" value={form.message} onChange={set("message")} className={`${field} border`} style={{ borderColor: THEME.colors.border, padding: 12 }} />
            {status === "error" && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={status === "sending"} className="w-full py-4 uppercase tracking-[0.25em] text-xs font-bold text-white disabled:opacity-60" style={{ backgroundColor: THEME.colors.primaryDark }}>
              {status === "sending" ? "Sending..." : "Send Message"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
