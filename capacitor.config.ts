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
    // WebView ekranın tamamına çizilir (Capacitor'ın varsayılanı). Çentik, Dynamic Island ve
    // ana ekran çizgisi için boşluğu sayfanın kendisi bırakır: index.html'deki viewport-fit=cover
    // ve CSS'teki env(safe-area-inset-*). İki yöntemi ('always' + env) birlikte kullanmak
    // env() değerlerini 0 yapar ve içerik durum çubuğunun altına kayar.
    contentInset: 'never',
    // Sayfa yüklenmeden ya da kaydırma esnemesinde görünen zemin: açık temanın --ink rengi.
    backgroundColor: '#f9f8f5',
    // Bağlantılara uzun basınca tarayıcıya özgü önizleme/menü açılmasın.
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: '#f8f7f3',
      showSpinner: false,
    },
    // iOS, tam ekran bir pencere (uygulama içi tarayıcı, PayTR, kamera) kapanınca durum çubuğunu bu
    // stile döndürür: açık temaya uyan koyu yazı. Koyu temayı src/lib/native.ts yeniden uygular.
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
    },
  },
};

export default config;
