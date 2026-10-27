# Jernih — landing page + pendaftaran

Landing page SaaS satu file (`index.html`) dengan formulir pendaftaran yang terhubung ke Formspree. Backend Node lokal tanpa dependensi juga tersedia untuk pengembangan.

**Demo:** <https://rezamuliawijaya.github.io/jernih-landing/>

## Menjalankan

Buka `index.html` langsung di browser, atau jalankan server lokal:

1. Pastikan Node.js 18+ terpasang (`node -v`).
2. Jalankan `start.bat`, atau dari terminal:

   ```bash
   npm start
   ```

3. Buka <http://127.0.0.1:4173>.

Form mengirim ke Formspree karena `SIGNUP_ENDPOINT` sudah diisi di `index.html`. Server lokal hanya diperlukan jika Anda ingin memakai backend lokal.

## Form pendaftaran

- Endpoint aktif: `https://formspree.io/f/mgaakzrd`
- Setiap pendaftaran muncul di dashboard Formspree. Notifikasi email akan masuk jika diaktifkan di pengaturan form.
- Field yang dikirim: `name`, `email`, `team`, `plan`, dan `_gotcha` (honeypot).
- Setelah berhasil, dialog menampilkan “Pendaftaran diterima.”

Untuk mengganti endpoint, cari baris berikut di bagian akhir `index.html`:

```js
var SIGNUP_ENDPOINT = 'https://formspree.io/f/mgaakzrd';
```

lalu ganti dengan endpoint form Anda.

## Backend lokal (opsional)

Kosongkan endpoint agar form kembali mengirim ke server lokal:

```js
var SIGNUP_ENDPOINT = '';
```

Jalankan `start.bat` atau `npm start`, lalu buka <http://127.0.0.1:4173>. Setiap pendaftaran ditambahkan sebagai satu baris JSON ke `data/signups.ndjson`:

```json
{"id":"…","receivedAt":"2026-10-25T…","name":"Rani Kusuma","email":"rani@perusahaan.com","team":"Tim Produk","plan":"pro","source":"jernih-landing","userAgent":"…"}
```

Field yang tersimpan: nama, email, tim opsional, paket yang dipilih, waktu masuk, dan user agent. Nilai `plan` adalah `trial` (CTA umum/uji coba 14 hari), `free`, atau `pro`. Alamat IP hanya dipakai di memori untuk rate limit dan tidak disimpan. Folder `data/` diabaikan Git dan tidak disajikan oleh server.

## Konfigurasi server lokal

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `PORT` | `4173` | Port server |
| `HOST` | `127.0.0.1` | Alamat bind |

Contoh port lain di Windows:

```bat
set PORT=4174 && node server.js
```

Jika port diubah, sesuaikan juga `LOCAL_SIGNUP_ENDPOINT` di `index.html`.

## Deploy

Repo: <https://github.com/rezamuliawijaya/jernih-landing>

GitHub Pages disajikan dari branch `main`, folder root. Setelah perubahan di-push, halaman live diperbarui otomatis.

## Keamanan dan batasan

- Form memakai validasi nama (2–80 karakter), email, dan nama tim (maks. 60 karakter), serta honeypot `_gotcha`.
- Server lokal hanya menerima `application/json`, maksimal 16 KB per permintaan.
- Server lokal membatasi 8 pendaftaran per IP dalam 10 menit.
- CORS server lokal hanya untuk `file://` (`Origin: null`) dan `localhost`/`127.0.0.1`.
- Server lokal ditujukan untuk pengembangan. Untuk halaman statis, Formspree menangani pengiriman dan spam filtering.

## Troubleshooting

- **Form gagal di halaman live** — periksa endpoint di `index.html`, status form di dashboard Formspree, lalu coba lagi.
- **Port 4173 dipakai** — hentikan proses lain atau jalankan dengan `PORT` berbeda.
- **Ingin menyimpan data sendiri** — kosongkan `SIGNUP_ENDPOINT` dan jalankan server lokal seperti di atas.
- **Formspree menolak pengiriman** — cek kuota/status form dan apakah notifikasi email sudah diverifikasi.
