import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronDown, Circle, MessageCircleQuestion, Megaphone } from 'lucide-react';
import { dateKey, formatDate, formatTRY } from '@/lib/format';
import { setupGaps, type FieldAgentBusiness } from '@/lib/fieldAgent';

/**
 * "Bugün ne yapmalıyım?" — the field agent's daily routine for introducing Rango to salons.
 *
 * The ticks are a per-device convenience (localStorage, one key per agent and day): they reset
 * every morning and are never needed by anyone else. The selling points only repeat what the
 * business panel really offers (see src/lib/seo/pages/forBusiness.ts); no commission figure is
 * given because it is changed from the admin panel.
 */

const STORE_PREFIX = 'rango.field.plan.';

type StepId = 'route' | 'pitch' | 'signup' | 'setup' | 'review' | 'followup';

interface Step {
  id: StepId;
  title: string;
  text: ReactNode;
  status?: { label: string; to?: string; tone: 'todo' | 'ok' };
}

function loadTicks(key: string): StepId[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed.filter((x) => typeof x === 'string') as StepId[]) : [];
  } catch {
    return [];
  }
}

function saveTicks(key: string, ticks: StepId[]): void {
  try {
    // Only today's list is kept: drop earlier days so the storage never grows.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORE_PREFIX) && k !== key) localStorage.removeItem(k);
    }
    localStorage.setItem(key, JSON.stringify(ticks));
  } catch {
    /* storage blocked: the ticks simply last until the page is closed */
  }
}

const PITCH: string[] = [
  'Müşterileriniz günün her saatinde online randevu alır; yalnızca gerçekten boş olan saatler görünür, aynı uzmana aynı saatte iki randevu verilmez.',
  'Kapora alıp almamaya, tutarına ve ücretsiz iptal süresine siz karar verirsiniz; gelmeyen müşteri riskini azaltırsınız.',
  'Randevuları otomatik onaylayabilir ya da her talebi kendiniz onaylayabilirsiniz.',
  'Hizmetler, fiyatlar, ekibiniz, müşteri geçmişi ve kazancınız tek panelde.',
  'Fotoğraflar, harita konumu, hizmetler ve çalışma saatleriyle size ait bir işletme sayfası olur; onaylandıktan sonra arama motorlarında da görünür.',
  'Yorumları yalnızca randevusu tamamlanan müşteriler yazabilir; yorumlara herkese açık yanıt verebilirsiniz.',
];

const OBJECTIONS: { q: string; a: string }[] = [
  {
    q: '“Ücreti ne kadar?”',
    a: 'Komisyon yalnızca tamamlanan randevulardan alınır. Güncel oranı yöneticinize sorup öyle söyleyin; tahmini rakam vermeyin. İşletme oranı panelindeki Kazanç & Komisyon ekranında da görür.',
  },
  {
    q: '“Müşteri randevu alıp gelmezse?”',
    a: 'Kapora isteyebilir ve ücretsiz iptal süresini kendisi belirleyebilir. Aynı gün için gelen talepler her zaman onayına düşer.',
  },
  {
    q: '“Bu işlerle uğraşacak vaktim yok.”',
    a: 'Kurulumu şimdi birlikte yapmayı önerin: hizmetler, çalışanlar ve çalışma saatleri girildikten sonra randevular kendiliğinden düşer.',
  },
  {
    q: '“Müşterim zaten var, neden gereksin?”',
    a: 'Mevcut müşteriler de telefonla aramak yerine boş saati görüp randevu alır; işletme sayfasını Instagram ve WhatsApp’tan paylaşabilirler.',
  },
];

export function FieldDailyPlan({ code, bonusAmount, businesses, onShare }: { code: string; bonusAmount: number; businesses: FieldAgentBusiness[] | null; onShare: () => void }) {
  const today = dateKey();
  const storeKey = `${STORE_PREFIX}${code}.${today}`;
  const [ticks, setTicks] = useState<StepId[]>(() => loadTicks(storeKey));

  // A tab left open overnight starts the new day with an empty list.
  useEffect(() => setTicks(loadTicks(storeKey)), [storeKey]);

  const toggle = (id: StepId) =>
    setTicks((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveTicks(storeKey, next);
      return next;
    });

  const facts = useMemo(() => {
    const list = businesses ?? [];
    return {
      today: list.filter((b) => dateKey(new Date(b.referred_at)) === today).length,
      pending: list.filter((b) => b.status === 'pending').length,
      incomplete: list.filter((b) => b.status !== 'rejected' && setupGaps(b).length > 0).length,
      noBookings: list.filter((b) => b.status === 'approved' && b.booking_count === 0).length,
    };
  }, [businesses, today]);

  const known = businesses !== null;
  const steps: Step[] = [
    {
      id: 'route',
      title: 'Rotanızı planlayın',
      text: 'Bugün aynı semtte ziyaret edeceğiniz 8–10 kuaför, berber ya da güzellik salonunu belirleyin. Salonların sakin olduğu saatleri (genelde öğleden önce) seçin; müşterisi olan işletmeyi bekletmeyin, uygun zamanı sorup tekrar uğrayın.',
    },
    {
      id: 'pitch',
      title: 'Kendinizi tanıtın, Rango’yu bir dakikada anlatın',
      text: 'Rango ekibinden olduğunuzu söyleyin ve işletme sahibine ya da yetkiliye ulaşın. Aşağıdaki “Tanıtırken anlatın” maddelerinden işletmeye en uygun ikisi üçüyle başlayın, telefonunuzdan Rango’daki bir işletme sayfasını gösterin.',
    },
    {
      id: 'signup',
      title: 'Kaydı yerinde yaptırın',
      text: (
        <>
          Bağlantınızı işletmenin telefonuna gönderin{' '}
          <button type="button" onClick={onShare} className="text-gold-400 underline-offset-2 hover:underline">
            (paylaş)
          </button>
          . Bağlantısız kayıtta hesap türü “İşletme” seçilmeli ve kurulumun ilk adımındaki “Referans kodu” alanına <span className="font-mono text-white">{code}</span> yazılmalı; kod girilmezse işletme size yazılmaz. E-postası olmayan işletme sahibi kayıt ekranında “Telefon numarası”nı seçip kendi cep numarasıyla kaydolabilir. Şifreyi işletme sahibi kendisi belirlesin ve not etsin; şifreyi siz belirlemeyin, sormayın, hesaba kendi e-postanızı ya da telefonunuzu yazmayın. Şifre unutulursa WhatsApp destek hattı yardımcı olur.
        </>
      ),
      status: known ? { label: facts.today ? `Bugün kodunuzla ${facts.today} işletme kaydoldu` : 'Bugün henüz kayıt yok', tone: facts.today ? 'ok' : 'todo' } : undefined,
    },
    {
      id: 'setup',
      title: 'Kurulumu birlikte tamamlayın',
      text: 'Ayrılmadan önce hizmetler ve fiyatlar, en az bir çalışan, çalışma saatleri, kapak görseli, açık adres ve kısa bir açıklama girilsin. Eksik kurulumlu işletmede müşteri randevu alamaz.',
      status: known
        ? facts.incomplete
          ? { label: `${facts.incomplete} işletmede eksik var`, to: '/saha/isletmeler', tone: 'todo' }
          : { label: 'Eksik kurulum yok', tone: 'ok' }
        : undefined,
    },
    {
      id: 'review',
      title: 'Başvuruları inceleyip onaylayın',
      text: `İşletme adı, adresi ve hizmetleri doğruysa başvuruyu onaylayın; işletme hemen yayına alınır. Onaylanan her işletme için ${formatTRY(bonusAmount)} prim kazanırsınız. Bilgiler yanlışsa düzeltmesini isteyin, gerekirse nedenini yazarak reddedin.`,
      status: known
        ? facts.pending
          ? { label: `${facts.pending} başvuru onayınızı bekliyor`, to: '/saha/isletmeler', tone: 'todo' }
          : { label: 'Bekleyen başvuru yok', tone: 'ok' }
        : undefined,
    },
    {
      id: 'followup',
      title: 'Gün sonunda takip edin',
      text: 'Kurulumu yarım kalan ya da yayında olup henüz randevu almamış işletmeleri arayın; işletme sayfalarını Instagram ve WhatsApp’tan müşterileriyle paylaşmalarını önerin. Tekrar uğramanızı isteyenleri yarının rotasına ekleyin.',
      status: known && facts.noBookings ? { label: `${facts.noBookings} işletme henüz randevu almadı`, to: '/saha/isletmeler', tone: 'todo' } : undefined,
    },
  ];

  const done = steps.filter((s) => ticks.includes(s.id)).length;

  return (
    <section className="card mb-8 p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">{formatDate(new Date().toISOString(), { day: 'numeric', month: 'long', weekday: 'long' })}</p>
          <h2 className="text-lg font-semibold tracking-tight text-white">Bugün ne yapmalısınız?</h2>
        </div>
        <p className="text-xs text-mist-2" aria-live="polite">
          {done === steps.length ? 'Bugünlük hepsi tamam, elinize sağlık!' : `${done}/${steps.length} adım tamamlandı`}
        </p>
      </div>

      <ol className="space-y-3">
        {steps.map((s, i) => {
          const checked = ticks.includes(s.id);
          return (
            <li key={s.id} className="flex gap-3 rounded-2xl border border-line-soft p-4">
              <button
                type="button"
                onClick={() => toggle(s.id)}
                aria-pressed={checked}
                aria-label={`${s.title}: ${checked ? 'yapıldı işaretini kaldır' : 'yapıldı olarak işaretle'}`}
                className="mt-0.5 shrink-0 self-start text-gold-400 transition hover:text-gold-300"
              >
                {checked ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5 text-mist-2" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${checked ? 'text-mist-2 line-through' : 'text-white'}`}>
                  {i + 1}. {s.title}
                </p>
                <p className="mt-1 text-sm text-mist">{s.text}</p>
                {s.status &&
                  (s.status.to ? (
                    <Link to={s.status.to} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-warning-300 hover:underline">
                      {s.status.label} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <p className={`mt-2 text-xs ${s.status.tone === 'ok' ? 'text-gold-400' : 'text-mist-2'}`}>{s.status.label}</p>
                  ))}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 space-y-3">
        <details className="group rounded-2xl border border-line-soft p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-white">
            <Megaphone className="h-4 w-4 text-gold-400" />
            Tanıtırken anlatın
            <ChevronDown className="ml-auto h-4 w-4 text-mist-2 transition group-open:rotate-180" />
          </summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-mist">
            {PITCH.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
        <details className="group rounded-2xl border border-line-soft p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-white">
            <MessageCircleQuestion className="h-4 w-4 text-gold-400" />
            Sık duyacağınız sorular
            <ChevronDown className="ml-auto h-4 w-4 text-mist-2 transition group-open:rotate-180" />
          </summary>
          <dl className="mt-3 space-y-3 text-sm">
            {OBJECTIONS.map((o) => (
              <div key={o.q}>
                <dt className="font-medium text-white">{o.q}</dt>
                <dd className="mt-0.5 text-mist">{o.a}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </section>
  );
}
