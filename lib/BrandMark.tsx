import type { CSSProperties } from 'react';
import { BRAND_LOGO, BRAND_NAME, BRAND_TAGLINE, IS_LOCAL_BRAND } from './brand';

/** Production: the logo image. Local: plain text brand (no logo). */
export default function BrandMark({ className, style }: { className?: string; style?: CSSProperties }) {
  if (!IS_LOCAL_BRAND) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={BRAND_LOGO} alt={BRAND_NAME} className={className} style={style} />;
  }
  return (
    <span
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', textAlign: 'center', lineHeight: 1.15, fontWeight: 800, fontSize: 10, color: 'inherit', letterSpacing: '0.02em' }}
    >
      <span>{BRAND_NAME}</span>
      <span style={{ fontWeight: 600, fontSize: 8, opacity: 0.7 }}>{BRAND_TAGLINE}</span>
    </span>
  );
}
