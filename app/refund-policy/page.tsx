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
            <p className="mt-4 text-sm opacity-60">Last Updated: July 25, 2026</p>
          </div>
        </FadeIn>

        <FadeIn delay={200}>
          <div className="prose prose-lg max-w-none text-[15px] leading-loose" style={{ color: THEME.colors.textMuted }}>
            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>1. Ready-Stock Orders Cancelled Before Dispatch</h2>
            <p className="mb-6">
              If you cancel a ready-stock (non-custom) order before it has been dispatched from our branch, you are
              entitled to a <strong>100% refund</strong> of the amount paid. Refunds are credited to your original
              payment method (card, UPI, netbanking, or wallet) via Razorpay within <strong>5&ndash;7 business days</strong>{' '}
              of the cancellation being confirmed.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>2. Defective, Damaged, or Incorrect Items</h2>
            <p className="mb-6">
              If you receive an item that is defective, damaged in transit, or does not match your order, please
              contact us within <strong>48 hours of delivery</strong> at{' '}
              <a href="mailto:info@rkmjewellers.com" style={{ color: THEME.colors.primaryDark }}>info@rkmjewellers.com</a>{' '}
              with photos of the item and your order/invoice number. Once verified (within 2 business days of your
              report), <strong>you may choose</strong> between:
            </p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>a free repair or replacement, or</li>
              <li>a full refund of the purchase amount to your original payment method, processed within <strong>5&ndash;7 business days</strong> of approval.</li>
            </ul>
            <p className="mb-6">
              This choice is yours, not ours &mdash; we do not withhold repair/replacement/refund at our discretion once a
              defect or mismatch is verified.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>3. Custom / Bespoke Orders</h2>
            <p className="mb-6">
              Custom-designed pieces are made to order. Once crafting has begun on a bespoke order, the deposit taken
              at booking (as specified in your order confirmation) is non-refundable, since materials and labour have
              already been committed to your specific design. Cancelling <em>before</em> crafting begins is covered
              under our <a href="/cancellation-policy" className="font-semibold" style={{ color: THEME.colors.primaryDark }}>Cancellation Policy</a>{' '}
              and refunds the full deposit to your original payment method within 5&ndash;7 business days.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>4. Gold Investment / Advance Plan Redemption</h2>
            <p className="mb-6">
              Amounts deposited under a gold investment or jewellery advance plan are collected for the purpose of a
              future jewellery purchase, not as a general-purpose deposit. If you close the plan and redeem your
              balance <em>without</em> buying an item, this is handled as a scheme redemption rather than a product
              refund: in line with industry practice for prepaid gold-savings schemes, the balance is issued as{' '}
              <strong>store credit</strong> (redeemable at any RKM Jewellers branch against a future purchase),
              after the following deductions:
            </p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li><strong>5% deduction</strong> on the total advance amount.</li>
              <li><strong>Making charges</strong> as disclosed to you at enrolment.</li>
              <li><strong>GST</strong> on the applicable making charges and deduction.</li>
              <li><strong>Packaging charges</strong>, where applicable.</li>
            </ul>
            <p className="mb-6">
              Store credit is applied to your account within <strong>7 business days</strong> of your redemption
              request being approved. This clause applies only to scheme redemptions where no item is purchased — it
              does not reduce your rights under Sections 1 and 2 above for an actual product purchase made through the
              scheme.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>5. Refund Mode & Processing Time</h2>
            <p className="mb-6">
              All eligible monetary refunds are credited to the <strong>original payment method</strong> used at
              checkout (card, UPI, netbanking, or wallet) via Razorpay, within <strong>5&ndash;7 business days</strong>{' '}
              of approval. Payments made by cash at a branch are refunded by bank transfer or cheque within the same
              window, once your bank details are confirmed. We do not charge any fee for processing a valid refund.
            </p>

            <div className="mt-16 p-8 bg-gray-50 border-l-4" style={{ borderColor: THEME.colors.secondary }}>
              <p className="m-0 text-sm mb-3">
                <strong>To raise a refund request</strong>, contact us with your order or plan reference number:
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
