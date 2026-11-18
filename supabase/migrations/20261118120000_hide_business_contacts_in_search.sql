/*
  # İşletme iletişim bilgilerini aramadan çıkar

  Müşteriler randevuyu Rango üzerinden alır; işletmenin telefon ve e-postası müşteri
  tarafına gönderilmez (toplu veri kazıma ve platform dışı randevuların önüne geçmek için).

  `search_businesses` her sonuçta işletme satırının tamamını (`to_jsonb(biz)`) döndürüyordu;
  bu, telefon ve e-postayı da içeriyordu. Fonksiyonun geri kalanı aynen korunur, yalnızca
  sonuçtan `phone` ve `email` alanları çıkarılır.

  Güvenli: CREATE OR REPLACE ile aynı imza, yetkiler korunur. Mevcut site ve uygulama
  arama sonuçlarında telefonu kullanmadığı için hiçbir ekran etkilenmez. Dosya tekrar
  çalıştırılabilir (zaten uygulanmışsa bir şey değiştirmez).
*/
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.search_businesses(double precision, double precision, text, text, numeric, numeric, text, boolean, boolean, text, integer, integer)'::regprocedure);
  v_old text := 'to_jsonb(biz) || jsonb_build_object(''categories'',';
  v_new text := '(to_jsonb(biz) - ''phone'' - ''email'') || jsonb_build_object(''categories'',';
BEGIN
  IF position(v_new in v_def) > 0 THEN
    RAISE NOTICE 'search_businesses already hides contact details';
  ELSIF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'search_businesses has an unexpected shape; not changed';
  ELSE
    EXECUTE replace(v_def, v_old, v_new);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
