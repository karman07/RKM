export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";
export const AI_BASE_URL = process.env.NEXT_PUBLIC_AI_URL || "http://localhost:8000";
export const STATIC_BASE_URL = process.env.NEXT_PUBLIC_STATIC_URL || "http://localhost:3000";

export const THEME = {
  colors: {
    primary: "#5C0828",      // Deep Maroon (Base Color)
    primaryLight: "#7A1238", // Lighter Maroon
    primaryDark: "#3A0418",  // Very Dark Maroon
    secondary: "#D4AF37",    // Soft Gold for accents
    background: "#F8F9FA",   // Very light gray base
    surface: "#FFFFFF",      // Clean white surface
    surfaceAlt: "#FDF4F6",   // Very subtle maroon surface
    text: "#111827",         // Very dark gray for text
    textLight: "#FFFFFF",    // White text (on dark backgrounds)
    textMuted: "#6B7280",    // Muted/gray text
    border: "#E5E7EB",       // Light gray border
    borderMaroon: "#C07090", // Muted maroon border
  }
};
