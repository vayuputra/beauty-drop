import type { CapacitorConfig } from '@capacitor/cli';

// CAP_DEV=1 (with CAP_SERVER_URL=http://<your-ip>:5000) points the app at a local dev
// server and allows plain HTTP. Release builds stay HTTPS-only.
const isDev = process.env.CAP_DEV === "1";

const config: CapacitorConfig = {
  appId: 'com.beautydrop.app',
  appName: 'Beauty Drop',
  webDir: 'dist/public',
  server: {
    url: isDev ? process.env.CAP_SERVER_URL : undefined,
    cleartext: isDev,
    androidScheme: 'https',
  },
  android: {
    buildOptions: {
      signingType: 'apksigner',
    },
    allowMixedContent: isDev,
  },
  ios: {
    contentInset: 'never',
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
