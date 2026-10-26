"use client";

import { useState } from "react";
import { STATIC_BASE_URL } from "../app/constants";
import { optimizedSrc } from "../lib/img";

interface BlogImageProps {
  src: string;
  alt: string;
  className?: string;
}

export default function BlogImage({ src, alt, className }: BlogImageProps) {
  const fullSrc = src && !src.startsWith("http") 
    ? `${STATIC_BASE_URL}${src.startsWith("/") ? "" : "/"}${src}` 
    : src;
    
  const [imgSrc, setImgSrc] = useState(fullSrc);
  const fallbackImage = "https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?q=80&w=1500&auto=format&fit=crop";

  return (
    <img
      src={optimizedSrc(imgSrc, 828)}
      loading="lazy"
      decoding="async"
      alt={alt}
      onError={() => setImgSrc(fallbackImage)}
      className={className}
    />
  );
}
