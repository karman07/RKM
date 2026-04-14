import { THEME } from "../constants";
import { FadeIn } from "../../components/FadeIn";
import MapSection from "../../components/MapSection";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "About RKM Jewellers | Best Jewellery Shop in Mohali",
  description: "Learn about RKM Jewellers, a trusted brand in Mohali and Chandigarh specializing in handcrafted gold, certified diamond, and bridal sets with BIS Hallmark purity.",
};

export default function AboutPage() {
  return (
    <main style={{ backgroundColor: THEME.colors.background, color: THEME.colors.text }} className="min-h-screen">
      {/* Hero Array */}
      <section className="relative h-[65vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="/aboutus.png" 
            alt="RKM Jewellers Boutique in Mohali" 
            className="w-full h-full object-cover brightness-[0.55]"
          />
        </div>
        <div className="relative z-10 text-center px-6 mt-16">
          <FadeIn delay={0}>
            <p className="tracking-[0.4em] uppercase text-xs mb-6 font-semibold" style={{ color: THEME.colors.secondary }}>Our Legacy</p>
            <h1 className="font-serif text-5xl md:text-7xl mb-4 drop-shadow-md" style={{ color: THEME.colors.textLight }}>Exquisite Craftsmanship</h1>
          </FadeIn>
        </div>
      </section>

      {/* Content Story */}
      <section className="py-24 px-6 max-w-4xl mx-auto">
        <FadeIn delay={200}>
          <div className="prose prose-lg max-w-none leading-relaxed text-[17px]" style={{ color: THEME.colors.textMuted }}>
            <h2 className="font-serif text-4xl mb-8" style={{ color: THEME.colors.primaryDark }}>About RKM Jewellers</h2>
            <p className="mb-10 text-justify">
              RKM Jewellers is a trusted jewellery brand based in Mohali, near Chandigarh, known for its exceptional craftsmanship, elegant designs, and customer-focused approach. Established with a vision to bring together traditional artistry and modern aesthetics, RKM Jewellers specializes in handcrafted gold, diamond, and silver jewellery tailored to suit every occasion.
            </p>
            
            <p className="mb-10 text-justify">
              Located in Mohali, Punjab, RKM Jewellers has quickly built a reputation for delivering high-quality jewellery that combines authenticity, purity, and style. The brand offers a diverse collection, including 22K gold jewellery, certified diamond jewellery, solitaire rings, bridal jewellery sets, and lightweight daily wear designs. Each piece is carefully designed and crafted to reflect precision, beauty, and long-lasting value.
            </p>

            <div className="my-20 flex flex-col md:flex-row gap-8">
              <img src="/image.png" className="w-full md:w-1/2 h-96 object-cover shadow-xl rounded-2xl transition-transform duration-700 hover:scale-[1.02]" alt="Expert Jewellery Craftsmanship Mohali" />
              <img src="https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?q=80&w=800&auto=format&fit=crop" className="w-full md:w-1/2 h-96 object-cover shadow-sm rounded-2xl" alt="Certified Diamond Jewellery Chandigarh" />
            </div>

            <h2 className="font-serif text-4xl mb-8 mt-16" style={{ color: THEME.colors.primaryDark }}>Expertise in Customization</h2>
            <p className="mb-10 text-justify">
              One of the key strengths of RKM Jewellers is its expertise in customized jewellery. Customers can create personalized designs for engagement rings, wedding jewellery, and special occasions, making every piece unique and meaningful. The brand focuses on understanding customer preferences and delivering jewellery that matches individual style and budget.
            </p>

            <h2 className="font-serif text-4xl mb-8 mt-16" style={{ color: THEME.colors.primaryDark }}>Standard of Quality & Transparency</h2>
            <p className="mb-10 text-justify">
              RKM Jewellers is committed to maintaining high standards of quality and transparency. All gold jewellery follows BIS hallmark standards, and diamonds are sourced with a focus on authenticity and brilliance. With a strong emphasis on customer satisfaction, the brand provides a personalized shopping experience that builds trust and long-term relationships.
            </p>

            <h2 className="font-serif text-4xl mb-8 mt-16" style={{ color: THEME.colors.primaryDark }}>Your Preferred Jewellery Destination</h2>
            <p className="mb-10 text-justify">
              Serving customers across Mohali, Chandigarh, and nearby areas, RKM Jewellers aims to become a preferred destination for those seeking premium yet affordable jewellery. Whether it is traditional bridal collections, modern minimalist designs, or custom-made jewellery, RKM Jewellers offers a perfect blend of luxury, craftsmanship, and value.
            </p>
          </div>
        </FadeIn>
      </section>

      {/* Signature Banner */}
      <section className="py-24" style={{ backgroundColor: THEME.colors.primaryDark }}>
        <div className="max-w-4xl mx-auto text-center px-6">
          <FadeIn delay={100}>
            <h3 className="font-serif text-3xl md:text-4xl italic font-light leading-snug mb-8" style={{ color: THEME.colors.textLight }}>
              Visit RKM Jewellers in Mohali
            </h3>
            <p className="text-[#F0EBE0]/80 text-[11px] uppercase tracking-[0.4em] mb-12">
              The Finest Jewelry Experience in Punjab & Chandigarh
            </p>
            <div className="w-16 h-[1px] mx-auto opacity-50" style={{ backgroundColor: THEME.colors.secondary }}/>
          </FadeIn>
        </div>
      </section>

      <MapSection />
    </main>
  );
}
