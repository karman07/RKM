import { API_BASE_URL } from "../app/constants";

export const DEV_BANNER_HEIGHT = 32;

/**
 * Resolves whether the "development build" banner should show, combining:
 *  - NODE_ENV — always on for a local `next dev` run, so it's visible
 *    without any admin action.
 *  - The admin-controlled `dev_banner_enabled` setting (Admin → Settings →
 *    Storefront) — lets admin flip the banner on for a deployed/staging
 *    build too, no redeploy needed.
 * Fetched server-side (in the root layout) so there's no client flash and
 * the resolved value can be threaded down to Navbar for its layout offset.
 */
export async function getDevBannerActive(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;

  try {
    const res = await fetch(`${API_BASE_URL}/settings/public`, { cache: "no-store" });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.dev_banner_enabled === true;
  } catch {
    return false;
  }
}

export default function DevBanner({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div
      style={{ height: DEV_BANNER_HEIGHT, backgroundColor: "#B8975A" }}
      className="fixed top-0 left-0 w-full z-[60] flex items-center justify-center px-4"
    >
      <p className="text-[9px] sm:text-[10.5px] font-black uppercase tracking-[0.18em] text-black/80 text-center">
        You are viewing a development build of this site — content and pricing may be incomplete.
      </p>
    </div>
  );
}
