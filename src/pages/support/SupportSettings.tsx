import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';

export default function SupportSettings({ online, reload }: { online: boolean; reload: () => Promise<void> }) {
  const [knowledge, setKnowledge] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.rpc('support_get_config').then(({ data, error }) => {
      if (!active) return;
      if (error || typeof data !== 'string') { setNotice('Yardım metni yüklenemedi. Sayfayı yenileyerek tekrar dene.'); return; }
      setKnowledge(data); setLoaded(true);
    });
    return () => { active = false; };
  }, []);
  const save = async (mode: 'online' | 'knowledge' | 'agent' | 'remove') => {
    setBusy(true); setNotice('');
    const { error } = await supabase.rpc('support_admin_config', { p_online: mode === 'online' ? !online : online, p_knowledge: mode === 'knowledge' ? knowledge : null, p_email: mode === 'agent' || mode === 'remove' ? email : null, p_remove: mode === 'remove' });
    setBusy(false);
    if (error) { setNotice('Kaydedilemedi. Görevli için kayıtlı hesap e-postasını kontrol et.'); return; }
    setNotice('Kaydedildi.'); await reload();
  };
  return <details className="card p-4"><summary className="cursor-pointer text-sm font-semibold text-white">Destek ekibi ve yapay zekâ ayarları</summary><div className="mt-4 grid gap-6 md:grid-cols-2">
    <div className="space-y-3"><Button variant="outline" loading={busy} onClick={() => save('online')}>{online ? 'Ekibi çevrimdışı göster' : 'Ekibi çevrimiçi göster'}</Button><p className="text-xs text-mist">Çalışma saatleri belirlenmedi; ekibin hazır olduğunda bu durumu değiştir.</p><label className="block text-sm text-white" htmlFor="agent-email">Destek görevlisinin kayıtlı e-postası</label><input id="agent-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /><div className="flex flex-wrap gap-2"><Button disabled={!email.trim()} loading={busy} onClick={() => save('agent')}>Yetki ver</Button><Button variant="outline" disabled={!email.trim()} loading={busy} onClick={() => { if (window.confirm('Bu hesabın destek erişimi kaldırılsın mı?')) void save('remove'); }}>Yetkiyi kaldır</Button></div><p className="text-xs text-mist">Görevli normal hesabıyla giriş yapıp profilindeki destek görevlisi girişini kullanır. Diğer yönetim alanlarına erişemez.</p></div>
    <div className="space-y-3"><label htmlFor="support-knowledge" className="block text-sm text-white">Yapay zekânın kullanacağı onaylı yardım metni</label><p id="support-knowledge-warning" className="text-xs text-warning-300">Bu metin yapay zekâ aracılığıyla müşterilere aynen aktarılabilir; iç talimat, kişisel veri veya gizli kural yazma.</p><textarea id="support-knowledge" aria-describedby="support-knowledge-warning" disabled={!loaded} maxLength={20000} className="input min-h-40" value={knowledge} onChange={(e) => setKnowledge(e.target.value)} placeholder="Müşterilere verilecek onaylı yanıtları buraya yaz." /><Button disabled={!loaded || !knowledge.trim()} loading={busy} onClick={() => save('knowledge')}>Yardım metnini kaydet</Button><p className="text-xs text-mist">Yapay zekâ için OpenAI bağlantısı gereklidir. Bağlantı veya yardım metni eksikse konuşma temsilci sırasına geçer.</p></div>
  </div>{notice && <p role="status" className="mt-4 text-sm text-mist">{notice}</p>}</details>;
}
