import { THEME } from "../constants";
import { FadeIn } from "../../components/FadeIn";

export default function RefundPolicy() {
  return (
    <main style={{ backgroundColor: THEME.colors.background, color: THEME.colors.text }} className="min-h-screen pt-40 pb-32 px-6">
      <div className="max-w-3xl mx-auto bg-white p-10 md:p-16 shadow-sm border" style={{ borderColor: THEME.colors.border }}>
        <FadeIn delay={0}>
          <div className="text-center mb-16 border-b pb-12" style={{ borderColor: THEME.colors.border }}>
            <span className="uppercase tracking-[0.3em] text-xs font-semibold mb-4 block" style={{ color: THEME.colors.primaryLight }}>Legal Hub</span>
            <h1 className="font-serif text-4xl md:text-5xl" style={{ color: THEME.colors.primaryDark }}>Refund Policy</h1>
            <p className="mt-4 text-sm opacity-60">Last Updated: April 12, 2026</p>
          </div>
        </FadeIn>

        <FadeIn delay={200}>
          <div className="prose prose-lg max-w-none text-[15px] leading-loose" style={{ color: THEME.colors.textMuted }}>
            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>1. General Refund Terms</h2>
            <p className="mb-6">
              Given the fine craftsmanship and precious materials used in our jewellery, all sales are considered final once an
              item has been handed over. Refunds are only considered in the specific circumstances described below.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>2. Advance Redeemed Without Purchasing an Item</h2>
            <p className="mb-6">
              Amounts deposited under a gold investment or jewellery advance plan are collected for the purpose of a future
              jewellery purchase. If you redeem your advance balance without buying an item, no cash refund is issued &mdash;
              in accordance with Indian regulatory guidelines, the balance is settled as store credit after the following
              deductions:
            </p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li><strong>5% deduction</strong> on the total advance amount.</li>
              <li><strong>Making charges</strong> as applicable to the plan.</li>
              <li><strong>GST</strong> on the applicable making charges and deduction.</li>
              <li><strong>Packaging charges</strong>, where applicable.</li>
            </ul>
            <p className="mb-6">
              The remaining balance, after these deductions, is credited to your account as store credit and can be redeemed
              against any purchase at our branches.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>3. Defective or Incorrect Items</h2>
            <p className="mb-6">
              If you receive an item that is defective, damaged, or does not match your order, please contact us within 48
              hours of delivery. Once verified, we will offer a repair, replacement, or refund of the purchase amount at our
              discretion.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>4. Refund Processing Time</h2>
            <p className="mb-6">
              Approved refunds and store credits are processed within 7&ndash;10 business days. Store credit is reflected in
              your account immediately upon approval; card or bank refunds may take additional time depending on your provider.
            </p>

            <div className="mt-16 p-8 bg-gray-50 border-l-4" style={{ borderColor: THEME.colors.secondary }}>
              <p className="m-0 text-sm">
                For questions regarding refunds, please reach out to us at:<br/>
                <a href="mailto:info@rkmjewellers.com" className="font-semibold" style={{ color: THEME.colors.primaryDark }}>info@rkmjewellers.com</a>
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    </main>
  );
}
