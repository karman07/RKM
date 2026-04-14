"use client";

import { useState } from "react";

interface BlogImageProps {
  src: string;
  alt: string;
  className?: string;
}

export default function BlogImage({ src, alt, className }: BlogImageProps) {
  const [imgSrc, setImgSrc] = useState(src);
  const fallbackImage = "https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?q=80&w=1500&auto=format&fit=crop";

  return (
    <img
      src={imgSrc}
      alt={alt}
      onError={() => setImgSrc(fallbackImage)}
      className={className}
    />
  );
}
