import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import "./globals.css";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import StoreProvider from "../components/StoreProvider";

const cormorant = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jost = Jost({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "RKM Jewellers | Best Jewellery Shop in Mohali & Chandigarh",
  description: "RKM Jewellers Mohali offers exquisite handcrafted 22K gold, certified diamonds, and customized bridal jewellery. Trusted jewellers since years, serving Chandigarh & Punjab with BIS Hallmarked purity and elegant designs.",
  keywords: "RKM Jewellers, Jewellers in Mohali, Best Jewellery Shop Chandigarh, Gold Jewellery Mohali, Diamond Ring Chandigarh, Bridal Jewellery sets Punjab, Customized Jewellery Mohali, BIS Hallmarked Gold Mohali",
  openGraph: {
    title: "RKM Jewellers | Exquisite Craftsmanship in Mohali",
    description: "Discover handcrafted gold, diamonds, and customized bridal sets at RKM Jewellers, Mohali's most trusted jewelry destination.",
    url: "https://rkmjewellers.com",
    siteName: "RKM Jewellers",
    locale: "en_IN",
    type: "website",
  },
};

import ChatAssistant from "../components/ChatAssistant";
import AnalyticsTracker from "../components/AnalyticsTracker";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${jost.variable} h-full antialiased scroll-smooth`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans selection:bg-[#064E3B]/20" suppressHydrationWarning>
        <AnalyticsTracker />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "JewelryStore",
              "name": "RKM Jewellers",
              "image": "https://rkmjewellers.com/aboutus.png",
              "@id": "https://rkmjewellers.com",
              "url": "https://rkmjewellers.com",
              "telephone": "+91- Mohali Office",
              "priceRange": "$$$",
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "Phase 3B2",
                "addressLocality": "Mohali",
                "addressRegion": "Punjab",
                "postalCode": "160059",
                "addressCountry": "IN"
              },
              "geo": {
                "@type": "GeoCoordinates",
                "latitude": 30.7046,
                "longitude": 76.7179
              },
              "servesCuisine": "",
              "openingHoursSpecification": {
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": [
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday"
                ],
                "opens": "11:00",
                "closes": "20:00"
              },
              "sameAs": [
                "https://www.facebook.com/rkmjewellers",
                "https://www.instagram.com/rkmjewellers",
                "https://www.linkedin.com/company/rkmjewellers"
              ]
            })
          }}
        />
        <StoreProvider>
          <Navbar />
          <div className="flex-1 flex flex-col pt-0">
            {children}
          </div>
          <Footer />
          <ChatAssistant />
        </StoreProvider>
      </body>
    </html>
  );
}

