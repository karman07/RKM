export const DEV_BANNER_HEIGHT = 32;

export const isDevBannerActive =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_APP_ENV === "development";

export default function DevBanner() {
  if (!isDevBannerActive) return null;

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
