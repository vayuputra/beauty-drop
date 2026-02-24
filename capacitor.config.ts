import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.beautydrop.app',
  appName: 'Beauty Drop',
  webDir: 'dist/public',
  server: {
    // In production, the app bundles the frontend and talks to the remote backend.
    // Set this to your deployed backend URL (e.g. https://beautydrop.example.com)
    // For local development, use your machine's IP: http://192.168.x.x:5000
    url: undefined, // Set at build time; when undefined, serves from bundled assets
    cleartext: true, // Allow HTTP for local dev
    androidScheme: 'https',
  },
  android: {
    buildOptions: {
      signingType: 'apksigner',
    },
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#FDF2F8',       // pink-50
      showSpinner: true,
      spinnerColor: '#DB2777',          // pink-600
      androidSpinnerStyle: 'small',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#FDF2F8',
    },
  },
};

export default config;
