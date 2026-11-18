import type { Locale } from '@/i18n/locale';

const slogans: Record<Locale, string[]> = {
  tr: [
    'Randevunun yeni yolu.',
    "Planla, Rango'la!",
    'Randevun bir tık uzağında.',
    'Rango it. Book it.',
    "Rango'yla her şey takviminde.",
    'Sen seç, Rango ayarlasın.',
    'Randevuda yeni bir dönem.',
  ],
  en: [
    'The new way to book.',
    'Plan it. Rango it.',
    'Your next booking, one tap away.',
    'Rango it. Book it.',
    'Everything in your calendar with Rango.',
    'You choose, Rango arranges.',
    'A new era of booking.',
  ],
};

/** The slogan at `index` in the given language. */
export function sloganFor(index: number, locale: Locale): string {
  const list = slogans[locale];
  return list[((index % list.length) + list.length) % list.length];
}

/** Index of the slogan for this visit: each visit shows the next one in turn. */
export function nextVisitSlogan(): number {
  const count = slogans.tr.length;
  let index = 0;
  try {
    const previous = localStorage.getItem('rango.slogan');
    const parsed = previous === null ? -1 : Number(previous);
    if (Number.isInteger(parsed) && parsed >= -1 && parsed < count) {
      index = (parsed + 1) % count;
    }
    localStorage.setItem('rango.slogan', String(index));
  } catch {
    index = Math.floor(Math.random() * count);
  }
  return index;
}
