import type { CapacitorConfig } from '@capacitor/cli';

// Rango'nun Android ve iOS uygulaması: `npm run build` ile oluşan `dist` klasörü
// uygulamanın içine gömülür, yani uygulama internetten site indirmez; yalnızca
// Supabase'e bağlanır. Ayrıntılar: MOBIL-REHBERI.md
const config: CapacitorConfig = {
  // Mağazalardaki kalıcı kimlik. Yayınladıktan sonra DEĞİŞTİRİLEMEZ.
  appId: 'tr.com.rango.app',
  appName: 'Rango',
  webDir: 'dist',
  server: {
    // Android'de uygulama https://localhost adresinde çalışır (güvenli bağlam:
    // pano, konum ve çerezler sorunsuz çalışır).
    androidScheme: 'https',
  },
  android: {
    // Yayın sürümünde WebView hata ayıklamayı kapatır.
    webContentsDebuggingEnabled: false,
  },
  ios: {
    // İçerik çentik/durum çubuğunun altına kaymasın.
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: '#f8f7f3',
      showSpinner: false,
    },
  },
};

export default config;
