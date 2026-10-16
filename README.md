# NOVA HUNTER V3 — Advanced Edition

Bot Telegram modular untuk riset penawaran resmi, berbasis Node.js 24 LTS, JavaScript ES Modules, Telegraf, Zod, Pino, Vitest, dan satu berkas JSON. Ditujukan untuk satu proses dan beban kecil.

**Database awal sengaja kosong.** Saat bot berjalan, scheduler otomatis memeriksa empat sumber publik resmi: AWS Free Tier, Google Cloud Free Program, GitHub Copilot Free, serta status free trial Netflix. Tidak perlu file feed atau API key tambahan. Hasil disimpan ke database dan dapat dicari/difavoritkan. Bot hanya memeriksa URL yang tercantum, tanpa akses pemakaian/tagihan akun. Tanpa AI, pencarian kata kunci tetap berjalan.

## Mulai secara lokal

1. Buat bot melalui **@BotFather** menggunakan `/newbot`. Simpan token hanya pada environment.
2. Dapatkan numeric Telegram user ID pemilik melalui informasi update bot yang Anda kendalikan atau bot informasi ID yang Anda percayai. Username bukan `OWNER_ID`. Jangan memublikasikan respons API berisi data pengguna.
3. Pasang Node.js 24 LTS, kemudian:

   ```bash
   npm ci
   cp .env.example .env
   ```

4. Isi `BOT_TOKEN` dan `OWNER_ID` pada `.env`. Berkas tersebut diabaikan Git. Tidak perlu API key AI untuk mode dasar.
5. Jalankan pemeriksaan dan bot:

   ```bash
   npm run check
   npm test
   npm run validate:database
   npm start
   ```

6. Buka chat privat bot dan jalankan `/start`. Akun pemilik memiliki menu Admin Dashboard. Bot sengaja tidak memproses grup untuk meminimalkan data pribadi.

`DATABASE_PATH` yang belum ada akan diinisialisasi otomatis. `npm run validate:database` adalah pemeriksaan baca saja; berkas harus sudah ada. Konfigurasi salah menghentikan startup sebelum menghubungi Telegram, dengan nama field bermasalah tanpa nilainya.

## Struktur dan kontrak

```text
src/
  index.js                 # lifecycle long polling dan shutdown
  config.js                # validasi environment sebelum startup
  bot.js                   # routing callback, sesi, konfirmasi, otorisasi
  handlers/                # menu, alur input, command pengguna/owner
  services/                # transaksi bisnis, scheduler, backup, proxy, AI
  providers/               # adapter halaman/feed resmi + mock khusus pengujian
  database/                # schema strict v1, inisialisasi, engine JSON
  middleware/              # otorisasi, rate limit, error handler
  utils/                   # HTTP aman, HTML, bahasa, pagination, logging
scripts/                   # pemeriksaan sintaks dan validasi database
tests/                     # unit + integrasi Telegraf dengan boundary mock
data/database.json         # schema awal tanpa pengguna atau promo palsu
docs/                      # panduan operasional Indonesia
```

- Handler tidak menulis berkas database secara langsung. Seluruh mutasi melewati `store.transaction()`.
- Transaksi menggunakan clone, validasi Zod, antrean serial, file sementara mode `0600`, `fsync`, lalu `rename`. Kegagalan penulisan tidak memublikasikan draft ke memori.
- `.lock` mencegah proses kedua membuka database yang sama. Ini bukan mekanisme distributed lock. Jangan menjalankan dua instance, dua worker, atau cluster PM2 dengan token/data yang sama.
- Provider menyediakan `getName`, `isConfigured`, `searchOffers`, `checkOffer` (berdasarkan hash URL), dan `healthCheck`. Status health adalah hasil pemeriksaan terakhir, bukan klaim koneksi live.
- Job disimpan sebagai `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`. Handler wajib menghormati `AbortSignal`. Tugas `RUNNING` yang tertinggal saat restart menjadi `FAILED/INTERRUPTED`, agar broadcast lama tidak diputar ulang.

## Fitur yang berfungsi

| Area | Implementasi |
| --- | --- |
| Navigasi | 17 menu, Home/Back/Cancel, refresh, pagination, edit pesan dengan fallback, konfirmasi sekali pakai 2 menit |
| Promo Radar | Pencarian lokal, filter kategori/benefit/wilayah/tanggal, relevansi/tanggal, scan sumber resmi otomatis, isolasi kegagalan sumber, deduplikasi URL |
| Cloud Tracker | Katalog cloud, nilai terverifikasi atau UNKNOWN, syarat/produk/batas/billing/risiko/sumber, tanpa akses akun |
| AI Assistant | Pencarian alami melalui adapter opsional; fallback kata kunci/kategori; jawaban faktual berupa detail database dan perbandingan bersumber |
| Perbandingan | 2–4 promo pilihan, nilai/durasi/syarat/produk/batas/wilayah/biaya/kepastian; tanpa skor atau konversi nilai palsu |
| Alert | Favorit dipantau berdasarkan tanggal; perubahan syarat/benefit/billing publik; penawaran baru pada kategori pilihan; cooldown, snooze 24 jam, dismiss |
| Profil | Preferensi bahasa, zona IANA, kategori, frekuensi, ekspor statistik, hapus riwayat/profil |
| Favorit/riwayat | Maksimal 100 favorit per pengguna; riwayat query/filter/hasil, pagination dan penghapusan |
| Tiket | Kategori, prioritas, ID, riwayat, balasan owner/pengguna, lima status, maksimal tiga tiket aktif, jeda pembuatan satu menit |
| Ekspor | Favorit CSV dengan perlindungan formula; pencarian JSON; statistik sendiri; snapshot penuh hanya owner |
| Backup | Otomatis/manual, daftar/unduh, validasi/restore/import terkonfirmasi, backup sebelum restore, audit dan retensi |
| Referral | Deep link unik, larangan self/reuse, reward tertunda, penandaan pola berlebih, batas reward, toggle owner |
| XP | Reward idempoten, batas harian, level/progress, tujuh badge, riwayat, penyesuaian owner yang diaudit |
| Job | Deduplication, cooldown, concurrency, retry/backoff/jitter, timeout, pembatalan PENDING, health |
| Proxy | Referensi URL dari env, tambah/hapus, enable/disable, probe JSON HTTPS, latency/health/cooldown, gagal otomatis dinonaktifkan |
| Admin | Statistik, health, pengguna/promo/job/tiket/provider/kategori, interval, maintenance, broadcast preview, referral/XP/audit |

Antarmuka utama, petunjuk fitur, detail promo, dan alert mendukung pilihan Indonesia/Inggris. Nama menu mengikuti spesifikasi. Data dari provider/pengguna tetap sesuai bahasa sumber; administrasi dan sebagian label operasional menggunakan Bahasa Indonesia.

## Cara memakai fitur

- `/search cloud | category=cloud | benefit=credit | region=Indonesia | before=2027-12-31 | sort=date`
- Filter yang didukung: `category`, `benefit`, `region`, `before` (tanggal akhir UTC inklusif), `sort=relevance` atau `sort=date`.
- Kategori: `cloud`, `developer`, `ai`, `hosting`, `productivity`, `education`, `entertainment`, `trial`, `startup`, `free`.
- Relevansi: setiap kata yang cocok pada nama bernilai 3; pada kategori/jenis benefit bernilai 1. Ini skor pencarian teks, bukan penilaian keuntungan finansial. Pencocokan memakai OR antar kata.
- Buka detail promo → **Toggle favorite** untuk memantau → **Compare +** untuk memilih → Promo Comparison → Compare.
- Ticket & Support → New ticket → `bug | NORMAL | Uraian masalah`. Buka tiket tertentu sebelum membalas agar balasan terkait ID yang benar. Owner membuka `/tickets` untuk membalas atau mengganti status.
- `/forget` menghapus konteks kategori asisten. `/cancel` membatalkan alur input/konfirmasi.
- Bahasa, notifikasi, zona waktu, frekuensi 1–168 jam, pengingat 1–90 hari, dan kategori dipilih melalui Settings.

## Command owner

Semua command dan callback admin memeriksa `OWNER_ID` ketika dijalankan.

| Command | Fungsi |
| --- | --- |
| `/admin`, `/stats`, `/health` | Dashboard, hitungan dan status scheduler/database/provider |
| `/backup`, `/restore [id]` | Backup langsung; daftar/preview/konfirmasi restore |
| `/broadcast [teks]` | Preview dan konfirmasi; maksimum 1000 karakter, 500 penerima opt-in, satu job per jam |
| `/users`, `/offers`, `/jobs`, `/tickets` | Daftar dengan pagination; tiket dapat dibuka untuk balasan/status |
| `/providers` | Status dan enable/disable adapter terkonfigurasi |
| `/maintenance` | Konfirmasi toggle; pengguna biasa ditolak, owner tetap dapat memperbaiki |
| `/dbexport`, `/import` | Unduh snapshot; unggah JSON maksimal 32 MB, validasi, konfirmasi, backup pengaman |
| `/categories`, `/interval` | Subset kategori aktif; interval scan 1–10080 menit |
| `/xp` | Penyesuaian 1–100 XP dengan konfirmasi/audit; maksimal 5 kali per hari per penerima |
| `/referrals`, `/audit`, `/proxies` | Toggle/statistik referral, audit, pengelolaan referensi proxy |

Broadcast hanya ke pengguna yang mengaktifkan notifikasi; bukan kanal promosi tanpa persetujuan. Kegagalan Telegram 403 dilewati. Cursor disimpan setelah pengiriman; crash tepat setelah Telegram menerima pesan dan sebelum cursor tersimpan masih dapat menyebabkan duplikat. Telegram tidak menyediakan transaksi atomik dengan database lokal.

## Konfigurasi

Semua variabel dasar tersedia pada `.env.example`. Di Render, isi melalui dashboard, bukan commit `.env`.

| Variabel | Catatan |
| --- | --- |
| `BOT_TOKEN`, `OWNER_ID` | Wajib; token BotFather dan numeric ID pemilik |
| `DATABASE_PATH`, `BACKUP_PATH` | Path lokal; gunakan mount persistent disk di Render |
| `PERSISTENT_STORAGE` | Pernyataan operator; tidak memasang disk. `false` memunculkan peringatan startup |
| `PROMO_CHECK_INTERVAL_MINUTES` | Default interval untuk database baru; selanjutnya owner dapat mengubah `/interval` |
| `MAX_CONCURRENT_CHECKS` | Default 3, maksimal 10; batas job dan pekerja provider |
| `MAX_RETRIES` | Default 3 retry setelah percobaan pertama, maksimal 5 |
| `BACKUP_ENABLED`, `BACKUP_INTERVAL_HOURS` | Backup default aktif setiap 12 jam |
| `REFERRAL_ENABLED`, `XP_ENABLED` | Default pengaturan database baru; nilai tersimpan tidak ditimpa saat restart |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | `none` atau `openai`; model dan key wajib hanya untuk OpenAI |
| `BUILTIN_PROVIDERS_ENABLED` | Default true; sumber publik resmi otomatis tanpa API key |
| `PROVIDER_CONFIG_PATH` | Opsional: feed JSON berizin untuk mengganti sumber bawaan pada kategori terkait |
| `PROXY_CONFIG_PATH` | File referensi proxy tanpa kredensial; kosong berarti fitur tidak dikonfigurasi |
| `REQUEST_TIMEOUT_MS` | Default 15 detik untuk AI dan request Telegram non-polling; sumber promo 15 detik per request; probe proxy 5 detik |
| `LOG_LEVEL`, `NODE_ENV` | Level Pino dan mode aplikasi |

Scheduler berjalan tiap detik; pemicu scan/backup/alert dievaluasi setiap menit. Job maksimal 120 detik, dengan abort kooperatif dan lock tetap dipegang sampai handler selesai. Retry memakai `1000 × 2^attempts + jitter(0..999)` ms, atau jeda provider/Retry-After yang lebih panjang (maksimal 24 jam). Cooldown task 30 detik berdasarkan pengguna/jenis maupun kunci global. Sumber bawaan memiliki cooldown minimal 60 menit; robots diperiksa sebelum halaman dan disimpan 24 jam di memori. `lastScanAt` mencatat percobaan scan agar kegagalan tidak memicu job baru setiap menit; hasil sukses tiap sumber memiliki timestamp sendiri. Startup memeriksa sumber baru yang belum mempunyai record.

## Data, privasi, dan batas kapasitas

- Database strict maksimal 32 MB: 10.000 pengguna/promo/riwayat/referral, 20.000 favorit/notifikasi, 5.000 job/tiket/audit. Operasi yang melampaui batas ditolak, bukan diam-diam membuang data pengguna aktif.
- Riwayat pencarian, notifikasi, job terminal, audit, dan tiket CLOSED dibersihkan setelah 90 hari. Saat batas 5.000 job tercapai, job terminal tertua juga dibuang agar pemicu berkala tetap berjalan; job aktif dan broadcast dalam cooldown tidak dibuang. Profil/favorit/XP disimpan sampai penghapusan profil. Maksimal 1000 entri reward per profil; setelah itu XP otomatis berhenti, agar key reward lama tidak dapat digunakan ulang.
- Referral hanya pada 10 menit pertama bergabung, satu referral per profil. Reward 10 XP menunggu aktivitas dua tanggal UTC berbeda. Lebih dari lima undangan sehari ditandai tanpa reward otomatis; maksimal lima reward sehari dan 20 total per pengundang. Tidak ada fingerprint atau klaim bahwa akun Telegram pasti mewakili orang unik.
- Aktivitas biasa memberi 5 XP; aktivitas harian 1 XP. Maksimal lima reward per aktivitas/hari. Level: `floor(sqrt(XP / 100)) + 1`.
- Konteks AI hanya kategori di memori, TTL 30 menit; teks percakapan tidak disimpan sebagai chat. Query pencarian tetap masuk riwayat sampai dihapus atau retensi berakhir.
- Penghapusan profil membersihkan data aktif terkait; backup terdahulu tetap ada sampai retensi. Restore backup dapat mengembalikan profil yang pernah dihapus. Owner wajib memperhatikan permintaan penghapusan sebelum restore/menyimpan ekspor eksternal.
- Ekspor pengguna meminimalkan identitas. Snapshot penuh owner mengandung data pribadi operasional: simpan terbatas dan terenkripsi di luar server.
- Tidak ada penyimpanan token, API key, password, OTP, cookies, atau kredensial pembayaran. Pola rahasia umum ditolak; deteksi pola tidak bisa mengenali seluruh bentuk rahasia. Jangan kirim data tersebut.
- Log aplikasi ke stdout berupa metadata terbatas, tanpa payload Telegram atau query. Retensi log platform Render harus diatur oleh operator; audit lokal dibatasi 5.000 entri/90 hari.

## Konfigurasi yang masih diperlukan

1. **Telegram:** token BotFather dan owner ID untuk komunikasi nyata.
2. **Promo/cloud:** sumber bawaan aktif otomatis. Feed JSON berizin hanya diperlukan untuk mengganti/menambah cakupan melalui adapter yang ada. Angka hanya diekstrak saat pola bukti resmi cocok; tidak ada angka kredit seed produksi. Nilai maksimum bukan jaminan semua akun mendapatkannya.
3. **AI:** opsional, API resmi OpenAI Responses dan model kompatibel Structured Outputs. Tidak ada akses API/model yang diasumsikan tersedia.
4. **Proxy:** opsional, proxy HTTPS dan endpoint JSON tes yang Anda miliki izin untuk akses; tidak dipakai mencari promo atau menghindari pembatasan.
5. **Persistensi/backup eksternal:** persistent disk Render harus dikonfigurasi; salinan luar disk dilakukan lewat ekspor manual. Tidak ada integrasi object storage otomatis bawaan.

## Pengujian dan batas verifikasi

`npm test` menjalankan Vitest dengan database sementara dan provider sintetis. Tes mencakup konfigurasi, concurrent writes, kegagalan atomic write ENOSPC/EACCES, recovery korupsi, migration, otorisasi/callback, dedup/filter, alert, retry/lock/timeout, tiket, referral, XP, ekspor/impor, backup/restore, proxy, dan alur Telegraf asli dengan HTTP boundary yang dimock.

Tes fixture bukan promo nyata dan tidak dimasukkan ke database produksi. `npm run check:providers` memeriksa sumber resmi langsung, lalu menyimpan dan mencari hasil pada database sementara yang dibersihkan otomatis. Ini tidak membuktikan kelayakan akun, ketersediaan feed khusus, respons AI berbayar, atau pengiriman Telegram nyata. Jalankan smoke manual setelah konfigurasi sesuai panduan deployment. Katalog CodeRabbit Emulate v0.0.1 diperiksa; Telegram dan OpenAI Responses tidak tersedia dalam katalog tersebut.

## Panduan lanjutan

- [Deploy Render](docs/DEPLOY_RENDER.md)
- [Backup dan recovery](docs/BACKUP_RECOVERY.md)
- [Kontrak provider, AI, dan proxy](docs/PROVIDERS.md)
- [Contoh tampilan dan pemeriksaan penerimaan](docs/ACCEPTANCE.md)

**Filesystem Render tanpa disk persisten bisa hilang saat deploy/instance diganti. Backup pada disk yang sama tidak melindungi kehilangan seluruh disk. Jangan menambah replica bot sebagai cara menaikkan kapasitas database JSON.**
