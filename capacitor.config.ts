import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rkm.frontend',
  appName: 'RKM Jewellers',
  // Local fallback shell only — the WebView loads the deployed frontend app below.
  webDir: 'www',
  server: {
    url: 'https://rkmjewellers.com',
    cleartext: false,
  },
};

export default config;
