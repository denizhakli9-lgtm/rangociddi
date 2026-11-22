import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, ChevronRight, Heart, LayoutDashboard, LogOut, MapPin, Phone, ShieldCheck, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { isPhone } from '@/lib/validation';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { useUserLocation } from '@/contexts/LocationContext';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/i18n/I18nProvider';
import { Avatar, RangoSignature } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { ThemeSelect } from '@/components/ui/ThemeSelect';
import { LanguageSelect } from '@/components/ui/LanguageToggle';
import { Input, Select } from '@/components/ui/Field';
import type { Gender } from '@/lib/types';
import { WhatsAppIcon } from '@/components/WhatsAppSupport';
import { WHATSAPP_SUPPORT, whatsAppLinkProps } from '@/lib/whatsapp';
import { PrivacyPanel } from './PrivacyPanel';
import { tx } from '@/i18n/locale';

export default function Profile() {
  const t = useT();
  const { profile, refreshProfile, signOut } = useAuth();
  const { location } = useUserLocation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', phone: '', gender: 'unspecified' as Gender });
  const [errors, setErrors] = useState<{ full_name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name, phone: profile.phone ?? '', gender: profile.gender });
  }, [profile]);

  if (!profile) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (form.full_name.trim().length < 3) next.full_name = t.validation.name;
    if (form.phone && !isPhone(form.phone)) next.phone = t.validation.phone;
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: form.full_name.trim(), phone: form.phone.trim() || null, gender: form.gender }).eq('id', profile.id);
    setSaving(false);
    if (error) return toast(friendlyError(error), 'error');
    await refreshProfile();
    toast(t.common.saved, 'success');
  };

  const links = [
    ...(profile.role === 'customer'
      ? [
          { to: '/randevularim', label: tx('Randevularım', 'My bookings'), icon: CalendarDays },
          { to: '/favoriler', label: tx('Favorilerim', 'My favourites'), icon: Heart },
        ]
      : []),
    ...(profile.role === 'business' ? [{ to: '/isletme', label: tx('İşletme Paneli', 'Business panel (Turkish)'), icon: LayoutDashboard }] : []),
    ...(profile.role === 'admin' ? [{ to: '/yonetim', label: tx('Yönetim Paneli', 'Admin panel (Turkish)'), icon: ShieldCheck }] : []),
    { to: '/destek', label: tx('Yardım ve Destek', 'Help & support'), icon: Phone },
    { to: '/bildirimler', label: t.nav.notifications, icon: Bell },
    { to: '/konum', label: `${tx('Konum', 'Location')} · ${location.label}`, icon: MapPin },
  ];

  return (
    <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-4">
        <div className="card-gold flex flex-col items-center p-6 text-center">
          <Avatar name={profile.full_name || 'R'} src={profile.avatar_url} size="h-20 w-20 text-2xl" />
          <p className="mt-4 font-display text-2xl text-white">{profile.full_name}</p>
          <p className="text-xs text-mist-2">{profile.email}</p>
          <span className="mt-3 rounded-full border border-gold-500/40 px-3 py-1 text-[11px] text-gold-300">{t.role[profile.role]}</span>
          <p className="mt-3 text-[11px] text-mist-3">{tx('Üyelik:', 'Member since')} {formatDate(profile.created_at, { month: 'long', year: 'numeric' })}</p>
        </div>
        <nav className="card divide-y divide-line overflow-hidden">
          {links.map(({ to, label, icon: Icon }) => (
            <Fragment key={to}>
              <Link to={to} className="flex items-center gap-3 px-5 py-3.5 text-sm text-mist transition hover:bg-white/[0.03] hover:text-white">
                <Icon className="h-4 w-4 text-gold-500" />
                <span className="flex-1">{label}</span>
                <ChevronRight className="h-4 w-4 text-mist-3" />
              </Link>
              {/* The 24/7 WhatsApp line; on phones this is the only way in (the floating button is computer-only). */}
              {to === '/destek' && (
                <a {...whatsAppLinkProps} className="flex items-center gap-3 px-5 py-3.5 text-sm text-mist transition hover:bg-white/[0.03] hover:text-white">
                  <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                  <span className="flex-1">
                    <span className="block">{tx('WhatsApp Destek Hattı · 7/24', 'WhatsApp support · 24/7')}</span>
                    <span className="block text-xs text-mist-2">{WHATSAPP_SUPPORT.display}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-mist-3" />
                </a>
              )}
            </Fragment>
          ))}
          <button
            onClick={async () => {
              await signOut();
              navigate('/giris');
            }}
            className="flex w-full items-center gap-3 px-5 py-3.5 text-sm text-error-300 transition hover:bg-error-500/5"
          >
            <LogOut className="h-4 w-4" />
            {t.nav.signOut}
          </button>
        </nav>
        <LanguageSelect />
        <ThemeSelect />
        <RangoSignature className="pt-2 text-center" />
      </aside>

      <section>
        <p className="eyebrow mb-2">{t.nav.profile}</p>
        <h1 className="mb-6 font-display text-4xl text-white">{tx('Kişisel bilgiler', 'Personal details')}</h1>
        <form onSubmit={save} className="card space-y-5 p-6" noValidate>
          <Input label={tx('Ad Soyad', 'Full name')} name="full_name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} error={errors.full_name} icon={<User className="h-4 w-4" />} />
          <Input label={tx('E-posta', 'Email')} value={profile.email ?? ''} disabled hint={tx('E-posta adresi değiştirilemez.', 'The email address cannot be changed.')} />
          <Input label={tx('Telefon', 'Phone')} name="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} icon={<Phone className="h-4 w-4" />} />
          <Select label={tx('Cinsiyet', 'Gender')} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as Gender })} hint={tx('Keşfet sayfasındaki önerileri kişiselleştirir.', 'Personalises the suggestions on the Discover page.')}>
            {(Object.keys(t.gender) as Gender[]).map((g) => <option key={g} value={g}>{t.gender[g]}</option>)}
          </Select>
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>{t.common.save}</Button>
          </div>
        </form>
        <PrivacyPanel profile={profile} />
      </section>
    </div>
  );
}
