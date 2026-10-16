# Backup dan recovery

## Backup harian dan ekspor

- Aktifkan `BACKUP_ENABLED=true`; default interval 12 jam.
- `/backup` membuat snapshot schema valid tanpa rahasia, mencatat audit, lalu menyediakan Download.
- `/restore` menampilkan sepuluh backup terbaru; ID lain dapat dipilih melalui `/restore ID`.
- `/dbexport` mengunduh database aktif, khusus owner. Ekspor ini mengandung data pribadi operasional; jangan mengirim ke grup publik.
- Retensi file `backup-<16 hex>.json`: maksimal 20 file, 30 hari, dan 128 MB total. Snapshot terbaru tetap dipertahankan. Batas database per file 32 MB.
- Retensi dijalankan setiap backup berhasil. Jika bot lama mati, jalankan backup/prune setelah bot kembali aktif.
- Simpan salinan manual terenkripsi di penyimpanan luar Render dengan akses terbatas. Integrasi penyimpanan eksternal otomatis belum disertakan; unduh melalui bot atau salin lewat administrasi disk yang Anda kuasai.

Backup pada disk lokal yang sama **tidak melindungi kehilangan disk keseluruhan**. Telegram sendiri merupakan jalur transfer; pertimbangkan kebijakan privasi organisasi sebelum mengekspor snapshot lengkap.

## Restore melalui Telegram

1. Jalankan `/restore`, pilih ID. Bot memvalidasi schema, versi, ukuran, dan nama file.
2. Periksa jumlah pengguna/promo yang ditampilkan. Konfirmasi berlaku dua menit dan hanya sekali untuk pengguna yang membuatnya.
3. Scheduler dijeda dan semua job aktif ditunggu sebelum restore.
4. Bot membuat backup pengaman dari database saat ini. Jika backup pengaman gagal, restore tidak dilanjutkan.
5. Data lama diganti melalui transaksi atomik. Task lama PENDING/RUNNING menjadi CANCELLED dan notifikasi lama di-dismiss agar tidak diputar ulang.
6. Metadata backup yang masih tersedia dipertahankan; audit restore ditambahkan. Scheduler dilanjutkan.
7. Periksa `/health`, `/stats`, tiket, dan pengaturan. Restore dapat mengembalikan profil yang pernah dihapus: operator harus merekonsiliasi permintaan penghapusan.

## Impor

`/import` → kirim dokumen JSON maksimum 32 MB → validasi → konfirmasi. Nama/path dokumen tidak digunakan. Unduhan hanya dari host Telegram resmi, tanpa redirect, dengan timeout dan batas ukuran streaming. Tidak ada `eval` atau eksekusi isi file. Unknown field (termasuk token/API key tambahan), relasi utama yang rusak, ID duplikat, dan schema tidak sesuai ditolak.

## Database rusak

Engine menyimpan satu `database.json.previous` sebelum tiap transaksi. JSON yang gagal diparse dapat dipulihkan hanya dari `.previous` yang lulus schema. Berkas rusak disalin menjadi `.corrupt-<id>` untuk investigasi. Tanpa salinan valid, startup gagal tertutup; database kosong tidak dibuat di atas data rusak.

Kesalahan schema/versi tak dikenal juga menghentikan startup, sehingga operator dapat memilih backup yang benar. `.previous` bukan backup berumur panjang. File `.corrupt-*` dan `.migration-*` adalah salinan pemulihan operator, tidak termasuk retensi backup terjadwal; arsipkan/hapus secara aman setelah investigasi agar disk tidak penuh.

### Recovery manual saat bot tidak bisa mulai

1. Hentikan worker dan pastikan tidak ada proses lain memakai token maupun database.
2. Salin database rusak dan `.previous` ke lokasi investigasi privat; jangan mencetak isinya ke log publik.
3. Validasi kandidat backup dengan path yang Anda kendalikan:

   ```bash
   DATABASE_PATH=/var/data/nova/backups/backup-ID.json npm run validate:database
   ```

   Ganti `ID` dengan ID backup sebenarnya. Validasi hanya membaca file.
4. Jika lock tertinggal setelah crash, hapus `<DATABASE_PATH>.lock` **hanya setelah seluruh proses penulis dipastikan berhenti**. Nomor PID bisa dipakai sebagai petunjuk, bukan bukti tunggal setelah instance diganti.
5. Salin backup valid ke file sementara di direktori database, beri izin `0600`, lalu rename ke path database saat worker tetap berhenti. Pertahankan salinan data sebelumnya. Validasi kembali sebelum startup.
6. Mulai worker. Job `RUNNING` yang tertinggal akan ditandai `FAILED/INTERRUPTED`. Untuk salinan manual, job PENDING/notification belum terkirim dapat tetap aktif; pilih restore melalui bot dari database penyelamatan yang valid jika ingin aturan pembatalan otomatis.
7. Jalankan `/health`, buat backup baru, kemudian ekspor salinan ke luar disk.

## Migration

Schema saat ini versi 1. Migration v0 hanya mendukung bentuk v1 yang belum memiliki koleksi/settings baru: default ditambahkan dan seluruh isi divalidasi ulang. Berkas asli disalin menjadi `.migration-<id>` sebelum migration. Versi lainnya ditolak; jangan mengganti angka versi secara manual untuk memaksa data asing diterima.
