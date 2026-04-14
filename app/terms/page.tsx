import { THEME } from "../constants";
import { FadeIn } from "../../components/FadeIn";

export default function TermsConditions() {
  return (
    <main style={{ backgroundColor: THEME.colors.background, color: THEME.colors.text }} className="min-h-screen pt-40 pb-32 px-6">
      <div className="max-w-3xl mx-auto bg-white p-10 md:p-16 shadow-sm border" style={{ borderColor: THEME.colors.border }}>
        <FadeIn delay={0}>
          <div className="text-center mb-16 border-b pb-12" style={{ borderColor: THEME.colors.border }}>
            <span className="uppercase tracking-[0.3em] text-xs font-semibold mb-4 block" style={{ color: THEME.colors.primaryLight }}>Legal Hub</span>
            <h1 className="font-serif text-4xl md:text-5xl" style={{ color: THEME.colors.primaryDark }}>Terms & Conditions</h1>
            <p className="mt-4 text-sm opacity-60">Last Updated: April 12, 2026</p>
          </div>
        </FadeIn>

        <FadeIn delay={200}>
          <div className="prose prose-lg max-w-none text-[15px] leading-loose" style={{ color: THEME.colors.textMuted }}>
            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>1. Acceptance of Terms</h2>
            <p className="mb-6">
              By accessing and using Verdant Carat ("we", "our", "us"), you accept and agree to be bound by the terms 
              and provision of this agreement. In addition, when using these particular services, you shall be subject 
              to any posted guidelines or rules applicable to such services.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>2. Products and Pricing</h2>
            <p className="mb-4">
              All our fine jewelry is hand-crafted and unique. Therefore:
            </p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>Product weights, dimensions and capacities provided are approximate.</li>
              <li>We make every effort to display as accurately as possible the colors of our products that appear on the website.</li>
              <li>All prices are subject to change without notice due to the volatile nature of precious metal and gemstone markets.</li>
            </ul>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>3. Bespoke Services & Deposits</h2>
            <p className="mb-6">
              Custom designs and bespoke orders require a non-refundable 50% deposit before crafting begins. Due to the highly individual 
              nature of bespoke jewelry, these items cannot be returned or exchanged once they enter production.
            </p>

            <h2 className="font-serif text-2xl mt-12 mb-6" style={{ color: THEME.colors.primaryDark }}>4. Intellectual Property</h2>
            <p className="mb-6">
              All designs, images, and content on this site are the exclusive property of Verdant Carat LLC. Reproduction, 
              distribution, or any use of our intellectual property without express written consent is strictly prohibited and 
              may be subject to legal action.
            </p>

            <div className="mt-16 p-8 bg-gray-50 border-l-4" style={{ borderColor: THEME.colors.secondary }}>
              <p className="m-0 text-sm">
                For questions regarding these terms, please reach out to our legal department:<br/>
                <a href="mailto:legal@verdantcarat.com" className="font-semibold" style={{ color: THEME.colors.primaryDark }}>legal@verdantcarat.com</a>
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    </main>
  );
}
