# Provider resmi, AI, dan proxy

## Prinsip sumber

Tidak ada API universal untuk seluruh promo internet. Adapter bawaan AWS/cloud/software/entertainment menggunakan **feed JSON yang operator telah verifikasi izin aksesnya**, bukan scraper HTML tanpa izin. Sebelum konfigurasi, periksa ketentuan layanan, aturan robots yang relevan, rate limit, dan apakah setiap URL benar-benar resmi.

Status `VERIFIED` berarti record yang disuplai feed menyatakan data sudah diverifikasi pada timestamp tersebut; bot memvalidasi kontrak, sumber allowlist, dan umur data. Bot tidak dapat membuktikan klaim pemasaran secara independen. Operator harus bertanggung jawab atas provenance feed. `health=OK` hanya berarti respons dan schema sumber lolos pemeriksaan.

## Konfigurasi feed

Buat file privat di disk, misalnya `/var/data/nova/providers.json`, lalu set `PROVIDER_CONFIG_PATH` ke path tersebut. Isinya array konfigurasi:

```json
[
  {
    "id": "aws",
    "endpoint": "https://feed-resmi.example.org/offers.json",
    "allowedHosts": ["feed-resmi.example.org", "aws.amazon.com"],
    "permissionConfirmed": true,
    "minIntervalSeconds": 300
  }
]
```

**URL contoh di atas bukan layanan yang tersedia.** Ganti dengan feed nyata yang Anda berhak akses. Jangan mengaktifkan konfigurasi contoh seolah-olah berhasil. Tidak ada endpoint promo AWS yang dihardcode atau diklaim tersedia.

- ID tersedia: `aws`, `cloud`, `software`, `entertainment`, maksimal satu konfigurasi per ID.
- Endpoint, URL resmi, sumber, dan URL pendaftaran harus memakai HTTPS tanpa kredensial/fragmen/port khusus. Parameter query yang menyerupai credential ditolak.
- `allowedHosts` cocok persis, tanpa wildcard. Sertakan hostname feed dan hostname sumber resmi yang diizinkan.
- DNS koneksi feed dipastikan menuju alamat publik; IP literal, loopback, private, link-local, reserved, dan redirect ditolak. Resolusi yang divalidasi dipakai langsung oleh konektor, bukan resolve terpisah sebelum fetch.
- Respons maksimum 1 MB, maksimum 500 record per feed, timeout 15 detik. Tidak ada cookie atau kredensial pengguna yang diteruskan.
- `minIntervalSeconds` default 300, minimal 60, maksimal 86400. Sesuaikan ke rate limit penyedia. Header Retry-After yang valid juga dihormati hingga maksimal 24 jam. Cooldown dicatat di memori untuk satu proses; restart meresetnya. Hindari restart berulang untuk mengulang fetch.
- Feed harus berisi array JSON. Tidak ada interpretasi HTML, script, atau instruksi dalam isi record. Bot tidak menggunakan teks provider sebagai instruksi AI.
- Provider diaktifkan/dinonaktifkan melalui `/providers` setelah file dikonfigurasi. Perubahan endpoint/allowlist di file memerlukan restart worker.

### Kontrak record feed

Berikut **fixture sintetis untuk menjelaskan schema**, bukan promo nyata atau seed produksi:

```json
[
  {
    "name": "Contoh sintetis — bukan penawaran nyata",
    "category": "cloud",
    "benefitType": "credit",
    "benefitValue": null,
    "currency": null,
    "duration": null,
    "eligibility": "UNKNOWN",
    "regions": [],
    "officialUrl": "https://example.com/fixture",
    "source": "https://example.com/fixture",
    "checkedAt": null,
    "expiresAt": null,
    "status": "UNKNOWN",
    "products": [],
    "limits": null,
    "accountRequirements": null,
    "billing": null,
    "costRisk": null,
    "registrationUrl": null
  }
]
```

Bot mengisi `id`, `provider`, `discoveredAt`, dan `dedupHash`; feed boleh mengirim field ini tetapi nilainya diganti. Field asing lainnya ditolak. Format timestamp ISO UTC, misalnya `2026-10-16T00:00:00.000Z`; gunakan tanggal pemeriksaan sesungguhnya, bukan contoh ini.

Status: `VERIFIED`, `UNVERIFIED`, `UNKNOWN`, `EXPIRED`, `UNAVAILABLE`. `VERIFIED` membutuhkan `checkedAt`. Nilai benefit numerik membutuhkan bukti pemeriksaan, dan dihapus jika status belum VERIFIED. Timestamp lebih dari 30 hari atau dari masa depan menurunkan status menjadi UNVERIFIED dan mengosongkan nilai. Tanggal akhir yang telah lewat menghasilkan EXPIRED. Pemeliharaan berkala juga menurunkan data VERIFIED yang menua di database.

Deduplication menggunakan SHA-256 URL resmi yang dikanonisasi (parameter UTM umum dibuang, query diurutkan). Satu URL resmi merepresentasikan satu penawaran pada versi ini. Bila sumber memiliki beberapa program pada URL yang sama, gunakan URL resmi spesifik program yang valid; jangan menciptakan URL palsu untuk memaksa perbedaan.

`checkOffer(hash, signal)` mencari hash URL dalam snapshot feed. Tidak ditemukannya record tidak otomatis berarti promo berakhir; daftar feed bisa berubah. Bot tidak membuat status EXPIRED tanpa tanggal/status sumber. Perubahan syarat/nilai/durasi/billing/batas/risiko memicu notifikasi untuk pengguna yang memfavoritkan record.

### Menambahkan jenis adapter baru

Turunkan `BaseProvider` atau implementasikan interface yang sama. Daftarkan secara eksplisit di `providers/index.js`; jangan memuat JavaScript dinamis dari input Telegram. Kembalikan record yang lulus `offerSchema`. Gunakan `fetchJson` dengan allowlist tetap dan `AbortSignal`, serta hormati cooldown sumber. Tambahkan tes kegagalan sumber dan schema. `MockProvider` hanya digunakan tes/demo terkontrol, tidak diregistrasikan pada startup produksi.

## AI opsional

Set `AI_PROVIDER=none` untuk operasi tanpa API berbayar. Fallback mengekstrak kata kunci/kategori melalui aturan lokal. Pertanyaan tentang syarat/durasi/benefit menampilkan detail record bersumber; perintah “bandingkan”/“compare” membandingkan hasil lokal yang ditemukan. Tidak ada jawaban yang dibuat berdasarkan fakta di luar database.

Untuk OpenAI:

```dotenv
AI_PROVIDER=openai
AI_API_KEY=
AI_MODEL=
```

Isi key dan model yang akun Anda benar-benar dapat akses, mendukung Responses API dan JSON Schema Structured Outputs. Bot tidak memilih model otomatis atau mengklaim model tersedia. API resmi: `POST https://api.openai.com/v1/responses`, `store=false`, `max_output_tokens=200`, schema output hanya `keywords` dan `category`.

- Input maksimal 300 karakter, lima permintaan asisten per pengguna per jam, maksimum 100 permintaan model per hari UTC per proses. Restart mereset penghitung memori: atur juga limit biaya pada akun provider untuk batas tagihan yang kuat.
- Output AI tidak dipakai untuk mengarang detail promo. AI hanya mengubah query; semua fakta/jawaban/perbandingan diambil dari database lokal.
- Tidak mengirim profil, token Telegram, key cloud, riwayat tiket, atau isi situs ke model. Permintaan pengguna tetap dikirim ke pihak ketiga ketika AI aktif; jangan menyertakan data sensitif.
- Timeout mengikuti `REQUEST_TIMEOUT_MS`. Error, kuota, format salah, atau model tidak kompatibel menyebabkan fallback kata kunci, bukan kegagalan bot.
- Tidak ada retry AI otomatis untuk mencegah biaya berulang. Kategori disimpan sementara di memori 30 menit, hapus dengan `/forget`.
- Dokumentasi kontrak yang digunakan: [OpenAI Responses create](https://developers.openai.com/api/reference/resources/responses/methods/create). Kebijakan retensi provider tetap berlaku walaupun `store=false`.

## Proxy opsional

Proxy hanya untuk tes konektivitas yang diizinkan. Pencarian promo tidak memakai proxy. Jangan gunakan proxy untuk menghindari wilayah, syarat akun, verifikasi, rate limit, atau mekanisme anti-abuse.

1. Set `PROXY_CONFIG_PATH=/var/data/nova/proxies.json` (direktori dapat ditulis).
2. Simpan URL HTTPS proxy di environment, misalnya nama `NOVA_PROXY_QA_URL`. Nilainya dapat memuat kredensial; jangan kirim nilainya ke bot.
3. `/proxies` → Add proxy reference → kirim `qa | NOVA_PROXY_QA_URL | https://host-yang-diizinkan/health.json | host-yang-diizinkan`.
4. Preview dan konfirmasi menyatakan Anda memiliki izin probe endpoint. Konfigurasi yang disimpan hanya nama env, ID, probe URL, host allowlist, dan penanda izin.
5. Gunakan Test, Enable, Disable, atau Remove. Tes memiliki timeout HTTP 5 detik, cooldown satu menit, latency dan status. Gagal akan menonaktifkan proxy otomatis.

Proxy harus tepercaya karena server proxy sendiri melakukan koneksi tujuan. Pemeriksaan alamat publik pada aplikasi tidak mengendalikan kebijakan DNS/routing internal proxy. Jangan konfigurasi proxy yang dapat mengakses jaringan privat sensitif. Respons probe harus berupa JSON; ini bukan browser atau tes bypass login.

Hasil latency/health bersifat sementara di memori; referensi konfigurasi dan status disabled disimpan. Penghapusan referensi tidak menghapus environment variable—hapus rahasia lama melalui dashboard Render bila tidak lagi diperlukan.
