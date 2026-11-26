import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight, Download, Languages, Mail, MessageCircle } from 'lucide-react';
import { COMPANY, LEGAL_LINKS, isPlaceholder, legalPath, type LegalSlug } from '@/lib/legal';
import { LEGAL_DOCUMENTS, type LegalBlock } from './legalContent';
import { isEnglish, tx } from '@/i18n/locale';
import { whatsAppLinkProps } from '@/lib/whatsapp';

function Block({ block }: { block: LegalBlock }) {
  // Contract text is set at 16px (≈12 pt), the minimum size consumer law asks for (TKHK md. 4).
  if (block.kind === 'p') return <p className="text-base leading-relaxed text-mist">{block.text}</p>;
  if (block.kind === 'ul') {
    return (
      <ul className="list-disc space-y-1.5 pl-5 text-base leading-relaxed text-mist marker:text-gold-500">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-mist-2">
          <tr>
            {block.head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {block.rows.map((row) => (
            <tr key={row.join('|')} className="align-top">
              {row.map((cell, i) => (
                <td key={i} className={`px-4 py-3 ${i === 0 ? 'font-medium text-white' : 'text-mist'} ${isPlaceholder(cell) ? 'text-warning-300' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeletionHelper() {
  const target = COMPANY.kvkkEmail;
  if (isPlaceholder(target)) return null;
  const body = ['Merhaba,', '', 'Rango hesabımın silinmesini talep ediyorum.', '', 'Hesabımda kayıtlı e-posta adresi veya telefon numarası:', ''].join('\n');
  const href = `mailto:${target}?subject=${encodeURIComponent('Hesap silme talebi')}&body=${encodeURIComponent(body)}`;
  return (
    <div className="card-gold flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-mist">{tx('Uygulamaya erişemiyorsanız silme talebinizi e-postayla veya, telefon numarasıyla üye olduysanız, bu numaradan WhatsApp destek hattımıza yazarak iletebilirsiniz. Talebiniz en geç 30 gün içinde sonuçlandırılır.', 'If you cannot access the app, you can request deletion by email or, if you signed up with a phone number, by messaging our WhatsApp support line from that number. Your request will be completed within 30 days.')}</p>
      <div className="flex shrink-0 flex-wrap gap-2">
        <a href={href} className="inline-flex items-center gap-2 rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink transition hover:bg-gold-400">
          <Mail className="h-4 w-4" /> {tx('Silme talebi gönder', 'Request deletion')}
        </a>
        <a {...whatsAppLinkProps('Hesap silme talebi')} className="inline-flex items-center gap-2 rounded-full border border-gold-500/40 px-4 py-2 text-xs font-semibold text-gold-400 transition hover:bg-gold-500/10">
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
      </div>
    </div>
  );
}

function ApplicationHelper() {
  const target = COMPANY.kvkkEmail;
  if (isPlaceholder(target)) return null;
  const body = [
    'Sayın Veri Sorumlusu,',
    '',
    '6698 sayılı KVKK md. 11 kapsamında aşağıdaki talebimin değerlendirilmesini rica ederim.',
    '',
    'Ad Soyad:',
    'T.C. Kimlik No (yabancılar için uyruk ve pasaport no):',
    'Tebligat adresi:',
    'Telefon:',
    'Hesabımda kayıtlı e-posta adresi veya telefon numarası:',
    '',
    'Talebim:',
    '',
  ].join('\n');
  const href = `mailto:${target}?subject=${encodeURIComponent('KVKK Kapsamında Bilgi Talebi')}&body=${encodeURIComponent(body)}`;
  return (
    <div className="card-gold flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-mist">{tx('Başvuru şablonunu e-posta uygulamanızda hazır olarak açabilirsiniz. Gönderdiğiniz e-posta dışında hiçbir bilgi bu sayfa üzerinden kaydedilmez.', 'You can open a ready-made request template in your email app (in Turkish; you may write your request in English). Nothing is saved through this page apart from the email you send.')}</p>
      <a href={href} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink transition hover:bg-gold-400">
        <Mail className="h-4 w-4" /> {tx('Başvuru e-postası oluştur', 'Create request email')}
      </a>
    </div>
  );
}

export default function LegalPage() {
  const { slug } = useParams();
  const doc = slug ? LEGAL_DOCUMENTS[slug as LegalSlug] : undefined;

  if (!doc) return <Navigate to={legalPath('aydinlatma-metni')} replace />;

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[220px_1fr]">
      <nav aria-label={tx('Yasal metinler', 'Legal texts')} className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <ul className="card divide-y divide-line overflow-hidden">
          {LEGAL_LINKS.map((l) => (
            <li key={l.slug}>
              <Link
                to={legalPath(l.slug)}
                aria-current={l.slug === doc.slug ? 'page' : undefined}
                className={`flex items-center gap-2 px-4 py-3 text-sm transition hover:bg-white/[0.03] ${l.slug === doc.slug ? 'text-gold-400' : 'text-mist hover:text-white'}`}
              >
                <span className="flex-1">{tx(l.label, l.labelEn)}</span>
                <ChevronRight className="h-4 w-4 text-mist-3" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <article className="min-w-0 space-y-8">
        {isEnglish() && (
          <p lang="en" className="flex items-start gap-2 rounded-2xl border border-gold-500/30 bg-gold-500/5 px-4 py-3 text-xs leading-relaxed text-mist">
            <Languages className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
            <span>
              This legal text is published in Turkish, which is the legally binding version.{' '}
              {doc.slug === 'hesap-silme' ? 'An English summary is at the end of this page.' : 'It has not been translated into English.'}
              {' '}For questions, contact us using the details on the{' '}
              <Link to={legalPath('kunye')} className="text-gold-400 hover:text-gold-300">Company &amp; Contact</Link> page.
            </span>
          </p>
        )}
        <header lang="tr">
          <p className="eyebrow mb-2">{doc.eyebrow}</p>
          <h1 className="font-display text-3xl text-white sm:text-4xl">{doc.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mist-2">{doc.summary}</p>
        </header>

        {doc.slug === 'kvkk-basvuru' && <ApplicationHelper />}
        {doc.slug === 'hesap-silme' && <DeletionHelper />}
        {doc.slug === 'aydinlatma-metni' && (
          <p className="flex items-center gap-2 text-xs text-mist-2">
            <Download className="h-3.5 w-3.5 text-gold-500" />
            {tx('Hesabınıza ait verilerin kopyasını ', 'You can download a copy of your account data from the ')}<Link to="/profil" className="text-gold-400 hover:text-gold-300">{tx('Profil', 'Profile')}</Link>{tx(' sayfasından indirebilirsiniz.', ' page.')}
          </p>
        )}

        {doc.sections.map((section) => (
          <section key={section.title} lang="tr" className="space-y-3">
            <h2 className="font-display text-2xl text-white">{section.title}</h2>
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
