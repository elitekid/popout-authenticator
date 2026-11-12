# Mağaza kaydı — Türkçe

## Ad (manifest appName, 1.0.1)
Popout Authenticator

## Özet (manifest appDesc, en fazla 132 karakter)
Tarayıcınız için 2FA kimlik doğrulayıcı. Tek kullanımlık kodlar üretir; açılır pencere veya ayrı pencere olarak açılır.

## Açıklama
(Düz metin olarak yapıştırın, ** işaretlerini kaldırın. Chrome Web Mağazası spam SSS'sine göre en fazla beş başka ürün adı.)

Popout Authenticator, iki faktörlü kimlik doğrulama (2FA) için tek kullanımlık kodlarınızı doğrudan tarayıcınızda gösterir: araç çubuğundaki açılır pencerede, ayrı bir pencerede veya yan panelde. Standart TOTP ve HOTP kodları üretir, açık kaynaklıdır (MIT), hesap sınırı yoktur ve kayıt ya da sunucu gerektirmez.

**Başka bir doğrulayıcıdan geçiş**
- Authenticator uzantısının (authenticator.cc) yedek dosyasını, parola korumalı yedekler dahil, içe aktarın.
- Google Authenticator™ dışa aktarma QR kodlarıyla uyumludur.
- Diğer kimlik doğrulama uygulamalarının şifrelenmemiş yedeklerini ve standart Credential Exchange (CXF) dosyalarını içe aktarın. Desteklenen uygulamalar (İngilizce): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Bazı uygulamaların şifreli yedekleri burada açılamaz. Bu durumda önce o uygulamadan şifrelenmemiş bir yedek dışa aktarın.

**İhtiyacınız olan yerde açın**
- Araç çubuğundaki açılır pencereyi, ayrı bir pencereyi veya yan paneli (Firefox'ta kenar çubuğu) kullanın.
- Alana göre veya birden çok kelimeyle arama, A'dan Z'ye sıralama, gruplar, sabitlenmiş hesaplar, simgeler ve sıkışık görünüm uzun listeleri düzenli tutar.
- Açık olan sitenin hesabını görün ve kodunu tek tıkla, sağ tıkla veya klavye kısayoluyla doldurun.
- Genel kısayollar, tarayıcı arka plandayken bile ilk üç önemli hesabınızın kodlarını kopyalar (Chrome, Edge, Whale).
- Seçtiğiniz sitelerde kod alanlarının yanında isteğe bağlı düğmeler.
- Birden çok hesabı seçip birlikte çöp kutusuna taşıyın, bir grubun tamamını tek seferde yeniden adlandırın veya dağıtın ve bir hesabın adını kopyalayın.

**Hesapları istediğiniz gibi ekleyin**
- Geçerli sekmeden, başka bir uygulamanın penceresinden, kameradan, bir görselden veya panodan QR kodu tarayın.
- otpauth:// bağlantılarını yapıştırın veya gizli anahtarı elle yazın.
- SHA-1, SHA-256 veya SHA-512 ve 6 ila 10 haneli TOTP ile HOTP'yi, ayrıca Steam (5 karakter) ve Battle.net'i (8 hane) destekler.

**Gizli ve korunaklı**
- Hesaplar cihazınızda AES-256-GCM ile şifrelenmiş bir kasada saklanır. Kasanın anahtarını korumak için bir parola belirleyin: parola olmadan anahtar cihazda verilerin yanında tutulur.
- Parolayla kilitleme (Argon2id), kurtarma kodu ve isteğe bağlı geçiş anahtarıyla kilit açma (Firefox'ta yok). Ne zaman otomatik kilitleneceğini seçin.
- İsterseniz bir kod kullanılmadan önce cihaz doğrulaması isteyin (Firefox'ta yok) ve kodları belirlediğiniz bir klavye kısayoluyla gizleyin.
- Kopyalanan kodlar 30 saniye, 1, 2 veya 5 dakika sonra panodan silinebilir (Safari'de yok).
- Analiz yok, reklam yok, geliştirici sunucusu yok. Kaynak kodu herkese açıktır.

**Erişiminizi kaybetmeyin**
- Şifreli yedekler ve otpauth metni, CXF ile QR kodlarına dışa aktarma.
- Tarayıcınızın kendi eşitlemesi (Chrome, Edge, Firefox) üzerinden cihazlarınız arasında eşitleme; parola kilidi açıkken şifreli.
- Kurtarma anlık görüntüleri, 30 günlük çöp kutusu ve hesap başına değişiklik geçmişi.
- Saat denetimi, bilgisayarınızın saati kodların çalışmamasına yol açacaksa sizi uyarır.

**Gizli anahtarı değil, kodu paylaşın**
- Yalnızca sonraki 5 ila 60 dakikanın kodlarını gösteren bir bağlantı gönderin; isterseniz parola ekleyin. Bağlantı hiçbir zaman gizli anahtarı içermez.

**Bilmekte fayda var**
- Geliştiricinin işlettiği bir bulut yedeği yoktur. Yedekler sizin sakladığınız dosyalardır; eşitleme tarayıcınız üzerinden yapılır.
- Geçiş anahtarıyla kilit açma ve cihaz doğrulaması Firefox'ta yoktur. Safari sürümü yalnızca macOS içindir.

20 dilde kullanılabilir. Kuruluşlar için yönetilen ilkeleri destekler.

Popout Authenticator bağımsız bir geliştirici tarafından yapılmıştır. Authenticator uzantısının (authenticator.cc) MIT lisanslı kodu ve çevirileri üzerine kuruludur ve yazarlarıyla bir bağlantısı yoktur.

Google Authenticator, Google LLC'nin ticari markasıdır.

Gizlilik politikası: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Kaynak kodu: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `yan paneli (Firefox'ta kenar çubuğu)` → `yan paneli`
- `isteğe bağlı geçiş anahtarıyla kilit açma (Firefox'ta yok)` → `isteğe bağlı geçiş anahtarıyla kilit açma`
- `cihaz doğrulaması isteyin (Firefox'ta yok)` → `cihaz doğrulaması isteyin`
- `Tarayıcınızın kendi eşitlemesi (Chrome, Edge, Firefox) üzerinden` → `Microsoft Edge eşitlemesi üzerinden`
- `kodlarını kopyalar (Chrome, Edge, Whale).` → `kodlarını kopyalar.`
- `panodan silinebilir (Safari'de yok).` → `panodan silinebilir.`
- 이 줄을 뺀다: `- Geçiş anahtarıyla kilit açma ve cihaz doğrulaması Firefox'ta yoktur. Safari sürümü yalnızca macOS içindir.`
