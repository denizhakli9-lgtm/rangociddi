/*
# İzmir pilot data

1. The 10 VEYRA service categories with icons and images.
2. 20 sample İzmir partner businesses (approved, platform-managed: no owner account yet),
   each with category-specific services and prices (TRY), 3 staff members who perform every service,
   and weekly working hours (Mon-Sat 09:00-20:00 with a 13:00-14:00 break; spa/massage also open Sunday).
3. Idempotent: categories and businesses are matched by slug; child rows only inserted when missing.
*/

INSERT INTO categories (slug, name, description, icon, image_url, sort_order) VALUES
('kuafor', 'Kuaför', 'Kesim, renklendirme ve şekillendirme', 'scissors', 'https://images.pexels.com/photos/7750124/pexels-photo-7750124.jpeg?auto=compress&cs=tinysrgb&w=800', 1),
('berber', 'Berber', 'Klasik kesim, sakal ve tıraş ritüelleri', 'brush', 'https://images.pexels.com/photos/3037244/pexels-photo-3037244.jpeg?auto=compress&cs=tinysrgb&w=800', 2),
('guzellik-merkezi', 'Güzellik Merkezi', 'Makyaj, kaş, kirpik ve bütünsel bakım', 'sparkles', 'https://images.pexels.com/photos/7195799/pexels-photo-7195799.jpeg?auto=compress&cs=tinysrgb&w=800', 3),
('cilt-bakimi', 'Cilt Bakımı', 'Profesyonel yüz ve cilt bakımları', 'droplets', 'https://images.pexels.com/photos/7446659/pexels-photo-7446659.jpeg?auto=compress&cs=tinysrgb&w=800', 4),
('masaj', 'Masaj', 'Rahatlatıcı ve terapötik masajlar', 'waves', 'https://images.pexels.com/photos/6629612/pexels-photo-6629612.jpeg?auto=compress&cs=tinysrgb&w=800', 5),
('spa', 'Spa', 'Hamam, spa ritüelleri ve wellness', 'flower', 'https://images.pexels.com/photos/6186740/pexels-photo-6186740.jpeg?auto=compress&cs=tinysrgb&w=800', 6),
('manikur', 'Manikür', 'Manikür, kalıcı oje ve nail art', 'hand', 'https://images.pexels.com/photos/3738377/pexels-photo-3738377.jpeg?auto=compress&cs=tinysrgb&w=800', 7),
('pedikur', 'Pedikür', 'Ayak bakımı ve spa pedikür', 'footprints', 'https://images.pexels.com/photos/31091766/pexels-photo-31091766.jpeg?auto=compress&cs=tinysrgb&w=800', 8),
('lazer-epilasyon', 'Lazer Epilasyon', 'Son teknoloji lazer uygulamaları', 'zap', 'https://images.pexels.com/photos/10822318/pexels-photo-10822318.jpeg?auto=compress&cs=tinysrgb&w=800', 9),
('sac-bakimi', 'Saç Bakımı', 'Keratin, botoks ve onarıcı bakımlar', 'wind', 'https://images.pexels.com/photos/7195811/pexels-photo-7195811.jpeg?auto=compress&cs=tinysrgb&w=800', 10)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  b record;
  v_bid uuid;
  v_idx int := 0;
  i int;
  v_name text;
  v_title text;
  v_female text[] := ARRAY['Elif Yılmaz','Zeynep Kaya','Selin Demir','Ece Arslan','Defne Çelik','Melis Aydın','İpek Şahin','Derya Koç','Buse Kurt','Naz Erdem'];
  v_male text[] := ARRAY['Emre Yıldız','Burak Öztürk','Can Aksoy','Mert Doğan','Kerem Polat','Onur Kılıç','Arda Şen','Kaan Uçar'];
  v_titles text[] := ARRAY['Kıdemli Uzman','Uzman','Uzman Yardımcısı'];
  v_imgs text[];
BEGIN
  FOR b IN SELECT * FROM (VALUES
    ('maison-lumiere','Maison Lumière Kuaför','kuafor','Alsancak','Kıbrıs Şehitleri Cd. No:42, Alsancak, Konak',38.4380,27.1430,'female','percentage',25,24,true,true,ARRAY[7750124,7195799,7195812],'Paris esintili salonumuzda kişiye özel kesim ve renk danışmanlığı.'),
    ('atelier-noir','Atelier Noir Hair Studio','kuafor','Karşıyaka','Cemal Gürsel Cd. No:310, Karşıyaka',38.4600,27.1100,'unisex','percentage',20,12,true,true,ARRAY[7195796,7195811,7750124],'Modern kesim teknikleri ve trend renklendirmeler için butik stüdyo.'),
    ('golden-comb','Golden Comb Kuaför','kuafor','Bornova','Kazımdirik Mh. 372. Sk. No:8, Bornova',38.4620,27.2170,'unisex','fixed',150,24,false,false,ARRAY[7195812,7195796,7195799],'Bornova''nın köklü kuaförü; gelin ve özel gün saçlarında uzman.'),
    ('gentlemens-club','Gentlemen''s Club Barber','berber','Alsancak','Talatpaşa Blv. No:18, Alsancak, Konak',38.4370,27.1450,'male','percentage',20,6,true,true,ARRAY[3037244,9146943,5970245],'Klasik İngiliz berber geleneği, sıcak havlu tıraşı ve viski eşliğinde.'),
    ('black-blade','Black Blade Barbershop','berber','Karşıyaka','Bostanlı Mh. 2040. Sk. No:5, Karşıyaka',38.4560,27.1180,'male','fixed',100,6,true,false,ARRAY[9971239,3037244,9146943],'Fade, skin fade ve modern erkek kesimlerinde iddialı ekip.'),
    ('usta-berber','Usta Berber Bornova','berber','Bornova','Mustafa Kemal Cd. No:61, Bornova',38.4660,27.2200,'male','fixed',100,3,true,false,ARRAY[37764947,5970245,3037244],'Üç kuşaktır süren ustalıkla klasik tıraş ve sakal tasarımı.'),
    ('ege-prestige','Ege Prestige Barber','berber','Bayraklı','Manas Blv. No:39, Folkart Towers, Bayraklı',38.4630,27.1650,'male','percentage',25,12,true,true,ARRAY[9146943,9971239,37764947],'Bayraklı''nın gökdelenleri arasında premium erkek bakım deneyimi.'),
    ('aurelia-beauty','Aurelia Güzellik Merkezi','guzellik-merkezi','Bayraklı','Ankara Cd. No:81, Bayraklı',38.4580,27.1700,'female','percentage',30,24,false,true,ARRAY[7195799,7446659,12115040],'Makyaj, kaş ve kirpik uygulamalarında İzmir''in seçkin adresi.'),
    ('velvet-lounge','Velvet Beauty Lounge','guzellik-merkezi','Göztepe','Mithatpaşa Cd. No:1020, Göztepe, Konak',38.3970,27.0850,'female','percentage',20,24,true,false,ARRAY[7195812,7581075,7446914],'Deniz manzaralı lounge''umuzda bütünsel güzellik ritüelleri.'),
    ('pure-skin','Pure Skin Clinic','cilt-bakimi','Alsancak','Cumhuriyet Blv. No:140, Alsancak, Konak',38.4350,27.1400,'unisex','percentage',30,24,true,true,ARRAY[7446659,12115040,3764552],'Dermatolojik temelli, cilt analizine dayalı kişisel bakım protokolleri.'),
    ('derma-luxe','Derma Luxe İzmir','cilt-bakimi','Bostanlı','Cemal Gürsel Cd. No:540, Bostanlı, Karşıyaka',38.4560,27.0970,'unisex','percentage',25,24,true,false,ARRAY[7581075,36436447,7446659],'Hydrafacial ve ileri teknoloji cilt yenileme uygulamaları.'),
    ('serenity-masaj','Serenity Masaj Evi','masaj','Balçova','Mithatpaşa Cd. No:1250, Balçova',38.3900,27.0450,'unisex','percentage',20,12,true,false,ARRAY[6629605,6629614,9268044],'Uzman terapistlerle zihni ve bedeni dinlendiren masaj seansları.'),
    ('thai-lotus','Thai Lotus Massage','masaj','Çeşme','Çarşı Cd. No:22, Çeşme',38.3240,26.3060,'unisex','fixed',300,24,true,true,ARRAY[6629612,6629605,6186740],'Çeşme''nin kalbinde otantik Thai ve Bali masaj ritüelleri.'),
    ('aegean-spa','Aegean Spa & Wellness','spa','Urla','Kalabak Mh. Zeytin Sk. No:3, Urla',38.3230,26.7650,'unisex','percentage',30,48,true,true,ARRAY[6186740,6629614,19695978],'Zeytin ağaçları arasında Ege''ye özgü doğal spa deneyimi.'),
    ('hammam-royal','Hammam Royal Spa','spa','Konak','Anafartalar Cd. No:155, Kemeraltı, Konak',38.4190,27.1290,'unisex','percentage',25,24,false,false,ARRAY[6186740,9268044,6629612],'Osmanlı hamam geleneğini modern lüksle buluşturan tarihi mekan.'),
    ('nail-couture','Nail Couture','manikur','Alsancak','1453. Sk. No:12, Alsancak, Konak',38.4390,27.1460,'female','fixed',100,12,true,true,ARRAY[3738377,7446914,4783335],'Haute couture tırnak tasarımları ve kusursuz kalıcı oje.'),
    ('lacquer-co','Lacquer & Co. Nail Bar','manikur','Karşıyaka','Kemalpaşa Cd. No:44, Karşıyaka',38.4580,27.1130,'female','fixed',100,6,true,false,ARRAY[4783335,3738377,7446914],'Hızlı, hijyenik ve şık nail bar deneyimi.'),
    ('silk-feet','Silk Feet Pedikür Stüdyo','pedikur','Bornova','Ankara Asfaltı No:27, Bornova',38.4640,27.2150,'unisex','percentage',20,12,true,false,ARRAY[31091766,19695978,7755554],'Medikal ve spa pedikürde uzman, steril stüdyo.'),
    ('lumina-lazer','Lumina Lazer Epilasyon','lazer-epilasyon','Buca','Menderes Cd. No:210, Buca',38.3880,27.1750,'unisex','percentage',20,24,true,false,ARRAY[10822318,14438392,3985354],'FDA onaylı cihazlarla güvenli ve konforlu lazer epilasyon.'),
    ('crown-atelier','Crown Saç Bakım Atelier','sac-bakimi','Narlıdere','Mithatpaşa Cd. No:1560, Narlıdere',38.3950,27.0050,'unisex','percentage',25,24,true,true,ARRAY[7195811,7195796,7750124],'Keratin, saç botoksu ve onarıcı bakımlarda imza uygulamalar.')
  ) AS t(slug, name, cat, district, address, lat, lng, gender, dtype, dval, chours, auto, featured, imgs, descr)
  LOOP
    v_idx := v_idx + 1;
    SELECT array_agg('https://images.pexels.com/photos/' || x || '/pexels-photo-' || x || '.jpeg?auto=compress&cs=tinysrgb&w=1200' ORDER BY o)
      INTO v_imgs FROM unnest(b.imgs) WITH ORDINALITY AS u(x, o);

    INSERT INTO businesses (owner_id, category_id, name, slug, description, phone, email, address, district, city,
      latitude, longitude, cover_url, gallery, gender_focus, deposit_type, deposit_value, cancellation_hours,
      auto_confirm, status, is_verified, is_featured)
    VALUES (NULL, (SELECT id FROM categories WHERE slug = b.cat), b.name, b.slug, b.descr,
      '+90 232 ' || lpad((400 + v_idx)::text, 3, '0') || ' ' || lpad((v_idx * 37 % 100)::text, 2, '0') || ' ' || lpad((v_idx * 53 % 100)::text, 2, '0'),
      b.slug || '@veyra.app', b.address, b.district, 'İzmir', b.lat, b.lng, v_imgs[1], v_imgs,
      b.gender, b.dtype, b.dval, b.chours, b.auto, 'approved', true, b.featured)
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO v_bid FROM businesses WHERE slug = b.slug;

    IF NOT EXISTS (SELECT 1 FROM services WHERE business_id = v_bid) THEN
      INSERT INTO services (business_id, name, description, price, duration_minutes, sort_order)
      SELECT v_bid, s.name, s.descr, s.price, s.dur, s.ord FROM (VALUES
        ('kuafor','Kesim & Fön','Yüz hattınıza uygun kesim ve profesyonel fön',750,60,1),
        ('kuafor','Boya','Tek renk saç boyası ve bakım',1800,120,2),
        ('kuafor','Röfle / Balyaj','El yapımı balyaj ve ışıltılı röfle',2800,150,3),
        ('kuafor','Fön','Hacimli veya düz fön',400,45,4),
        ('kuafor','Gelin Saçı','Prova dahil gelin saçı tasarımı',4500,180,5),
        ('berber','Saç Kesimi','Yıkama ve şekillendirme dahil',450,30,1),
        ('berber','Sakal Tasarımı','Ustura ile sakal şekillendirme',250,20,2),
        ('berber','Saç & Sakal','Komple bakım paketi',600,45,3),
        ('berber','Sıcak Havlu Tıraşı','Geleneksel ustura tıraşı',400,30,4),
        ('berber','Erkek Cilt Bakımı','Temizlik, peeling ve maske',700,45,5),
        ('guzellik-merkezi','Kaş Tasarımı','Yüz analizi ile kaş şekillendirme',350,30,1),
        ('guzellik-merkezi','Kirpik Lifting','Doğal kıvrım ve besleyici bakım',900,60,2),
        ('guzellik-merkezi','Profesyonel Makyaj','Özel gün ve davet makyajı',2000,90,3),
        ('guzellik-merkezi','İpek Kirpik','Tek tek ipek kirpik uygulaması',1500,120,4),
        ('cilt-bakimi','Klasik Cilt Bakımı','Derin temizlik ve nemlendirme',1200,60,1),
        ('cilt-bakimi','Hydrafacial','Çok adımlı hydrafacial uygulaması',2000,75,2),
        ('cilt-bakimi','Kimyasal Peeling','Leke ve doku düzeltici peeling',1500,45,3),
        ('cilt-bakimi','Anti-Aging Bakım','Sıkılaştırıcı yaşlanma karşıtı bakım',2500,90,4),
        ('masaj','İsveç Masajı','Klasik rahatlatıcı tam vücut masajı',1500,60,1),
        ('masaj','Aromaterapi Masajı','Doğal esansiyel yağlarla masaj',1800,60,2),
        ('masaj','Derin Doku Masajı','Kas gerginliğine yönelik terapötik masaj',2000,75,3),
        ('masaj','Sıcak Taş Masajı','Volkanik taşlarla derin rahatlama',2200,90,4),
        ('spa','Hamam & Kese','Geleneksel kese ve köpük',1200,60,1),
        ('spa','Köpük Masajı','Hamamda köpük masajı',900,45,2),
        ('spa','Spa Ritüeli','Hamam, masaj ve yüz bakımı paketi',3500,150,3),
        ('spa','Çift Spa Ritüeli','İki kişilik özel spa deneyimi',6000,120,4),
        ('manikur','Klasik Manikür','Tırnak ve kütikül bakımı',400,45,1),
        ('manikur','Kalıcı Oje','Uzun ömürlü jel oje uygulaması',600,60,2),
        ('manikur','Protez Tırnak','Jel veya akrilik protez tırnak',1200,120,3),
        ('manikur','Nail Art','Kişiye özel tırnak sanatı',300,30,4),
        ('pedikur','Klasik Pedikür','Ayak ve tırnak bakımı',500,60,1),
        ('pedikur','Spa Pedikür','Peeling, maske ve masaj dahil',800,75,2),
        ('pedikur','Ayak Kalıcı Oje','Ayak tırnaklarına kalıcı oje',550,60,3),
        ('lazer-epilasyon','Tüm Vücut','Tüm vücut lazer epilasyon seansı',3500,90,1),
        ('lazer-epilasyon','Yüz Bölgesi','Yüz bölgesi lazer seansı',800,30,2),
        ('lazer-epilasyon','Koltuk Altı','Koltuk altı lazer seansı',500,20,3),
        ('lazer-epilasyon','Tüm Bacak','Tüm bacak lazer seansı',2000,60,4),
        ('sac-bakimi','Keratin Bakımı','Brezilya keratin düzleştirme',3000,150,1),
        ('sac-bakimi','Saç Botoksu','Yoğun onarıcı saç botoksu',2500,120,2),
        ('sac-bakimi','Onarıcı Maske','Derinlemesine besleyici maske',700,45,3),
        ('sac-bakimi','Saç Analizi & Bakım','Saç derisi analizi ve kişisel bakım',1100,60,4)
      ) AS s(cat, name, descr, price, dur, ord)
      WHERE s.cat = b.cat;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM employees WHERE business_id = v_bid) THEN
      FOR i IN 1..3 LOOP
        IF b.gender = 'male' OR (b.gender = 'unisex' AND i = 3) THEN
          v_name := v_male[((v_idx * 3 + i) % array_length(v_male, 1)) + 1];
        ELSE
          v_name := v_female[((v_idx * 3 + i) % array_length(v_female, 1)) + 1];
        END IF;
        v_title := v_titles[i];
        INSERT INTO employees (business_id, full_name, title, sort_order) VALUES (v_bid, v_name, v_title, i);
      END LOOP;
      INSERT INTO employee_services (employee_id, service_id)
      SELECT e.id, s.id FROM employees e JOIN services s ON s.business_id = e.business_id
      WHERE e.business_id = v_bid
      ON CONFLICT DO NOTHING;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM working_hours WHERE business_id = v_bid) THEN
      INSERT INTO working_hours (business_id, weekday, is_closed, open_time, close_time, break_start, break_end)
      SELECT v_bid, d,
        (d = 7 AND b.cat NOT IN ('spa','masaj')),
        CASE WHEN d = 7 THEN '10:00'::time ELSE '09:00'::time END,
        CASE WHEN d = 7 THEN '18:00'::time ELSE '20:00'::time END,
        '13:00'::time, '14:00'::time
      FROM generate_series(1, 7) AS d;
    END IF;
  END LOOP;
END $$;
