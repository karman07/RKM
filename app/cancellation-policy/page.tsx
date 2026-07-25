import { THEME } from "../constants";
import { FadeIn } from "../../components/FadeIn";

export default function CancellationPolicy() {
  return (
    <main style={{ backgroundColor: THEME.colors.background, color: THEME.colors.text }} className="min-h-screen pt-40 pb-32 px-6">
      <div className="max-w-3xl mx-auto bg-white p-10 md:p-16 shadow-sm border" style={{ borderColor: THEME.colors.border }}>
        <FadeIn delay={0}>
          <div className="text-center mb-16 border-b pb-12" style={{ borderColor: THEME.colors.border }}>
            <span className="uppercase tracking-[0.3em] text-xs font-semibold mb-4 block" style={{ color: THEME.colors.primaryLight }}>Legal Hub</span>
            <h1 className="font-serif text-4xl md:text-5xl" style={{ color: THEME.colors.primaryDark }}>Cancellation Policy</h1>
            <p className="mt-4 text-sm opacity-60">Last Updated: April 12, 2026</p>
          </div>
        </FadeIn>

        <FadeIn delay={200}>
          <div className="prose prose-lg max-w-none text-[15px] leading-loose" style={{ color: THEME.colors.textMuted }}>
            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>1. Order Cancellations</h2>
            <p className="mb-6">
              Since our fine jewelry is often hand-crafted to order, cancellation requests are only accepted before an item has
              entered production. Once crafting has begun, the order can no longer be cancelled and standard bespoke deposit
              terms apply.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>2. Cancelling a Gold Investment / Advance Plan</h2>
            <p className="mb-6">
              If you choose to close your gold investment or advance plan and redeem your accumulated balance without proceeding
              to purchase jewellery, this is treated as a cancellation of the scheme rather than a purchase. As per Indian
              regulatory guidelines governing jewellery advance schemes, this amount is settled as store credit or adjusted
              against future purchases &mdash; it is not disbursed as cash.
            </p>
            <p className="mb-4">On cancellation of the plan without an accompanying purchase, the following deductions apply to the advance amount:</p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li><strong>5% cancellation charge</strong> on the total advance amount deposited.</li>
              <li><strong>Making charges</strong> applicable to the plan, as disclosed at enrolment.</li>
              <li><strong>GST</strong> as applicable on the making charges and cancellation charge.</li>
              <li><strong>Packaging charges</strong>, where applicable.</li>
            </ul>
            <p className="mb-6">
              The net balance after these deductions is issued to you as store credit, redeemable at any RKM Jewellers branch.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>3. How to Request a Cancellation</h2>
            <p className="mb-6">
              To cancel an order or an advance/investment plan, please visit your nearest branch or contact our support team
              with your order or plan reference number. Cancellations are processed within 7 business days.
            </p>

            <div className="mt-16 p-8 bg-gray-50 border-l-4" style={{ borderColor: THEME.colors.secondary }}>
              <p className="m-0 text-sm">
                For questions regarding cancellations, please reach out to us at:<br/>
                <a href="mailto:info@rkmjewellers.com" className="font-semibold" style={{ color: THEME.colors.primaryDark }}>info@rkmjewellers.com</a>
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    </main>
  );
}
