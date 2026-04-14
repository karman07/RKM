"use client";

import { useEffect, useState } from "react";
import { THEME, API_BASE_URL } from "./constants";
import Hero from "../components/Hero";
import CategorySection from "../components/CategorySection";
import AboutTeaser from "../components/AboutTeaser";
import FeatureSplit from "../components/FeatureSplit";
import MapSection from "../components/MapSection";

interface Category {
  _id: string;
  name: string;
  slug: string;
}

interface Product {
  _id: string;
  name: string;
  sku: string;
  images: string[];
  net_weight: number;
  metal_type: string;
  purity: string;
  description?: string;
}

export default function LandingPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [productsByCategory, setProductsByCategory] = useState<Record<string, Product[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const catRes = await fetch(`${API_BASE_URL}/categories`);
        const cats: Category[] = await catRes.json();
        setCategories(cats.filter(c => (c as any).is_active !== false));

        const productPromises = cats.map(async (cat) => {
          const prodRes = await fetch(`${API_BASE_URL}/products?category_id=${cat._id}&limit=3`);
          const prodData = await prodRes.json();
          return { categoryId: cat._id, products: prodData.data || [] };
        });

        const allProducts = await Promise.all(productPromises);
        const productMap: Record<string, Product[]> = {};
        allProducts.forEach(({ categoryId, products }) => {
          productMap[categoryId] = products;
        });
        setProductsByCategory(productMap);
      } catch (error) {
        console.error("Error fetching landing page data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return (
    <div style={{ backgroundColor: THEME.colors.background, color: THEME.colors.text }} className="min-h-screen">
      <main>
        {/* Full Bleed Hero */}
        <Hero />

        {/* Dynamic Product Catalog */}
        <section id="collections" className="py-20 px-6 lg:px-12">
          <div className="max-w-[1440px] mx-auto">
            {!loading && categories.map((category, catIndex) => (
              <div key={category._id} className={catIndex > 0 ? "mt-32" : "mt-12"}>
                <CategorySection 
                  category={category} 
                  products={productsByCategory[category._id] || []} 
                  index={catIndex} 
                />
              </div>
            ))}

            {loading && (
              <div className="py-20 text-center uppercase tracking-widest text-xs animate-pulse opacity-50">
                Refining The Collection...
              </div>
            )}
          </div>
        </section>

        {/* About Section Teaser */}
        <AboutTeaser />

        {/* Feature Split Section */}
        <FeatureSplit />

        {/* Location Section */}
        <MapSection />
      </main>
    </div>
  );
}
