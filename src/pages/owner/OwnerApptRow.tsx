import { ChevronRight, MessageCircle } from 'lucide-react';
import { AppointmentStatusBadge, Badge } from '@/components/ui/Badge';
import { awaitsOwnerDecision } from './ownerApi';
import { formatDate, formatTime, formatTRY } from '@/lib/format';
import type { Appointment } from '@/lib/types';

export function OwnerApptRow({ appt, onOpen, showDate, unread = 0 }: { appt: Appointment; onOpen: (a: Appointment) => void; showDate?: boolean; unread?: number }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(appt)}
      className="card group flex w-full items-center gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:border-gold-500/40"
    >
      <div className="flex w-16 shrink-0 flex-col items-center rounded-xl border border-line bg-ink/50 py-2">
        <span className="text-base font-semibold text-white">{formatTime(appt.starts_at)}</span>
        {showDate ? (
          <span className="text-[10px] uppercase tracking-wider text-mist-2">{formatDate(appt.starts_at, { day: 'numeric', month: 'short' })}</span>
        ) : (
          <span className="text-[10px] text-mist-2">{appt.duration_minutes} dk</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white">{appt.profiles?.full_name ?? 'Müşteri'}</p>
        <p className="truncate text-xs text-mist-2">
          {appt.service_name} · {appt.employee_name}
        </p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="text-sm text-white">{formatTRY(appt.total_price)}</p>
        <p className="text-[11px] text-mist-2">Kalan {formatTRY(appt.remaining_amount)}</p>
      </div>
      {unread > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-gold-500/15 px-2 py-0.5 text-[11px] font-semibold text-gold-300" aria-label={`${unread} okunmamış mesaj`}>
          <MessageCircle className="h-3 w-3" /> {unread}
        </span>
      )}
      {awaitsOwnerDecision(appt) ? <Badge tone="info">Yanıtınızı bekliyor</Badge> : <AppointmentStatusBadge status={appt.status} />}
      <ChevronRight className="h-4 w-4 shrink-0 text-mist-3 transition group-hover:translate-x-0.5 group-hover:text-gold-400" />
    </button>
  );
}
