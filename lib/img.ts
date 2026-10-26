// Routes an image through Next's optimizer (/_next/image): resized to the width we actually show, served as WebP/AVIF.
// Widths must be one of Next's default sizes; quality must be in next.config `images.qualities`.
export function optimizedSrc(src: string | undefined, width = 640): string {
  if (!src) return "";
  if (src.startsWith("data:") || src.startsWith("blob:") || src.endsWith(".svg")) return src;
  const clean = src.replace(/^(https?:\/\/[^/]+)\/{2,}/, "$1/");
  return `/_next/image?url=${encodeURIComponent(clean)}&w=${width}&q=75`;
}
