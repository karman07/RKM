/**
 * Pure-metal fraction for a purity label: "22K" → 22/24, "24K" → 1, "916" → 0.916, "999" → 0.999, "92.5" → 0.925.
 * Unknown/blank purities return 0 so they never silently inflate the expected gold.
 */
export function fineness(purity?: string | null): number {
  const raw = String(purity ?? '').trim().toUpperCase();
  if (!raw) return 0;
  const karat = raw.match(/^(\d{1,2}(?:\.\d+)?)\s*K(?:T|ARAT)?$/);
  if (karat) {
    const k = Number(karat[1]);
    return k > 0 && k <= 24 ? k / 24 : 0;
  }
  const num = Number(raw.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return 0;
  if (num <= 1) return num;
  if (num <= 100) return num / 100;
  if (num <= 1000) return num / 1000;
  return 0;
}
