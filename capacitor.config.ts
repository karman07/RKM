import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rkm.admin',
  appName: 'RKM Admin',
  // Local fallback shell only — the WebView loads the deployed admin app below.
  webDir: 'www',
  server: {
    url: 'https://admin.rkmjewellers.com',
    cleartext: false,
  },
};

export default config;
