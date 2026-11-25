// Price ranges offered in the website filters and the "Shop By" menu. Labelled in words, as requested.
// The front of the site (home page, default product list) stays within FEATURED_MIN–FEATURED_MAX; everything else is reachable through these ranges.
export const FEATURED_MIN = 50000;
export const FEATURED_MAX = 100000;

export const PRICE_RANGES = [
  { value: "0-49999", label: "Under ₹50K" },
  { value: "50000-99999", label: "₹50K – ₹99K" },
  { value: "100000-199999", label: "₹1 Lakh – ₹1.99 Lakh" },
  { value: "200000-299999", label: "₹2 Lakh – ₹2.99 Lakh" },
  { value: "300000-399999", label: "₹3 Lakh – ₹3.99 Lakh" },
  { value: "400000-500000", label: "₹4 Lakh – ₹5 Lakh" },
];

// Not ornaments: kept out of the Ornament Type filter and the footer categories.
export const HIDDEN_CATEGORY_SLUGS = new Set(["artwork", "bowl", "cup", "silver-glass", "gift-item", "italian-silver-watch"]);

// Branches that are only used for testing or the back office never show publicly.
export const isPublicBranch = (b: { name: string; is_active?: boolean }) => b.is_active !== false && !/office|corporate|\btest\b/i.test(b.name);
