import type { CapacitorConfig } from '@capacitor/cli';

// The iPhone/iPad app is a native shell around the deployed site, so it always
// shows the current version and Spotify sign-in returns to the same https
// address it does in Safari. SITE_URL is that address (your Vercel domain).
const site = process.env.SITE_URL?.replace(/\/+$/, '');

const config: CapacitorConfig = {
  appId: process.env.IOS_BUNDLE_ID || 'com.example.magicspells',
  appName: 'Magic Spells',
  webDir: 'dist',
  backgroundColor: '#0e0e11',
  ios: { contentInset: 'never' },
  ...(site
    ? {
        server: {
          url: site,
          // Keep Spotify's sign-in pages inside the app; every other outside link opens in Safari.
          allowNavigation: ['accounts.spotify.com'],
        },
      }
    : {}),
};

export default config;
