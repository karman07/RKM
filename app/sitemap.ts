import { MetadataRoute } from 'next';
import { API_BASE_URL } from './constants';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://rkmjewellers.com';

  // Static routes
  const staticRoutes = ['', '/about', '/products', '/blogs', '/terms', '/privacy'].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1 : 0.8,
  }));

  // Fetch blogs for dynamic indexing
  let blogRoutes: any[] = [];
  try {
    const res = await fetch(`${API_BASE_URL}/blogs`);
    const logs = await res.json();
    blogRoutes = (logs.data || []).map((blog: any) => ({
      url: `${baseUrl}/blogs/${blog.slug}`,
      lastModified: new Date(blog.updatedAt || blog.published_at),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));
  } catch (e) {
    console.error('Sitemap blog fetch error', e);
  }

  // Fetch products for dynamic indexing (limit for sitemap performance)
  let productRoutes: any[] = [];
  try {
    const res = await fetch(`${API_BASE_URL}/products?limit=100`);
    const prods = await res.json();
    productRoutes = (prods.data || []).map((prod: any) => ({
      url: `${baseUrl}/products/${prod._id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch (e) {
    console.error('Sitemap product fetch error', e);
  }

  return [...staticRoutes, ...blogRoutes, ...productRoutes];
}
