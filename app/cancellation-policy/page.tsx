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
            <p className="mt-4 text-sm opacity-60">Last Updated: July 25, 2026</p>
          </div>
        </FadeIn>

        <FadeIn delay={200}>
          <div className="prose prose-lg max-w-none text-[15px] leading-loose" style={{ color: THEME.colors.textMuted }}>
            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>1. Ready-Stock Orders</h2>
            <p className="mb-6">
              You may cancel a ready-stock (non-custom) order free of charge at any time <strong>before it is
              dispatched</strong> from our branch. Once cancelled, we refund <strong>100% of the amount paid</strong>{' '}
              to your original payment method within <strong>5&ndash;7 business days</strong>. If your order has
              already been dispatched, it cannot be cancelled in transit — please refer to our{' '}
              <a href="/refund-policy" className="font-semibold" style={{ color: THEME.colors.primaryDark }}>Refund Policy</a>{' '}
              for the return process after delivery.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>2. Custom / Bespoke Orders</h2>
            <p className="mb-6">
              Since our fine jewellery is often hand-crafted to order, cancellation requests for bespoke pieces are
              accepted free of charge <strong>only before the item has entered production</strong>. Cancelling at
              this stage refunds your full deposit to your original payment method within 5&ndash;7 business days.
              Once crafting has begun, the order can no longer be cancelled, as materials and labour have already
              been committed to your specific design — the deposit terms disclosed in your order confirmation apply.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>3. Cancelling a Gold Investment / Advance Plan</h2>
            <p className="mb-6">
              If you choose to close your gold investment or advance plan and redeem your accumulated balance without
              proceeding to purchase jewellery, this is treated as a redemption of the scheme rather than an order
              cancellation. Consistent with standard practice for prepaid gold-savings schemes, this amount is
              settled as store credit rather than a cash refund. On redemption without an accompanying purchase, the
              following deductions apply to the advance amount:
            </p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li><strong>5% cancellation charge</strong> on the total advance amount deposited.</li>
              <li><strong>Making charges</strong> applicable to the plan, as disclosed at enrolment.</li>
              <li><strong>GST</strong> as applicable on the making charges and cancellation charge.</li>
              <li><strong>Packaging charges</strong>, where applicable.</li>
            </ul>
            <p className="mb-6">
              The net balance after these deductions is issued to you as store credit, redeemable at any RKM
              Jewellers branch, within <strong>7 business days</strong> of your request being approved.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>4. How to Request a Cancellation</h2>
            <p className="mb-6">
              To cancel an order or an advance/investment plan, email us or visit your nearest branch with your order
              or plan reference number. We confirm every cancellation request within <strong>2 business days</strong>,
              and any resulting refund or store credit is processed per the timelines above.
            </p>

            <div className="mt-16 p-8 bg-gray-50 border-l-4" style={{ borderColor: THEME.colors.secondary }}>
              <p className="m-0 text-sm mb-3">
                <strong>To request a cancellation</strong>, contact us with your order or plan reference number:
              </p>
              <p className="m-0 text-sm">
                Email: <a href="mailto:info@rkmjewellers.com" className="font-semibold" style={{ color: THEME.colors.primaryDark }}>info@rkmjewellers.com</a><br />
                Branch: RKM Jewellers, Phase 3B2, Mohali, Punjab 160059 — serving Chandigarh &amp; Tri-city
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    </main>
  );
}
