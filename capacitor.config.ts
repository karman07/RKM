import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rkm.manager',
  appName: 'RKM Manager',
  // Local fallback shell only — the WebView loads the deployed manager app below.
  webDir: 'www',
  server: {
    url: 'https://manager.rkmjewellers.com',
    cleartext: false,
  },
};

export default config;
