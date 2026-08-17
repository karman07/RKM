import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rkm.sales',
  appName: 'RKM Sales',
  // Local fallback shell only — the WebView loads the deployed sales app below.
  webDir: 'www',
  server: {
    url: 'https://sales.rkmjewellers.com',
    cleartext: false,
  },
};

export default config;
