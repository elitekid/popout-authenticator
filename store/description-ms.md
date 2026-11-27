# Penyenaraian gedung — Bahasa Melayu

## Nama (manifest appName, 1.0.1)
Popout Authenticator — Kod 2FA & OTP

## Ringkasan (manifest appDesc, maksimum 132 aksara)
Pengesah 2FA sumber terbuka. Kod OTP di tetingkap timbul, tetingkap sendiri atau panel sisi, kunci kata laluan dan import sandaran.

## Penerangan
(Tampal sebagai teks biasa: buang tanda **. Jenama yang disebut: paling banyak lima, mengikut Soalan Lazim spam Chrome.)

Popout Authenticator menunjukkan kod sekali guna dua faktor (2FA) anda terus dalam penyemak imbas: dalam tetingkap timbul bar alat, tetingkap berasingan atau panel sisi. Ia menjana kod TOTP dan HOTP standard, bersumber terbuka (MIT), tiada had akaun, dan tidak memerlukan pendaftaran atau pelayan.

**Berpindah daripada pengesah lain**
- Import fail sandaran sambungan Authenticator (authenticator.cc), termasuk sandaran yang dilindungi kata laluan.
- Serasi dengan kod QR eksport Google Authenticator™.
- Import sandaran teks biasa daripada apl pengesah lain, serta fail pertukaran bukti kelayakan standard (CXF). Apl yang disokong (dalam bahasa Inggeris): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Buka sandaran sesetengah apl yang dilindungi kata laluan dengan kata laluannya. Bagi apl yang sandaran disulitkannya tidak dapat dibuka di sini, eksport sandaran teks biasa dalam apl itu dahulu.

**Buka di mana-mana anda perlukan**
- Gunakan tetingkap timbul bar alat, tetingkap berasingan atau panel sisi (bar sisi dalam Firefox).
- Cari mengikut medan atau dengan beberapa perkataan, isih A–Z, dan gunakan kumpulan, akaun penting, ikon serta paparan padat untuk memastikan senarai panjang tersusun.
- Lihat akaun mana yang dimiliki oleh tapak yang sedang anda lawati, dan isi kodnya dengan satu klik, klik kanan atau pintasan papan kekunci. Klik kanan di mana-mana pada halaman untuk menyalin kod tapak itu.
- Pintasan global menyalin kod tiga akaun penting pertama anda, walaupun semasa penyemak imbas berada di latar belakang (Chrome, Edge, Whale).
- Butang pilihan di sebelah medan kod pada tapak yang anda pilih.
- Pilih beberapa akaun untuk mengalihkannya ke kumpulan lain atau ke sampah sekali gus, dan buat asal dengan segera. Namakan semula atau nyahkumpulkan seluruh kumpulan sekali gus, dan salin nama akaun.
- Gunakan imej anda sendiri sebagai ikon akaun. Imej itu kekal pada peranti ini.

**Tambah akaun mengikut cara anda**
- Imbas kod QR daripada tab semasa, tetingkap apl lain, kamera, imej atau papan keratan.
- Tampal pautan otpauth://, atau taip kunci rahsia secara manual.
- Menyokong TOTP dan HOTP dengan SHA-1, SHA-256 atau SHA-512 dan 6 hingga 10 digit, serta Steam (5 aksara) dan Battle.net (8 digit).

**Peribadi dan dilindungi**
- Akaun disimpan pada peranti anda dalam peti besi yang disulitkan dengan AES-256-GCM. Tetapkan kata laluan untuk melindungi kuncinya: tanpa kata laluan, kunci itu disimpan pada peranti bersama data.
- Kuncinya dengan kata laluan (Argon2id), kod pemulihan dan buka kunci dengan kunci laluan pilihan (tidak tersedia dalam Firefox). Pilih bila ia dikunci secara automatik.
- Secara pilihan, minta pengesahan peranti sebelum kod digunakan (tidak tersedia dalam Firefox), dan sembunyikan kod dengan pintasan papan kekunci yang anda tetapkan.
- Dapatkan amaran sebelum kod digunakan pada tapak yang alamatnya hanya kelihatan seperti tapak akaun.
- Kod yang disalin boleh dikosongkan daripada papan keratan selepas 30 saat, 1, 2 atau 5 minit (tidak dalam Safari).
- Tiada analitik, tiada iklan, tiada pelayan pembangun. Kod sumber adalah terbuka.

**Jangan sekali-kali hilang akses**
- Sandaran disulitkan, serta eksport ke teks otpauth, CXF dan kod QR.
- Segerakkan antara peranti anda melalui penyegerakan penyemak imbas anda sendiri (Chrome, Edge, Firefox), disulitkan apabila kunci kata laluan dihidupkan.
- Syot kilat pemulihan, sampah 30 hari dan sejarah perubahan akaun.
- Semakan jam memberi amaran apabila masa komputer anda boleh menyebabkan kod gagal.

**Kongsi kod, bukan kunci rahsia**
- Hantar pautan yang hanya menunjukkan kod untuk 5 hingga 60 minit seterusnya, dengan kata laluan pilihan. Pautan itu tidak sekali-kali mengandungi kunci rahsia.

**Perlu diketahui**
- Tiada sandaran awan yang dikendalikan oleh pembangun. Sandaran ialah fail yang anda simpan sendiri; penyegerakan berlaku melalui penyegerakan penyemak imbas anda sendiri.
- Buka kunci dengan kunci laluan dan pengesahan peranti tidak tersedia dalam Firefox. Versi Safari hanya untuk macOS.

Tersedia dalam 43 bahasa. Menyokong dasar terurus untuk organisasi.

Popout Authenticator dibuat oleh pembangun bebas. Ia dibina berdasarkan kod dan terjemahan berlesen MIT bagi sambungan Authenticator (authenticator.cc) dan tidak bergabung dengan pengarangnya.

Google Authenticator ialah tanda dagangan Google LLC.

Dasar privasi: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Kod sumber: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `panel sisi (bar sisi dalam Firefox)` → `panel sisi`
- `dan buka kunci dengan kunci laluan pilihan (tidak tersedia dalam Firefox)` → `dan buka kunci dengan kunci laluan pilihan`
- `sebelum kod digunakan (tidak tersedia dalam Firefox)` → `sebelum kod digunakan`
- `melalui penyegerakan penyemak imbas anda sendiri (Chrome, Edge, Firefox)` → `melalui penyegerakan Microsoft Edge`
- `di latar belakang (Chrome, Edge, Whale).` → `di latar belakang.`
- `5 minit (tidak dalam Safari).` → `5 minit.`
- 이 줄을 뺀다: `- Buka kunci dengan kunci laluan dan pengesahan peranti tidak tersedia dalam Firefox. Versi Safari hanya untuk macOS.`
