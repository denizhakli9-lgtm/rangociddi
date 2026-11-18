import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, ShieldCheck } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { downloadBlob, exportMyData } from '@/lib/privacy';
import { legalPath } from '@/lib/legal';
import type { Profile } from '@/lib/types';
import { DeleteAccount } from './DeleteAccount';
import { tx } from '@/i18n/locale';

export function PrivacyPanel({ profile }: { profile: Profile }) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await exportMyData(profile);
      downloadBlob(blob, `${tx('rango-verilerim', 'rango-my-data')}-${new Date().toISOString().slice(0, 10)}.json`);
      toast(tx('Verilerinizin kopyası indirildi.', 'A copy of your data has been downloaded.'), 'success');
    } catch {
      toast(tx('Veriler hazırlanamadı. Lütfen tekrar deneyin.', 'Your data could not be prepared. Please try again.'), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="mt-8">
      <p className="eyebrow mb-2">KVKK</p>
      <h2 className="mb-4 font-display text-3xl text-white">{tx('Verilerim ve gizlilik', 'My data & privacy')}</h2>
      <div className="card space-y-5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">{tx('Verilerimin kopyasını indir', 'Download a copy of my data')}</p>
            <p className="mt-0.5 text-xs text-mist-2">{tx('Profil, randevu, ödeme, yorum, favori, bildirim ve destek kayıtlarınızı JSON dosyası olarak indirin.', 'Download your profile, bookings, payments, reviews, favourites, notifications and support records as a JSON file.')}</p>
          </div>
          <Button variant="outline" onClick={exportData} loading={exporting} icon={<Download className="h-4 w-4" />} className="shrink-0">
            {tx('İndir', 'Download')}
          </Button>
        </div>
        <div className="grid gap-2 border-t border-line pt-5 sm:grid-cols-2">
          <Link to={legalPath('aydinlatma-metni')} className="flex items-center gap-2 text-sm text-mist transition hover:text-white">
            <FileText className="h-4 w-4 text-gold-500" /> {tx('KVKK Aydınlatma Metni', 'Privacy Notice (KVKK)')}
          </Link>
          <Link to={legalPath('kvkk-basvuru')} className="flex items-center gap-2 text-sm text-mist transition hover:text-white">
            <ShieldCheck className="h-4 w-4 text-gold-500" /> {tx('KVKK kapsamında başvuru yap', 'Submit a data request (KVKK)')}
          </Link>
        </div>
        <DeleteAccount profile={profile} />
      </div>
    </section>
  );
}
