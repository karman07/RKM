"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Thin gold bar at the top that starts the moment an internal link / bottom-nav item is tapped
// and finishes when the new route has rendered, so slow page changes never look frozen.
export default function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (timer.current) clearInterval(timer.current);
    setVisible(true);
    setProgress(8);
    timer.current = setInterval(() => {
      setProgress((p) => (p < 85 ? p + (90 - p) * 0.12 : p));
    }, 200);
  };

  const done = () => {
    if (timer.current) clearInterval(timer.current);
    setProgress(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Route changed -> finish the bar.
  useEffect(() => {
    done();
  }, [pathname]);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    []
  );

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 w-full h-[3px] z-[100] pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms" }}
    >
      <div
        className="h-full"
        style={{
          width: `${progress}%`,
          background: "linear-gradient(90deg,#B8975A,#D4AF37)",
          boxShadow: "0 0 8px rgba(184,151,90,0.7)",
          transition: "width 200ms ease-out",
        }}
      />
    </div>
  );
}
