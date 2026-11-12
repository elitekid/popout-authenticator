# Listing toko — Bahasa Indonesia

## Nama (manifest appName, 1.0.1)
Popout Authenticator

## Ringkasan (manifest appDesc, maksimal 132 karakter)
Autentikator 2FA untuk browser Anda. Menghasilkan kode sekali pakai dan dibuka sebagai popup atau jendela terpisah.

## Deskripsi
(Tempel sebagai teks biasa, hapus tanda **. Maksimal lima nama produk lain, sesuai FAQ spam Chrome Web Store.)

Popout Authenticator menampilkan kode sekali pakai autentikasi dua faktor (2FA) langsung di browser Anda: di popup bilah alat, di jendela terpisah, atau di panel samping. Ekstensi ini menghasilkan kode TOTP dan HOTP standar, bersifat open source (MIT), tanpa batas jumlah akun, dan tidak memerlukan pendaftaran maupun server.

**Pindah dari autentikator lain**
- Impor file cadangan ekstensi Authenticator (authenticator.cc), termasuk cadangan yang dilindungi kata sandi.
- Kompatibel dengan kode QR ekspor Google Authenticator™.
- Impor cadangan teks biasa dari aplikasi autentikator lain, serta file standar pertukaran kredensial (CXF). Aplikasi yang didukung (bahasa Inggris): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Cadangan terenkripsi dari beberapa aplikasi tidak dapat dibuka di sini. Untuk itu, ekspor dulu cadangan teks biasa dari aplikasi tersebut.

**Buka di tempat yang Anda perlukan**
- Gunakan popup bilah alat, jendela terpisah, atau panel samping (sidebar di Firefox).
- Pencarian per kolom atau dengan beberapa kata, urutan A–Z, grup, akun yang disematkan, ikon, dan tampilan ringkas menjaga daftar panjang tetap rapi.
- Lihat akun mana yang sesuai dengan situs yang sedang dibuka, lalu isi kodenya dengan satu klik, klik kanan, atau pintasan keyboard.
- Pintasan global menyalin kode tiga akun penting pertama Anda, bahkan saat browser berada di latar belakang (Chrome, Edge, Whale).
- Tombol opsional di samping kolom kode pada situs yang Anda pilih.
- Pilih beberapa akun untuk dipindahkan ke tempat sampah sekaligus, ganti nama atau bubarkan seluruh grup sekaligus, dan salin nama akun.

**Tambahkan akun dengan cara Anda**
- Pindai kode QR dari tab saat ini, jendela aplikasi lain, kamera, gambar, atau papan klip.
- Tempel tautan otpauth://, atau ketik kunci rahasia secara manual.
- Mendukung TOTP dan HOTP dengan SHA-1, SHA-256, atau SHA-512 dan 6 hingga 10 digit, serta Steam (5 karakter) dan Battle.net (8 digit).

**Privat dan terlindungi**
- Akun disimpan di perangkat Anda dalam brankas yang dienkripsi dengan AES-256-GCM. Atur kata sandi untuk melindungi kuncinya: tanpa kata sandi, kunci disimpan di perangkat di samping data.
- Kunci dengan kata sandi (Argon2id), kode pemulihan, dan buka kunci opsional dengan passkey (tidak tersedia di Firefox). Pilih kapan terkunci otomatis.
- Opsional: wajibkan verifikasi perangkat sebelum kode digunakan (tidak tersedia di Firefox), dan sembunyikan kode dengan pintasan keyboard yang Anda tetapkan.
- Kode yang disalin dapat dihapus dari papan klip setelah 30 detik, 1, 2, atau 5 menit (tidak tersedia di Safari).
- Tanpa analitik, tanpa iklan, tanpa server pengembang. Kode sumbernya terbuka untuk umum.

**Jangan kehilangan akses**
- Cadangan terenkripsi, serta ekspor ke teks otpauth, CXF, dan kode QR.
- Sinkronkan antarperangkat melalui sinkronisasi browser Anda sendiri (Chrome, Edge, Firefox), terenkripsi saat kunci kata sandi aktif.
- Snapshot pemulihan, Sampah 30 hari, dan riwayat perubahan per akun.
- Pemeriksaan jam memperingatkan Anda saat waktu komputer akan membuat kode gagal.

**Bagikan kode, bukan rahasianya**
- Kirim tautan yang hanya menampilkan kode untuk 5 hingga 60 menit ke depan, dengan kata sandi opsional. Tautan tidak pernah berisi kunci rahasia.

**Perlu diketahui**
- Tidak ada cadangan cloud yang dikelola pengembang. Cadangan adalah file yang Anda simpan sendiri; sinkronisasi berjalan melalui sinkronisasi browser Anda.
- Buka kunci dengan passkey dan verifikasi perangkat tidak tersedia di Firefox. Versi Safari hanya untuk macOS.

Tersedia dalam 20 bahasa. Mendukung kebijakan terkelola untuk organisasi.

Popout Authenticator dibuat oleh pengembang independen. Ekstensi ini dibangun di atas kode dan terjemahan berlisensi MIT dari ekstensi Authenticator (authenticator.cc) dan tidak berafiliasi dengan para pembuatnya.

Google Authenticator adalah merek dagang Google LLC.

Kebijakan privasi: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Kode sumber: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `panel samping (sidebar di Firefox)` → `panel samping`
- `buka kunci opsional dengan passkey (tidak tersedia di Firefox)` → `buka kunci opsional dengan passkey`
- `sebelum kode digunakan (tidak tersedia di Firefox)` → `sebelum kode digunakan`
- `melalui sinkronisasi browser Anda sendiri (Chrome, Edge, Firefox)` → `melalui sinkronisasi Microsoft Edge`
- `di latar belakang (Chrome, Edge, Whale).` → `di latar belakang.`
- `5 menit (tidak tersedia di Safari).` → `5 menit.`
- 이 줄을 뺀다: `- Buka kunci dengan passkey dan verifikasi perangkat tidak tersedia di Firefox. Versi Safari hanya untuk macOS.`
