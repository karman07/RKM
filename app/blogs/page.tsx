"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, THEME } from "../constants";
import BlogCard from "../../components/BlogCard";
import { FadeIn } from "../../components/FadeIn";

interface Blog {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  cover_image: string;
  author: string;
  published_at: string;
  categories: string[];
}

export default function BlogsPage() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/blogs?is_published=true&limit=12`)
      .then((res) => res.json())
      .then((json) => {
        setBlogs(json.data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching blogs:", err);
        setLoading(false);
      });
  }, []);

  return (
    <main style={{ backgroundColor: THEME.colors.background }} className="min-h-screen">
      {/* Header */}
      <section className="relative pt-32 pb-24 overflow-hidden border-b border-[#E8E3DA]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_30%,rgba(184,151,90,0.12),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(6,78,59,0.08),transparent_42%)] pointer-events-none" />
        
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 relative z-10 text-center">
          <FadeIn delay={0}>
            <span className="uppercase tracking-[0.4em] text-[10px] font-black text-[#B8975A] mb-6 block">The Artisan Journal</span>
            <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl text-[#1A2E26] tracking-tight mb-8">
              Maison Brilliance
            </h1>
            <p className="text-[#5D6D66] max-w-2xl mx-auto leading-relaxed italic text-lg font-light">
              Explorations into the heritage of craftsmanship, the art of fine jewelry, and the stories behind our most exquisite creations.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* Blog Grid */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-24">
        {loading ? (
          <div className="py-32 text-center">
            <div className="animate-pulse flex flex-col items-center">
              <div className="h-4 w-48 bg-[#B8975A]/20 rounded-full mb-4" />
              <div className="text-[10px] uppercase tracking-[0.4em] font-black text-[#B8975A] opacity-40">
                Opening The Journal...
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-16">
            {blogs.length > 0 ? (
              blogs.map((blog, index) => (
                <BlogCard key={blog._id} blog={blog} index={index} />
              ))
            ) : (
              <div className="col-span-full py-32 text-center italic text-[#7A8C85] opacity-60">
                New stories are being written. Please check back soon.
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
