import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ordonnance_direct.app',
  appName: 'Ordonnance Direct',
  webDir: 'dist',
  android: {
    appendUserAgent: 'OrdonnanceDirectAPK'
  },
  server: {
    androidScheme: 'https',
    cleartext: true
  }
};

export default config;
