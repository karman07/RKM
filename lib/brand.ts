/**
 * Brand switch. Outside production builds (i.e. `next dev` / local) the app
 * shows "Ryntra Tech" instead of "RKM Jewellers". Production builds are
 * unchanged. Force the RKM brand locally with NEXT_PUBLIC_BRAND=rkm.
 */
export const IS_LOCAL_BRAND =
  process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_BRAND !== 'rkm';

export const BRAND_NAME = IS_LOCAL_BRAND ? 'Ryntra Tech' : 'RKM Jewellers';
export const BRAND_TAGLINE = 'Jewellery POS';
export const BRAND_NAME_UPPER = BRAND_NAME.toUpperCase();
export const BRAND_SHORT = IS_LOCAL_BRAND ? 'Ryntra' : 'RKM';
export const BRAND_LOGO = '/rkm-logo.png';
/** Local builds show a text-only brand — no logo/favicon. */
export const BRAND_ICON: string | undefined = IS_LOCAL_BRAND ? undefined : '/rkm-logo-cropped.png';
export const BRAND_DOMAIN = IS_LOCAL_BRAND ? 'ryntratech.com' : 'rkmjewellers.com';
export const BRAND_JEWELS = IS_LOCAL_BRAND ? 'Ryntra Tech' : 'RKM Jewels';
