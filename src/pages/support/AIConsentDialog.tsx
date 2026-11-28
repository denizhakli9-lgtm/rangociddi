import { Link } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { legalPath } from '@/lib/legal';
import { newTabClick } from '@/lib/platform';
import { tx } from '@/i18n/locale';

/**
 * Explicit opt-in for the AI support assistant (App Review 5.1.2(i), KVKK md. 9). Nothing is sent to OpenAI until the
 * user taps the accept button here; declining keeps the request with the human support team.
 * `creating`: shown while a new request is being started, so declining still starts it, without AI. Closing the dialog
 * (X, backdrop, Escape) only cancels.
 */
export function AIConsentDialog({ open, busy, creating, onAccept, onDecline, onClose }: { open: boolean; busy: boolean; creating: boolean; onAccept: () => void; onDecline: () => void; onClose: () => void }) {
  const notice = legalPath('aydinlatma-metni');
  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title={tx('Yapay zekâ asistanını kullanmak ister misiniz?', 'Would you like to use the AI assistant?')}
      subtitle={tx('İsteğe bağlıdır. Onay vermezseniz talebinizi destek ekibimiz yanıtlar.', 'Optional. If you do not agree, our support team answers your request.')}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onDecline} disabled={busy}>
            {creating ? tx('Hayır, doğrudan temsilciye yaz', 'No, write to a person') : tx('Vazgeç', 'Cancel')}
          </Button>
          <Button onClick={onAccept} loading={busy} icon={<Bot className="h-4 w-4" />}>{tx('Onaylıyorum, yapay zekâ ile devam et', 'I agree, continue with AI')}</Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed text-mist">
        <ul className="list-disc space-y-1.5 pl-5 marker:text-gold-500">
          <li>{tx('İlk yanıtı yapay zekâ asistanı hazırlar; çözemediği konular destek ekibine aktarılır.', 'The AI assistant prepares the first reply and passes anything it cannot solve to the support team.')}</li>
          <li>
            <strong className="font-semibold text-white">{tx('Paylaşılan veri: ', 'What is shared: ')}</strong>
            {tx('destek taleplerinizde yazdığınız mesajların metni. Gönderimden önce e-posta adresleri, telefon, IBAN, kart ve kimlik numaraları ile rezervasyon kodları maskelenir. Adınız, hesap bilgileriniz ve talep konusu gönderilmez.', 'the text of the messages you write in your requests. Emails, phone numbers, IBANs, card and ID numbers and booking codes are masked before sending. Your name, account details and the request topic are not sent.')}
          </li>
          <li>
            <strong className="font-semibold text-white">{tx('Paylaşılan taraf: ', 'Shared with: ')}</strong>
            {tx('yurt dışındaki hizmet sağlayıcımız OpenAI, L.L.C. (ABD). Mesajlar yalnızca yanıt üretmek için işlenir.', 'our provider abroad, OpenAI, L.L.C. (USA). Messages are processed only to produce a reply.')}
          </li>
          <li>{tx('Ödeme, iade, şifre, şikâyet, KVKK ve sağlık konuları yapay zekâya gönderilmeden doğrudan temsilciye aktarılır. Mesajlarınıza ad, adres, kart, şifre veya sağlık bilgisi yazmayın.', 'Payments, refunds, passwords, complaints, data protection and health go straight to a person without reaching the AI. Do not write your name, address, card, password or health details.')}</li>
          <li>{tx('Onayınız, geri çekene kadar sonraki tüm destek talepleriniz için geçerlidir.', 'Your consent applies to all your future support requests until you withdraw it.')}</li>
          <li>{tx('Onayınızı Yardım ve Destek sayfasından istediğiniz zaman geri çekebilirsiniz; açık konuşmalarınız o zaman temsilciye aktarılır.', 'You can withdraw your consent at any time on the Help & support page; your open conversations then go to a person.')}</li>
        </ul>
        <p className="text-xs text-mist-2">
          {tx('Ayrıntılar:', 'Details:')}{' '}
          <Link to={notice} target="_blank" onClick={newTabClick(notice)} rel="noopener noreferrer" className="text-gold-400 underline underline-offset-2 hover:text-gold-300">
            {tx('KVKK Aydınlatma Metni', 'Privacy Notice (KVKK)')}
          </Link>
        </p>
      </div>
    </Modal>
  );
}
