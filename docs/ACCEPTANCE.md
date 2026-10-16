# Tampilan dan pemeriksaan penerimaan

## Contoh menu utama

```text
🟣 NOVA HUNTER V3
━━━━━━━━━━━━
Riset penawaran resmi. Benefit bergantung kelayakan akun.
Pilih fitur:

[AI Assistant]       [Promo Radar]
[Cloud Credit]       [Promo Comparison]
[Expiry & Cost]      [My Tasks]
[Favorites]          [Search History]
[Notifications]      [Ticket & Support]
[Export Center]      [Referral System]
[XP & Achievements]  [My Profile]
[Settings]           [Help]
[Admin Dashboard]   ← hanya pemilik
[Home] [Back] [Cancel]
```

Telegram standar menentukan warna/tema tombol. Bot tidak mengklaim dapat memaksakan warna ungu/biru atau dark mode; gunakan tema gelap pada klien Telegram untuk tampilan gelap. Ikon, pemisah, judul pendek, dan layout dipakai untuk konsistensi.

## Sebelum provider diaktifkan

```text
Promo Radar
Sumber terdaftar:
aws: NOT CONFIGURED
cloud: NOT CONFIGURED
software: NOT CONFIGURED
entertainment: NOT CONFIGURED

NOT CONFIGURED: owner mengatur PROVIDER_CONFIG_PATH.
Pencarian lokal tidak memindai internet.
[Search] [Refresh sumber]
```

## Detail tanpa angka yang dapat diverifikasi

```text
🟣 Nama program dari sumber
━━━━━━━━━━━━
Status: UNKNOWN
Kategori: cloud
Benefit: jenis yang dinyatakan sumber
Nilai: UNKNOWN
Durasi: UNKNOWN
Syarat: UNKNOWN
Billing: UNKNOWN
Risiko biaya: UNKNOWN
Berakhir: UNKNOWN
Diperiksa: UNKNOWN
Sumber: URL resmi dari record
Benefit bergantung kelayakan akun.
Pemakaian/tagihan aktual: UNKNOWN.
[Toggle favorite] [Compare +] [Refresh]
```

Contoh ini bukan record produksi. Nilai hanya ditampilkan dari sumber yang dikonfigurasi.

## Pemeriksaan otomatis

```bash
npm ci
npm run check
npm test
npm run validate:database
npm audit --omit=dev
```

Tes menggunakan berkas sementara yang dibersihkan, user sintetis, serta provider/Telegram mock. Tidak membutuhkan BOT_TOKEN sungguhan. Tes callback memeriksa setiap callback yang ditampilkan pada seluruh menu dan detail yang diuji memiliki tepat satu route dengan panjang maksimal 64 byte. Tes command owner memeriksa penolakan non-owner dan eksekusi handler owner. Tes Telegraf menjalankan middleware dan command sebenarnya dengan transport mock.

## Smoke manual setelah konfigurasi

- [ ] `/start` menerima menu pengguna; semua 16 menu pengguna terbuka. Owner mendapat menu ke-17.
- [ ] Non-owner yang mencoba `/admin`, `/backup`, `/broadcast`, atau callback palsu ditolak.
- [ ] Tanpa feed: Radar menampilkan NOT CONFIGURED dan tidak membuat promo palsu.
- [ ] Dengan feed resmi yang diizinkan: scan menyimpan record/sumber/waktu; scan ulang tidak menggandakan URL.
- [ ] Query, filter kategori/benefit/wilayah/tanggal, sorting, detail, favorit, dan perbandingan bekerja dengan data sumber.
- [ ] Tanpa AI: pencarian asisten tetap berfungsi. Dengan API/model yang valid: mode AI mengekstrak intent; kegagalan API kembali ke keyword.
- [ ] Settings mengganti zona waktu, preferensi bahasa, kategori, notifikasi, frekuensi dan hari pengingat.
- [ ] Buat tiket sintetis; owner membuka ID tiket, membalas, mengganti status; pengguna membalas/menutup tiket miliknya.
- [ ] Ekspor CSV/JSON hanya memuat data yang sesuai. CSV dengan teks `=SUM(...)` dari fixture dibuka sebagai teks, bukan formula.
- [ ] `/backup` membuat file valid; unduh; `/restore` meminta konfirmasi dan membuat backup pengaman.
- [ ] `/import` menolak file invalid dan menerima snapshot valid hanya setelah konfirmasi.
- [ ] `/jobs` menunjukkan status/percobaan/result; tugas PENDING sendiri dapat dibatalkan; tugas RUNNING tidak berpura-pura dibatalkan.
- [ ] Broadcast preview tidak mengirim sebelum Confirm; hanya penerima opt-in. Gunakan pesan tes yang disetujui penerima.
- [ ] Alert tanggal fixture resmi terkontrol mencantumkan “berdasarkan tanggal publik”, cooldown berlaku, Snooze/Dismiss bekerja.
- [ ] Referral tidak memberi reward langsung saat akun dibuat; self-referral dan kode ulang ditolak.
- [ ] XP tidak bertambah berulang untuk key aktivitas yang sama; badge dan progress terlihat.
- [ ] Restart worker dengan disk persisten mempertahankan data. Uji recovery pada salinan sintetis, bukan merusak database produksi.
- [ ] `/privacy`, penghapusan riwayat, ekspor profil, dan konfirmasi penghapusan profil sesuai kebijakan retensi.

Catat pemeriksaan layanan nyata secara terpisah dari unit test. Status lulus unit test tidak menjamin kredensial, paket Render, endpoint, atau kelayakan promo eksternal.
