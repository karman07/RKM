"use client";

import Link from "next/link";
import { THEME } from "../app/constants";
import { FadeIn } from "./FadeIn";

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

import BlogImage from "./BlogImage";

export default function BlogCard({ blog, index }: { blog: Blog; index: number }) {
  const publishedDate = new Date(blog.published_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <FadeIn delay={index * 0.1}>
      <Link href={`/blogs/${blog.slug}`} className="group block h-full">
        <div className="flex flex-col h-full bg-white rounded-3xl overflow-hidden border border-[#EDEAE4] hover:shadow-[0_24px_48px_rgba(0,0,0,0.06)] hover:border-[#B8975A]/20 transition-all duration-500">
          
          {/* Image Container */}
          <div className="relative aspect-[16/10] overflow-hidden bg-[#F9F8F6]">
            <BlogImage
              src={blog.cover_image}
              alt={blog.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
            {blog.categories?.[0] && (
              <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest text-[#1A2622]">
                {blog.categories[0]}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-8 flex flex-col flex-1">
            <div className="flex items-center gap-3 mb-4 opacity-40 text-[9px] font-black uppercase tracking-[0.2em]">
              <span>{publishedDate}</span>
              <span className="w-1 h-1 rounded-full bg-current" />
              <span>By {blog.author}</span>
            </div>

            <h3 className="font-serif text-2xl text-[#1A2622] leading-snug mb-4 group-hover:text-[#B8975A] transition-colors duration-300">
              {blog.title}
            </h3>

            <p className="text-sm text-[#5D6D66] font-light leading-relaxed mb-8 line-clamp-3">
              {blog.excerpt}
            </p>

            <div className="mt-auto flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#B8975A] group-hover:gap-4 transition-all duration-300">
              Read Journal
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </Link>
    </FadeIn>
  );
}
