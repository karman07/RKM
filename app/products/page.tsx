"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL, THEME } from "../constants";
import ProductCard from "../../components/ProductCard";

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
  occasion?: string;
  gender?: string;
  stone_type?: string;
  category_id?: {
    _id: string;
    name: string;
    slug: string;
  };
  pricing_breakdown?: {
    final_price: number;
  };
}

interface Lookup {
  _id: string;
  lookup_type: string;
  label: string;
  value: string;
  is_active?: boolean;
}

const FILTER_ORDER = [
  "category",
  "gender",
  "occasion",
  "metal_type",
  "metal_color",
  "stone_type",
  "purity",
] as const;

const FILTER_LABELS: Record<string, string> = {
  category: "Category",
  gender: "Gender",
  occasion: "Occasion",
  metal_type: "Metal",
  metal_color: "Metal Color",
  stone_type: "Stones",
  purity: "Purity",
};

function titleFromFilters(params: URLSearchParams) {
  const search = params.get("search");
  if (search) return `"${search}"`;
  const possible = [
    params.get("category"),
    params.get("jewellery_type"),
    params.get("occasion"),
    params.get("gender"),
    params.get("metal_type"),
    params.get("metal_color"),
    params.get("stone_type"),
    params.get("purity"),
  ].filter(Boolean) as string[];

  if (possible.length === 0) return "All Jewellery";
  return possible[0].replace(/_/g, " ");
}

export default function ProductsPage() {
  const params = useSearchParams();
  const categoryValue = params.get("category") || params.get("jewellery_type") || "";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [lookups, setLookups] = useState<Record<string, Lookup[]>>({});
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const [sortBy, setSortBy] = useState("newest");
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeFilters = useMemo(
    () => [
      ["category", categoryValue],
      ["occasion", params.get("occasion")],
      ["gender", params.get("gender")],
      ["metal_type", params.get("metal_type")],
      ["metal_color", params.get("metal_color")],
      ["stone_type", params.get("stone_type")],
      ["purity", params.get("purity")],
    ].filter(([, v]) => !!v) as Array<[string, string]>,
    [params, categoryValue]
  );

  useEffect(() => {
    async function fetchData() {
      try {
        const [productRes, categoryRes, lookupRes] = await Promise.all([
          fetch(`${API_BASE_URL}/products?limit=200`),
          fetch(`${API_BASE_URL}/categories`),
          fetch(`${API_BASE_URL}/lookups`),
        ]);

        const productJson = await productRes.json();
        const categoryJson = await categoryRes.json();
        const lookupJson = await lookupRes.json();

        const fetchedProducts = Array.isArray(productJson)
          ? productJson
          : Array.isArray(productJson?.data)
            ? productJson.data
            : [];

        const fetchedCategories = Array.isArray(categoryJson)
          ? categoryJson.filter((c: Category & { is_active?: boolean }) => c.is_active !== false)
          : [];

        const fetchedLookups =
          lookupJson && typeof lookupJson === "object" && !Array.isArray(lookupJson)
            ? (Object.fromEntries(
                Object.entries(lookupJson).map(([k, v]) => [
                  k,
                  Array.isArray(v)
                    ? (v as Lookup[]).filter((item) => item.is_active !== false)
                    : [],
                ])
              ) as Record<string, Lookup[]>)
            : {};

        setProducts(fetchedProducts);
        setCategories(fetchedCategories);
        setLookups(fetchedLookups);
      } catch (err) {
        console.error("Error loading products page:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const isFirstRender = useRef(true);

  useEffect(() => {
    setSearchInput(params.get("search") ?? "");
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [params]);

  const filteredProducts = useMemo(() => {
    let result = products;

    if (searchInput.trim()) {
      const terms = searchInput.trim().toLowerCase().split(/\s+/);
      result = result.filter((p) => {
        const searchable = [p.name, p.sku, p.description, p.metal_type, p.purity]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return terms.every((term) => searchable.includes(term));
      });
    }

    if (activeFilters.length === 0 && !searchInput.trim()) {
      // still apply sort
    } else if (activeFilters.length > 0) {
      result = result.filter((p) => {
        return activeFilters.every(([key, value]) => {
          if (key === "category") {
            return p.category_id?.slug?.toLowerCase() === value.toLowerCase();
          }
          const fieldValue = (p as Record<string, unknown>)[key];
          return String(fieldValue || "").toLowerCase() === value.toLowerCase();
        });
      });
    }

    // Apply sort
    if (sortBy === "price-asc") {
      result = [...result].sort((a, b) => (a.pricing_breakdown?.final_price ?? 0) - (b.pricing_breakdown?.final_price ?? 0));
    } else if (sortBy === "price-desc") {
      result = [...result].sort((a, b) => (b.pricing_breakdown?.final_price ?? 0) - (a.pricing_breakdown?.final_price ?? 0));
    } else if (sortBy === "name-az") {
      result = [...result].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    }
    // "newest" = natural API order (default)

    return result;
  }, [products, activeFilters, searchInput, sortBy]);

  const filterGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; options: Array<{ value: string; label: string }> }> = [];

    groups.push({
      key: "category",
      label: FILTER_LABELS.category,
      options: categories.map((cat) => ({ value: cat.slug, label: cat.name })),
    });

    FILTER_ORDER.filter((key) => key !== "category").forEach((key) => {
      const opts = (lookups[key] || []).map((item) => ({ value: item.value, label: item.label }));
      if (opts.length > 0) {
        groups.push({ key, label: FILTER_LABELS[key], options: opts });
      }
    });

    return groups;
  }, [categories, lookups]);

  const buildFilterHref = (key: string, value?: string) => {
    const next = new URLSearchParams(params.toString());
    const current = key === "category" ? categoryValue : params.get(key);

    if (key === "category") {
      // Keep one canonical field and clear legacy alias.
      next.delete("jewellery_type");
    }

    if (!value || current === value) {
      next.delete(key);
      if (key === "category") next.delete("jewellery_type");
    } else {
      next.set(key, value);
      if (key === "category") next.delete("jewellery_type");
    }

    const q = next.toString();
    return q ? `/products?${q}` : "/products";
  };

  const handleClearSearch = () => {
    setSearchInput("");
    const next = new URLSearchParams(params.toString());
    next.delete("search");
    router.push(`/products${next.toString() ? `?${next.toString()}` : ""}`);
  };

  const heading = titleFromFilters(params)
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <main
      style={{ backgroundColor: THEME.colors.background, color: THEME.colors.text }}
      className="min-h-screen"
    >
      <section className="relative overflow-hidden border-b border-[#E8E3DA]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_30%,rgba(184,151,90,0.18),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(6,78,59,0.12),transparent_42%)] pointer-events-none" />

        <div className="max-w-[1440px] mx-auto px-5 sm:px-6 lg:px-12 pt-28 sm:pt-32 pb-10 sm:pb-14 relative z-10">
          <p className="text-[9.5px] uppercase tracking-[0.34em] sm:tracking-[0.38em] text-[#7A8C85] font-bold mb-4 sm:mb-6 animate-in fade-in slide-in-from-bottom-3 duration-1000 fill-mode-both">
            Curated Collection
          </p>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 sm:gap-8">
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-150 fill-mode-both">
              <h1 className="font-serif text-[2.4rem] sm:text-5xl md:text-6xl text-[#1A2E26] tracking-tight mb-3 sm:mb-4">
                {heading}
              </h1>
              <p className="text-sm text-[#5D6D66] max-w-2xl leading-relaxed hidden sm:block">
                Timeless silhouettes, refined craftsmanship, and modern heirlooms designed to celebrate your everyday moments.
              </p>
            </div>

            <div className="text-left lg:text-right flex items-center gap-4 lg:flex-col lg:gap-0 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300 fill-mode-both">
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#9A9A9A] font-semibold lg:mb-2">
                Pieces Found
              </p>
              <p
                key={filteredProducts.length}
                className="font-serif text-4xl text-[#B8975A] leading-none animate-in fade-in zoom-in duration-500"
              >
                {loading ? "..." : filteredProducts.length}
              </p>
            </div>
          </div>

          {/* ── Inline search bar ── */}
          <div className="mt-7 sm:mt-10 w-full sm:max-w-2xl animate-in fade-in slide-in-from-bottom-5 duration-1000 delay-500 fill-mode-both">
            <p className="text-[8.5px] uppercase tracking-[0.38em] text-[#9A9A9A] font-bold mb-3">
              Search the Collection
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const next = new URLSearchParams(params.toString());
                if (searchInput.trim()) next.set("search", searchInput.trim());
                else next.delete("search");
                router.push(`/products${next.toString() ? `?${next.toString()}` : ""}`);
              }}
              className="group flex items-center bg-white border border-[#DDD7CC] shadow-[0_4px_24px_rgba(0,0,0,0.06)] focus-within:border-[#B8975A] focus-within:shadow-[0_4px_24px_rgba(184,151,90,0.14)] transition-all duration-400 rounded-full overflow-hidden"
            >
              <div className="pl-5 sm:pl-6 pr-2 sm:pr-3 flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B8975A" strokeWidth="2.2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Rings, gold, diamonds…"
                className="flex-1 min-w-0 py-3.5 sm:py-4 text-[12px] sm:text-[13px] font-medium text-[#2A2A2A] placeholder-[#C4BAB0] bg-transparent focus:outline-none"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="px-2 sm:px-3 text-[#C4BAB0] hover:text-[#888] transition-colors flex-shrink-0"
                  aria-label="Clear search"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
              <button
                type="submit"
                className="m-1 sm:m-1.5 bg-[#1A2E26] text-white px-5 sm:px-8 py-2.5 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.3em] sm:tracking-[0.42em] hover:bg-[#B8975A] transition-colors duration-300 flex-shrink-0 rounded-full"
              >
                Search
              </button>
            </form>
          </div>

          {(activeFilters.length > 0 || searchInput) && (
            <div className="mt-3 sm:mt-4 flex overflow-x-auto pb-1 gap-2 scrollbar-none">
              {searchInput && (
                <button
                  onClick={handleClearSearch}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] font-bold rounded-full border border-[#DCCDB1] bg-[#FCF9F3] text-[#856536] group"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#B8975A" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  {searchInput}
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="opacity-50 group-hover:opacity-100"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              )}
              {activeFilters.map(([k, v]) => (
                <span
                  key={`${k}-${v}`}
                  className="flex-shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] font-bold rounded-full border border-[#DCCDB1] bg-[#FCF9F3] text-[#856536]"
                >
                  {k.replace(/_/g, " ")}: {v}
                </span>
              ))}
              <button
                onClick={() => { setSearchInput(""); router.push("/products"); }}
                className="flex-shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] font-bold rounded-full border border-[#D7D7D7] text-[#6B6B6B] hover:border-[#B8975A] hover:text-[#B8975A] transition-colors"
              >
                Clear All
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="max-w-[1440px] mx-auto px-5 sm:px-6 lg:px-12 py-8 sm:py-14">
        {!loading && filterGroups.length > 0 && (
          <div className="mb-8 sm:mb-12 rounded-2xl sm:rounded-3xl border border-[#EAE4D8] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 border-b border-[#EFEAE0] flex flex-wrap items-center justify-between gap-3 sm:gap-4 bg-[linear-gradient(120deg,#FAFAF8_0%,#F8F7F2_100%)]">
              <div>
                <p className="text-[8.5px] uppercase tracking-[0.3em] sm:tracking-[0.34em] text-[#8B8B8B] font-bold mb-0.5 sm:mb-1">
                  Refine Your Selection
                </p>
                <h2 className="font-serif text-xl sm:text-2xl text-[#1A2E26]">All Filters</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Sort dropdown */}
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="appearance-none pl-3 pr-7 py-2 text-[8.5px] sm:text-[9.5px] uppercase tracking-[0.2em] sm:tracking-[0.25em] font-black rounded-full border border-[#D2D2D2] text-[#6E6E6E] bg-white hover:border-[#B8975A] hover:text-[#B8975A] transition-colors focus:outline-none cursor-pointer"
                  >
                    <option value="newest">Newest</option>
                    <option value="price-asc">Price: Low → High</option>
                    <option value="price-desc">Price: High → Low</option>
                    <option value="name-az">Name A → Z</option>
                  </select>
                  <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#9E9E9E]" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((v) => !v)}
                  className="flex items-center gap-1.5 px-4 py-2 text-[9.5px] uppercase tracking-[0.3em] font-black rounded-full border border-[#D2D2D2] text-[#6E6E6E] hover:border-[#B8975A] hover:text-[#B8975A] transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform duration-300 ${filtersOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                  {filtersOpen ? "Collapse" : "Expand"}
                </button>
                <button
                  type="button"
                  onClick={() => { setSearchInput(""); router.push("/products"); setSortBy("newest"); }}
                  className="px-4 py-2 text-[9.5px] uppercase tracking-[0.3em] font-black rounded-full border border-[#D2D2D2] text-[#6E6E6E] hover:border-[#B8975A] hover:text-[#B8975A] transition-colors"
                >
                  Reset All
                </button>
              </div>
            </div>

            <div className={`grid transition-all duration-500 ease-in-out ${filtersOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">
                <div className="grid sm:grid-cols-2 xl:grid-cols-4">
                  {filterGroups.map((group, idx) => {
                  const activeValue = group.key === "category" ? categoryValue : params.get(group.key);
                  const isCollapsed = collapsedGroups[group.key] ?? false;
                  const totalGroups = filterGroups.length;
                  // Bottom border: all but last row. In xl (4-col) last row starts at idx >= totalGroups-4 rounded down to multiple of 4. Keep simple: always show bottom border, remove for last row only on xl.
                  const isLastRow2 = idx >= totalGroups - (totalGroups % 2 === 0 ? 2 : 1);
                  const isLastRow4 = idx >= totalGroups - (totalGroups % 4 || 4);
                  return (
                    <div
                      key={group.key}
                      className={`p-4 sm:p-6 lg:p-7 border-[#F0ECE4] border-b sm:border-r ${idx % 2 === 1 ? "sm:border-r-0" : ""} xl:border-r ${idx % 4 === 3 ? "xl:border-r-0" : ""} ${isLastRow2 ? "sm:border-b-0" : ""} ${isLastRow4 ? "xl:border-b-0" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedGroups((prev) => ({ ...prev, [group.key]: !isCollapsed }))
                          }
                          className="flex items-center gap-2"
                        >
                          <p className="text-[8.5px] uppercase tracking-[0.3em] font-black text-[#B8975A]">
                            {group.label}
                          </p>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className={`text-[#A88A56] transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>

                        {activeValue && (
                          <Link
                            href={buildFilterHref(group.key)}
                            className="text-[8px] uppercase tracking-[0.2em] text-[#9A9A9A] hover:text-[#B8975A]"
                          >
                            Clear
                          </Link>
                        )}
                      </div>

                      <div className={`grid transition-all duration-300 overflow-hidden ${isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
                        <div className="overflow-hidden">
                          <div className="flex flex-wrap gap-2 pt-1 pb-1">
                            {group.options.map((option) => {
                              const isActive = activeValue?.toLowerCase() === option.value.toLowerCase();
                              return (
                                <Link
                                  key={`${group.key}-${option.value}`}
                                  href={buildFilterHref(group.key, option.value)}
                                  className={`px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.2em] font-bold border transition-all duration-300 active:scale-95 ${
                                    isActive
                                      ? "bg-[#B8975A] text-white border-[#B8975A] shadow-[0_6px_16px_rgba(184,151,90,0.35)]"
                                      : "bg-[#FCFCFA] text-[#5D5D5D] border-[#DDD7CB] hover:border-[#B8975A] hover:text-[#B8975A]"
                                  }`}
                                >
                                  {option.label}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="py-20 sm:py-28 text-center">
            <p className="text-[10px] uppercase tracking-[0.38em] text-[#B8975A] animate-pulse">
              Preparing the collection...
            </p>
          </div>
        )}

        {!loading && filteredProducts.length === 0 && (
          <div className="py-16 sm:py-24 border border-[#EBE3D3] bg-[#FFFDF9] text-center rounded-2xl sm:rounded-3xl px-6">
            <h3 className="font-serif text-3xl sm:text-4xl text-[#1A2E26] mb-3 sm:mb-4">No Matching Pieces</h3>
            <p className="text-[#6A7570] mb-6 sm:mb-8 text-sm">Try a different filter combination to explore more designs.</p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.34em] font-black text-[#B8975A] hover:gap-3 transition-all"
            >
              View Entire Collection
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}

        {!loading && filteredProducts.length > 0 && (
          <div
            key={activeFilters.map(f => f.join()).join('|') + searchInput + sortBy}
            className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-3 sm:gap-x-7 gap-y-8 sm:gap-y-14 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out"
          >
            {filteredProducts.map((product, index) => (
              <ProductCard
                key={product._id}
                product={product}
                index={index % 8}
                badge={index < 4 ? "New Arrival" : undefined}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
