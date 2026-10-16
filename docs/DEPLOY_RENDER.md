# Deployment di Render

## Pilihan arsitektur

Gunakan **satu Background Worker** dengan long polling. Tidak diperlukan port atau HTTP health endpoint. Status internal tersedia melalui `/health` dan log startup. Jangan menjalankan token yang sama secara bersamaan di laptop, worker lain, atau replica tambahan.

`render.yaml` menyediakan blueprint worker satu instance dengan disk pada `/var/data/nova`. Blueprint mencantumkan paket `starter`; ketersediaan/harga worker dan persistent disk mengikuti paket serta kebijakan Render saat deployment. Periksa dashboard sebelum membuat service. Menetapkan `PERSISTENT_STORAGE=true` tidak otomatis menciptakan disk.

## Langkah

1. Buat bot pada @BotFather, simpan token. Dapatkan numeric ID owner.
2. Simpan source di repository Git privat/publik sesuai kebutuhan; pastikan `.env`, file provider/proxy aktual, backup, dan database berisi data pengguna tidak ikut commit. Berkas `data/database.json` di repository hanya template kosong.
3. Pada Render, buat Blueprint dari repository menggunakan `render.yaml`, atau buat Background Worker manual.
4. Untuk konfigurasi manual:
   - Runtime Node.js 24 LTS.
   - Build: `npm ci --include=dev && npm run check && npm test`.
   - Start: `npm start`.
   - Instance: **1**.
   `--include=dev` memastikan Vitest terpasang saat `NODE_ENV=production`. Berkas `.npmrc` juga mengaktifkan instalasi dependency pengujian untuk service lama yang masih memakai `npm ci`.
5. Isi semua environment dasar dari `.env.example`. Minimal `BOT_TOKEN` dan `OWNER_ID`. Rahasia harus melalui dashboard Render.
6. Pasang persistent disk bila tersedia untuk tipe service/paket Anda:
   - Mount path: `/var/data/nova`.
   - `DATABASE_PATH=/var/data/nova/database.json`.
   - `BACKUP_PATH=/var/data/nova/backups`.
   - `PERSISTENT_STORAGE=true` hanya setelah mount dikonfirmasi.
7. Bila tanpa disk, gunakan path lokal yang dapat ditulis dan `PERSISTENT_STORAGE=false`. Ini hanya cocok untuk demo yang boleh kehilangan data. Ekspor owner sebelum setiap pergantian instance tidak menjamin seluruh perubahan terakhir tersimpan.
8. Jangan simpan database pada direktori source/build yang dapat ditimpa deployment. Sumber promo bawaan aktif otomatis tanpa file konfigurasi. Jika memakai feed/proxy khusus, konfigurasi yang dapat diedit sebaiknya di disk persisten; `PROVIDER_CONFIG_PATH`/`PROXY_CONFIG_PATH` menunjuk berkas tersebut.
9. Jalankan deployment. Periksa log: tidak boleh ada token penuh; harus ada pesan kesiapan long polling atau error konfigurasi yang menyebut nama field.
10. Jalankan `/start` sebagai owner dan pengguna lain. Pengguna lain tidak memiliki menu admin; command `/admin` langsung juga harus ditolak.
11. Jalankan checklist di `ACCEPTANCE.md`: menu, query kosong, tiket, favorit (setelah scan pertama selesai), backup, restore, dan job.
12. Jalankan `/health`, `/providers`, `/jobs`. Sumber bawaan mula-mula NOT CHECKED lalu OK setelah scan. NOT CONFIGURED muncul bila sumber bawaan dinonaktifkan dan tidak ada feed pengganti. Periksa log `Pemeriksaan sumber promo selesai` dan My Tasks untuk hasil scan.
13. Verifikasi retensi setelah restart: buat preferensi/tiket sintetis, restart worker, pastikan data tetap ada. Hapus data tes setelah pemeriksaan. Tidak perlu mengirim atau mencetak token untuk menguji ini.

## Mengapa bukan Web Service?

Versi ini khusus worker, tidak menyediakan server HTTP. Jangan memilih Web Service lalu berharap port health tersedia. Bila organisasi mewajibkan Web Service, tambahkan server HTTP health dan konfigurasi port secara sengaja dalam versi lanjutan; tetap hanya satu poller. Jangan menjalankan dua arsitektur paralel dengan token yang sama.

## Operasional

- Graceful shutdown SIGINT/SIGTERM menghentikan polling, pemicu berkala, update aktif, job, dan lock database. Request HTTP memiliki timeout; job kooperatif dibatalkan saat shutdown.
- Render dapat memberi jendela shutdown lebih pendek daripada job. Setelah crash/kill, lock mungkin tertinggal. Hentikan seluruh instance, verifikasi tidak ada penulis aktif, lalu ikuti prosedur lock di panduan recovery. Jangan menghapus lock secara otomatis berdasarkan waktu saja.
- Saat disk penuh/izin gagal, job ditandai gagal dan error umum tampil tanpa stack/rahasia. Periksa kapasitas/izin mount. Backup gagal mencoba memberi tahu owner.
- Jangan menyalakan debug log library HTTP yang dapat mencetak URL token. `LOG_LEVEL` hanya untuk Pino aplikasi.
- Alert berisi data publik; tidak membaca saldo kredit, akun AWS, atau tagihan aktual.
- Provider yang tidak tersedia tidak menghentikan bot. Scan melaporkan sumber sukses/gagal; bila seluruh sumber gagal, scheduler mencoba ulang terbatas.
- Dokumentasi platform: [Background Workers](https://render.com/docs/background-workers), [Persistent Disks](https://render.com/docs/disks), [Blueprints](https://render.com/docs/infrastructure-as-code). Periksa kebijakan saat provisioning.
