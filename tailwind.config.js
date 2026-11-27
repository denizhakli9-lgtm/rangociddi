/** @type {import('tailwindcss').Config} */
export default {
  // seo/: derleme sırasında üretilen statik sayfalar da aynı sınıfları kullanır.
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', './seo/**/*.ts'],
  // hover: stilleri yalnızca fareli cihazlarda uygulanır; iPhone'da dokunduktan sonra öğe
  // vurgulu kalmaz. Masaüstündeki görünüm değişmez.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      // min-h-screen: tarayıcı çubukları açıkken de taşmayan küçük görünüm yüksekliği (svh);
      // desteklemeyen eski tarayıcılar 100vh kullanır.
      minHeight: { screen: ['100vh', '100svh'] },
      colors: {
        // "white" metin rengidir ve temayla birlikte döner: açık temada koyu, koyu temada açık.
        white: 'rgb(var(--foreground) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        coal: { DEFAULT: 'rgb(var(--coal) / <alpha-value>)', 2: 'rgb(var(--coal-2) / <alpha-value>)', 3: 'rgb(var(--coal-3) / <alpha-value>)' },
        line: { DEFAULT: 'rgb(var(--line) / <alpha-value>)', soft: 'rgb(var(--line-soft) / <alpha-value>)' },
        mist: { DEFAULT: 'rgb(var(--mist) / <alpha-value>)', 2: 'rgb(var(--mist-2) / <alpha-value>)', 3: 'rgb(var(--mist-3) / <alpha-value>)' },
        // Ana eylem rengi: açık temada mürekkep siyahı, koyu temada marka altını.
        primary: { DEFAULT: 'rgb(var(--primary) / <alpha-value>)', fg: 'rgb(var(--on-primary) / <alpha-value>)' },
        gold: {
          50: '#FBF7E9',
          100: '#F5ECC8',
          200: '#EBD992',
          300: '#E2C766',
          400: '#DABB4C',
          500: '#D4AF37',
          600: '#B8952A',
          700: '#8F7321',
          800: '#665219',
          900: '#3D3110',
        },
        champagne: { 300: '#E9DCC0', 500: '#CDB991', 700: '#8C7A57' },
        success: { 300: '#86EFAC', 500: '#22C55E', 700: '#15803D', 900: '#0F2A1A' },
        warning: { 300: '#FCD34D', 500: '#F59E0B', 700: '#B45309', 900: '#2D200A' },
        error: { 300: '#FCA5A5', 500: '#EF4444', 700: '#B91C1C', 900: '#2D1111' },
        info: { 300: '#93C5FD', 500: '#3B82F6', 700: '#1D4ED8', 900: '#0F1B33' },
      },
      fontFamily: {
        display: ['"Rango Display"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['Figtree', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      // Köşe ölçeği: denetimler 10px, kartlar 14px, büyük yüzeyler 20px.
      borderRadius: {
        xl: '0.625rem',
        '2xl': '0.875rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        gold: '0 1px 2px rgb(24 23 20 / 0.05), 0 10px 28px -14px rgb(24 23 20 / 0.22)',
        card: '0 1px 2px rgb(24 23 20 / 0.04), 0 18px 44px -24px rgb(24 23 20 / 0.3)',
        pop: '0 4px 12px -2px rgb(24 23 20 / 0.08), 0 24px 56px -20px rgb(24 23 20 / 0.32)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'scale-in': { '0%': { opacity: 0, transform: 'scale(0.98)' }, '100%': { opacity: 1, transform: 'scale(1)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'logo-reveal': { '0%': { opacity: 0, transform: 'scale(0.96)', filter: 'blur(8px)' }, '100%': { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' } },
        'line-grow': { '0%': { transform: 'scaleX(0)' }, '100%': { transform: 'scaleX(1)' } },
        'slide-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.35s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.25s ease both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 2.2s linear infinite',
        'logo-reveal': 'logo-reveal 1.4s cubic-bezier(0.22,1,0.36,1) both',
        'line-grow': 'line-grow 1.2s cubic-bezier(0.22,1,0.36,1) 0.6s both',
        'slide-up': 'slide-up 0.28s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [
    // can-hover: yalnızca fareli cihazlar. Üzerine gelince beliren bir öğeyi yalnızca bu cihazlarda gizlemek için:
    // `opacity-100 can-hover:opacity-0 group-hover:opacity-100`. Dokunmatik ekranda öğe hep görünür kalır.
    ({ addVariant }) => addVariant('can-hover', '@media (hover: hover) and (pointer: fine)'),
  ],
};
