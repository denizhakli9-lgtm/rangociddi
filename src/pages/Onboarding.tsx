import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarCheck, ShieldCheck, Sparkles } from 'lucide-react';
import { Logo } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { markOnboarded } from '@/pages/Splash';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { tx } from '@/i18n/locale';

const slides = [
  {
    image: 'https://images.pexels.com/photos/10317444/pexels-photo-10317444.jpeg?auto=compress&cs=tinysrgb&h=1200&w=940',
    icon: Sparkles,
    eyebrow: ['Keşfet', 'Discover'],
    title: ['İzmir’in en seçkin salonları tek yerde', 'İzmir’s finest salons in one place'],
    text: ['Kuaförden spaya, berberden cilt bakımına kadar özenle seçilmiş işletmeleri keşfedin.', 'From hair salons to spas, barbers to skin care: discover carefully selected businesses.'],
  },
  {
    image: 'https://images.pexels.com/photos/2521978/pexels-photo-2521978.jpeg?auto=compress&cs=tinysrgb&h=1200&w=940',
    icon: CalendarCheck,
    eyebrow: ['Randevu', 'Booking'],
    title: ['Saniyeler içinde, anlık uygunlukla', 'Book in seconds, with live availability'],
    text: ['Hizmetinizi, uzmanınızı ve saatinizi seçin. Dolu saatler otomatik olarak gizlenir.', 'Choose your service, specialist and time. Taken times are hidden automatically.'],
  },
  {
    image: 'https://images.pexels.com/photos/6560271/pexels-photo-6560271.jpeg?auto=compress&cs=tinysrgb&h=1200&w=940',
    icon: ShieldCheck,
    eyebrow: ['Güven', 'Peace of mind'],
    title: ['Kapora ile yerinizi güvenceye alın', 'Secure your spot with a deposit'],
    text: ['Küçük bir kapora ile randevunuz kesinleşir, kalan tutarı işletmede ödersiniz.', 'A small deposit confirms your booking; you pay the rest at the business.'],
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
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-ink/40 lg:bg-gradient-to-r lg:from-transparent lg:via-ink/10 lg:to-ink" />
        <div className="absolute left-6 top-6">
          <Logo size="sm" />
        </div>
        <div className="absolute right-6 top-5 flex items-center gap-3">
          <LanguageToggle className="h-9 w-9 bg-ink/60" />
          <button onClick={() => finish('/kesfet')} className="text-xs tracking-wide text-white/80 transition hover:text-white">
            {tx('Atla', 'Skip')}
          </button>
        </div>
      </div>

      <div className="relative -mt-16 flex flex-col justify-between px-6 pb-10 sm:px-12 lg:mt-0 lg:justify-center lg:px-20">
        <div key={index} className="animate-fade-up">
          <span className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-500/40 bg-coal text-gold-400">
            <slide.icon className="h-5 w-5" strokeWidth={1.6} />
          </span>
          <p className="eyebrow mb-3">{tx(slide.eyebrow[0], slide.eyebrow[1])}</p>
          <h1 className="max-w-md font-display text-4xl leading-tight text-white sm:text-5xl">{tx(slide.title[0], slide.title[1])}</h1>
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
                {tx('Hesap Oluştur', 'Create account')}
              </Button>
              <Button size="lg" variant="outline" full onClick={() => finish('/giris')}>
                {tx('Giriş Yap', 'Sign in')}
              </Button>
            </div>
          ) : (
            <Button size="lg" full icon={<ArrowRight className="h-4 w-4" />} className="flex-row-reverse sm:w-auto" onClick={() => setIndex(index + 1)}>
              {tx('Devam Et', 'Continue')}
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
