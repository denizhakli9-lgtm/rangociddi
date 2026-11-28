import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Flag } from 'lucide-react';
import { reportContent } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { tx } from '@/i18n/locale';
import type { ReportReason, ReportTargetType } from '@/lib/types';

const NOTE_MAX = 500;

function reasonOptions(): { value: ReportReason; label: string }[] {
  return [
    { value: 'spam', label: tx('Spam veya reklam', 'Spam or advertising') },
    { value: 'harassment', label: tx('Hakaret veya taciz', 'Insults or harassment') },
    { value: 'inappropriate', label: tx('Uygunsuz içerik', 'Inappropriate content') },
    { value: 'fake', label: tx('Sahte veya yanıltıcı', 'Fake or misleading') },
    { value: 'other', label: tx('Diğer', 'Other') },
  ];
}

function targetTitle(type: ReportTargetType): string {
  switch (type) {
    case 'review':
      return tx('Yorumu şikâyet et', 'Report review');
    case 'review_reply':
      return tx('İşletme yanıtını şikâyet et', 'Report business reply');
    case 'message':
      return tx('Mesajı şikâyet et', 'Report message');
    default:
      return tx('İşletmeyi şikâyet et', 'Report business');
  }
}

interface Props {
  targetType: ReportTargetType;
  targetId: string;
  /** Visible label; defaults to "Şikâyet et / Report". */
  label?: ReactNode;
  /** Shows only the flag icon (the label stays available to screen readers). */
  iconOnly?: boolean;
  className?: string;
}

/**
 * "Şikâyet et" control for user-generated content (App Review guideline 1.2). Opens a small form
 * with a reason and an optional note; the report goes to the Rango moderators (admin panel →
 * Şikâyetler), who act on it within 24 hours. Signed-out visitors are asked to sign in first.
 */
export function ReportButton({ targetType, targetId, label, iconOnly, className }: Props) {
  const [open, setOpen] = useState(false);
  const text = label ?? tx('Şikâyet et', 'Report');
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={iconOnly ? targetTitle(targetType) : undefined}
        title={iconOnly ? targetTitle(targetType) : undefined}
        className={className ?? '-my-1.5 inline-flex min-h-8 items-center gap-1 text-[11px] text-mist-2 transition-colors hover:text-white'}
      >
        <Flag className="h-3 w-3 shrink-0" />
        {!iconOnly && <span>{text}</span>}
      </button>
      {/* Portalled: the button can sit inside another dialog (booking details), whose transform would trap a fixed overlay. */}
      {open && createPortal(<ReportDialog targetType={targetType} targetId={targetId} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ReportDialog({ targetType, targetId, onClose }: { targetType: ReportTargetType; targetId: string; onClose: () => void }) {
  const { session, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const signedIn = !!session && !!profile && !session.user.is_anonymous;

  // Escape closes only this dialog: the capture-phase window listener runs before the
  // document listener of a dialog underneath (booking details) and stops it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const submit = async () => {
    if (!reason || sending) return;
    setSending(true);
    try {
      await reportContent(targetType, targetId, reason, note);
      toast(tx('Şikâyetiniz alındı. Ekibimiz en geç 24 saat içinde inceleyecek.', 'Report received. Our team will review it within 24 hours.'), 'success');
      onClose();
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setSending(false);
    }
  };

  const signIn = () => {
    onClose();
    navigate(`/giris?sonra=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={targetTitle(targetType)}
      subtitle={signedIn ? tx('Şikâyetler Rango ekibi tarafından en geç 24 saat içinde incelenir.', 'Reports are reviewed by the Rango team within 24 hours.') : undefined}
      footer={
        signedIn ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>{tx('Vazgeç', 'Cancel')}</Button>
            <Button loading={sending} disabled={!reason} onClick={submit}>{tx('Gönder', 'Send')}</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>{tx('Vazgeç', 'Cancel')}</Button>
            <Button onClick={signIn}>{tx('Giriş yap', 'Sign in')}</Button>
          </div>
        )
      }
    >
      {signedIn ? (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-white">{tx('Neden şikâyet ediyorsunuz?', 'Why are you reporting this?')}</legend>
            <div className="space-y-2">
              {reasonOptions().map((o) => (
                <label key={o.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${reason === o.value ? 'border-white/60 bg-white/[0.04] text-white' : 'border-line text-mist hover:border-white/30'}`}>
                  <input type="radio" name="report-reason" value={o.value} checked={reason === o.value} onChange={() => setReason(o.value)} className="accent-current" />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Textarea
            label={tx('Açıklama (isteğe bağlı)', 'Details (optional)')}
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tx('Sorunu kısaca anlatın…', 'Briefly describe the problem…')}
          />
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-mist">
          {tx('Şikâyet gönderebilmek için giriş yapmanız gerekir. Acil durumlarda destek ekibimize de yazabilirsiniz.', 'Please sign in to send a report. You can also contact our support team.')}
        </p>
      )}
    </Modal>
  );
}
