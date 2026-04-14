export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export const THEME = {
  colors: {
    primary: "#064E3B",      // Deep Emerald Green (Base Color)
    primaryLight: "#059669", // Lighter Emerald
    primaryDark: "#022C22",  // Very Dark Emerald
    secondary: "#D4AF37",    // Soft Gold for accents
    background: "#F8F9FA",   // Very light gray base
    surface: "#FFFFFF",      // Clean white surface
    surfaceAlt: "#F0FDF4",   // Very subtle green surface
    text: "#111827",         // Very dark gray for text
    textLight: "#FFFFFF",    // White text (on dark backgrounds)
    textMuted: "#6B7280",    // Muted/gray text
    border: "#E5E7EB",       // Light gray border
    borderGreen: "#34D399",  // Muted green border
  }
};
