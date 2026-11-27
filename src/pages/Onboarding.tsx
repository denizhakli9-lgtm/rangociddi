import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Logo } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { markOnboarded } from '@/pages/Splash';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { tx } from '@/i18n/locale';

/** The site's own cover photographs (GORSEL-KAYNAKLARI.md); nothing is loaded from a third party. */
const photo = (name: string) => `${import.meta.env.BASE_URL}sector-${name}.webp`;

const slides = [
  {
    image: photo('hair-5'),
    title: ['İzmir’deki işletmeler tek yerde', 'İzmir’s businesses in one place'],
    text: ['Kuaförden spaya, berberden cilt bakımına: hizmetleri, fiyatları ve çalışma saatlerini karşılaştırın.', 'From hair salons to spas, barbers to skin care: compare services, prices and opening hours.'],
  },
  {
    image: photo('barber-3'),
    title: ['Size uyan saati seçin', 'Pick the time that suits you'],
    text: ['Hizmetinizi, uzmanınızı ve saatinizi seçin. Yalnızca gerçekten boş olan saatler gösterilir.', 'Choose your service, specialist and time. Only times that are really free are shown.'],
  },
  {
    image: photo('beauty-3'),
    title: ['Kapora ile yerinizi ayırın', 'Secure your spot with a deposit'],
    text: ['İşletme kapora istiyorsa tutarı ödeme öncesinde görürsünüz; kalan tutarı işletmede ödersiniz.', 'If the business asks for a deposit you see the amount before paying; you pay the rest at the business.'],
  },
] as const;

export default function Onboarding() {
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const slide = slides[index];
  const last = index === slides.length - 1;

  const finish = (to: string) => {
    markOnboarded();
    navigate(to);
  };

  return (
    <div className="grid min-h-screen bg-ink lg:grid-cols-2">
      <div className="relative h-[52vh] overflow-hidden lg:h-auto">
        {slides.map((s, i) => (
          <img
            key={s.image}
            src={s.image}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-all duration-1000 ${i === index ? 'scale-100 opacity-100' : 'scale-105 opacity-0'}`}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent lg:hidden" />
        <div className="absolute inset-x-0 top-0 h-[calc(7rem+env(safe-area-inset-top))] bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute left-6 top-[calc(1.5rem+env(safe-area-inset-top))] [&_span]:text-[#fff]">
          <Logo size="sm" />
        </div>
        <div className="absolute right-5 top-[calc(1rem+env(safe-area-inset-top))] flex items-center gap-2">
          <LanguageToggle className="!text-[#fff]" />
          <button onClick={() => finish('/kesfet')} className="px-2 text-[13px] font-medium text-[#fff] transition-opacity hover:opacity-80">
            {tx('Atla', 'Skip')}
          </button>
        </div>
      </div>

      <div className="relative -mt-16 flex flex-col justify-between px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-12 lg:mt-0 lg:justify-center lg:px-20">
        <div key={index} className="animate-fade-up">
          <p className="mb-3 text-[13px] font-medium text-mist-2">{index + 1} / {slides.length}</p>
          <h1 className="max-w-md font-display text-4xl leading-[1.1] tracking-[-0.02em] text-white sm:text-5xl">{tx(slide.title[0], slide.title[1])}</h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-mist">{tx(slide.text[0], slide.text[1])}</p>
        </div>

        <div className="mt-10">
          <div className="mb-8 flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={tx(`Slayt ${i + 1}`, `Slide ${i + 1}`)}
                className={`h-1 rounded-full transition-all duration-500 ${i === index ? 'w-10 bg-gold-500' : 'w-4 bg-line'}`}
              />
            ))}
          </div>
          {last ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" full onClick={() => finish('/kayit')}>
                {tx('Hesap oluştur', 'Create account')}
              </Button>
              <Button size="lg" variant="outline" full onClick={() => finish('/giris')}>
                {tx('Giriş yap', 'Sign in')}
              </Button>
              {/* Browsing salons needs no account (App Review 5.1.1): say so on the last slide too, not only via "Atla". */}
              <Button size="lg" variant="ghost" full onClick={() => finish('/kesfet')}>
                {tx('Üye olmadan göz at', 'Browse without an account')}
              </Button>
            </div>
          ) : (
            <Button size="lg" full icon={<ArrowRight className="h-4 w-4" />} className="flex-row-reverse sm:w-auto" onClick={() => setIndex(index + 1)}>
              {tx('Devam et', 'Continue')}
            </Button>
          )}
          <p className="mt-6 text-center text-xs text-mist-2 sm:text-left">
            {tx('İşletme sahibi misiniz?', 'Own a business?')}{' '}
            <Link to="/kayit?tip=isletme" onClick={markOnboarded} className="text-gold-400 hover:text-gold-300">
              {tx('İşletmenizi Rango’ya ekleyin', 'Add your business to Rango')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
