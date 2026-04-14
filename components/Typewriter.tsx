"use client";
import React, { useState, useEffect } from "react";

interface TypewriterProps {
  texts: string[];
  delay?: number;
  pause?: number;
  className?: string;
}

export const Typewriter = ({ 
  texts, 
  delay = 100, 
  pause = 2000,
  className = "" 
}: TypewriterProps) => {
  const [textIndex, setTextIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentText = texts[textIndex];
    
    if (!isDeleting && charIndex === currentText.length) {
      const timeout = setTimeout(() => setIsDeleting(true), pause);
      return () => clearTimeout(timeout);
    }

    if (isDeleting && charIndex === 0) {
      setIsDeleting(false);
      setTextIndex((prev) => (prev + 1) % texts.length);
      return;
    }

    const timeout = setTimeout(() => {
      setCharIndex((prev) => prev + (isDeleting ? -1 : 1));
    }, isDeleting ? delay / 2 : delay);

    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, textIndex, texts, delay, pause]);

  return (
    <span className={`inline-block whitespace-nowrap relative ${className}`}>
      {texts[textIndex].substring(0, charIndex)}
      <span className="animate-pulse border-r-2 border-current ml-1" style={{ verticalAlign: 'middle' }}>&nbsp;</span>
    </span>
  );
};
