import type { ReactNode } from 'react';
import type { AppointmentStatus, BusinessStatus, PaymentStatus, PayoutAccountStatus } from '@/lib/types';
import { tr } from '@/i18n/tr';

type Tone = 'gold' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

const tones: Record<Tone, string> = {
  gold: 'border-gold-500/40 bg-gold-500/10 text-gold-300',
  success: 'border-success-500/30 bg-success-900/60 text-success-300',
  warning: 'border-warning-500/30 bg-warning-900/60 text-warning-300',
  error: 'border-error-500/30 bg-error-900/60 text-error-300',
  info: 'border-info-500/30 bg-info-900/60 text-info-300',
  neutral: 'border-line bg-coal-3 text-mist',
};

export function Badge({ tone = 'neutral', children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

const apptTone: Record<AppointmentStatus, Tone> = {
  pending_payment: 'warning',
  pending_approval: 'info',
  confirmed: 'success',
  completed: 'gold',
  cancelled: 'neutral',
  rejected: 'error',
  no_show: 'error',
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge tone={apptTone[status]}>{tr.appointmentStatus[status]}</Badge>;
}

const payTone: Record<PaymentStatus, Tone> = {
  pending: 'warning',
  paid: 'success',
  failed: 'error',
  cancelled: 'neutral',
  refund_pending: 'info',
  refunded: 'gold',
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={payTone[status]}>{tr.paymentStatus[status]}</Badge>;
}

/** Marks a payment made in test mode: no money was charged to (or refunded to) a card. */
export function TestBadge({ label = 'Test' }: { label?: string }) {
  return (
    <span title="Test ödemesi: karttan gerçek tahsilat yapılmadı." className="inline-flex">
      <Badge tone="warning">{label}</Badge>
    </span>
  );
}

const bizTone: Record<BusinessStatus, Tone> = { pending: 'warning', approved: 'success', rejected: 'error', suspended: 'neutral' };

export function BusinessStatusBadge({ status }: { status: BusinessStatus }) {
  return <Badge tone={bizTone[status]}>{tr.businessStatus[status]}</Badge>;
}

const payoutTone: Record<PayoutAccountStatus, Tone> = { pending: 'warning', verified: 'success', rejected: 'error' };
const payoutLabel: Record<PayoutAccountStatus, string> = { pending: 'Onay bekliyor', verified: 'Onaylandı', rejected: 'Reddedildi' };

export function PayoutStatusBadge({ status }: { status: PayoutAccountStatus | null }) {
  if (!status) return <Badge tone="neutral">IBAN eklenmedi</Badge>;
  return <Badge tone={payoutTone[status]}>{payoutLabel[status]}</Badge>;
}
