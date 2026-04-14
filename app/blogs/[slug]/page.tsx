import { API_BASE_URL, THEME } from "../../constants";
import { FadeIn } from "../../../components/FadeIn";
import Link from "next/link";
import { Metadata } from "next";
import BlogImage from "../../../components/BlogImage";

interface Blog {
  _id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  cover_image: string;
  author: string;
  published_at: string;
  categories: string[];
  meta_title?: string;
  meta_description?: string;
}

// SEO Generation
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(`${API_BASE_URL}/blogs/slug/${slug}`);
    const blog: Blog = await res.json();
    return {
      title: blog.meta_title || `${blog.title} | Artisan Journal`,
      description: blog.meta_description || blog.excerpt,
      openGraph: {
        title: blog.title,
        description: blog.excerpt,
        images: [blog.cover_image],
      },
    };
  } catch (e) {
    return { title: 'Artisan Journal | Maison Brilliance' };
  }
}

export default async function BlogDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let blog: Blog | null = null;
  try {
    const res = await fetch(`${API_BASE_URL}/blogs/slug/${slug}`, {
      next: { revalidate: 3600 }
    });
    blog = await res.json();
  } catch (e) {
    console.error("Error loading blog:", e);
  }

  if (!blog || (blog as any).message) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-serif text-3xl mb-4 text-[#1A2E26]">Journal Entry Not Found</h2>
          <Link href="/blogs" className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8975A] border-b border-[#B8975A] pb-1">
            Return to Journal
          </Link>
        </div>
      </div>
    );
  }

  const publishedDate = new Date(blog.published_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <article style={{ backgroundColor: THEME.colors.background }} className="min-h-screen">
      {/* Hero Header */}
      <section className="relative pt-40 pb-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <FadeIn delay={0}>
            <div className="flex items-center justify-center gap-3 mb-8 opacity-40 text-[10px] font-black uppercase tracking-[0.3em]">
              <Link href="/blogs" className="hover:text-[#B8975A] transition-colors">{blog.categories?.[0] || 'Journal'}</Link>
              <span className="w-1 h-1 rounded-full bg-current" />
              <span>{publishedDate}</span>
            </div>
            
            <h1 className="font-serif text-4xl md:text-6xl lg:text-7xl text-[#1A2E26] leading-[1.1] mb-12">
              {blog.title}
            </h1>

            <div className="flex items-center justify-center gap-4 text-[11px] font-black uppercase tracking-[0.2em] text-[#B8975A]">
              <span className="w-8 h-[1px] bg-[#B8975A]/40" />
              <span>Story By {blog.author}</span>
              <span className="w-8 h-[1px] bg-[#B8975A]/40" />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Featured Image */}
      {blog.cover_image && (
        <section className="max-w-[1280px] mx-auto px-6 mb-24">
          <FadeIn delay={0.2}>
            <div className="relative aspect-[21/9] overflow-hidden rounded-[2.5rem] shadow-2xl bg-[#F9F8F6]">
              <BlogImage
                src={blog.cover_image}
                alt={blog.title}
                className="w-full h-full object-cover"
              />
            </div>
          </FadeIn>
        </section>
      )}

      {/* Content Section */}
      <section className="max-w-3xl mx-auto px-6 pb-32">
        <FadeIn delay={0.4}>
          <div 
            className="prose prose-lg prose-emerald max-w-none 
              font-light leading-[2] text-[#3D4D46]
              prose-h2:font-serif prose-h2:text-3xl prose-h2:text-[#1A2E26] prose-h2:mt-12 prose-h2:mb-6
              prose-p:mb-8
              prose-blockquote:font-serif prose-blockquote:italic prose-blockquote:text-2xl prose-blockquote:text-[#B8975A] prose-blockquote:border-l-[1px] prose-blockquote:border-[#B8975A]/40 prose-blockquote:pl-8 prose-blockquote:my-16
              prose-img:rounded-3xl prose-img:shadow-xl
            "
            dangerouslySetInnerHTML={{ __html: blog.content }}
          />

          <div className="mt-24 pt-12 border-t border-[#EDEAE4] flex justify-between items-center">
            <Link href="/blogs" className="group flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.3em] text-[#1A2E26] hover:text-[#B8975A] transition-all">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:-translate-x-2 transition-transform">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              All Journal Entries
            </Link>
            
            <div className="flex gap-4">
              {/* Social Share Placeholder */}
            </div>
          </div>
        </FadeIn>
      </section>
    </article>
  );
}
