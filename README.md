# Jernih — landing page + pendaftaran

Landing page statis satu file (`index.html`) dengan backend lokal tanpa dependensi untuk menyimpan pendaftaran.

## Menjalankan

1. Pastikan Node.js 18+ terpasang (`node -v`).
2. Jalankan `start.bat`, atau dari terminal:

   ```bash
   npm start
   ```

3. Buka <http://127.0.0.1:4173>.

Server menyajikan `index.html` dan menerima `POST /api/signup`. Tidak ada `npm install` yang diperlukan.

## Data pendaftaran

Setiap pendaftaran ditambahkan sebagai satu baris JSON ke `data/signups.ndjson`:

```json
{"id":"…","receivedAt":"2026-10-25T…","name":"Rani Kusuma","email":"rani@perusahaan.com","team":"Tim Produk","plan":"pro","source":"jernih-landing","userAgent":"…"}
```

Buka file itu dengan editor teks atau impor ke spreadsheet. Field yang tersimpan: nama, email, tim opsional, paket yang dipilih, waktu masuk, dan user agent. Nilai `plan` adalah `trial` (CTA umum/uji coba 14 hari), `free`, atau `pro`. Alamat IP hanya dipakai di memori untuk rate limit dan tidak disimpan.

Folder `data/` diabaikan Git dan tidak disajikan oleh server.

## Beralih ke Formspree

Formspree berguna jika halaman di-host statis dan tidak ingin menjalankan server.

1. Buat form di <https://formspree.io> dan salin endpoint-nya, misalnya `https://formspree.io/f/abcdwxyz`.
2. Di `index.html`, cari `var SIGNUP_ENDPOINT = '';` di bagian akhir file.
3. Isi endpoint tersebut:

   ```js
   var SIGNUP_ENDPOINT = 'https://formspree.io/f/abcdwxyz';
   ```

Setelah diisi, form mengirim langsung ke Formspree, bukan ke server lokal. Field `_gotcha` sudah tersedia sebagai honeypot dan akan dikenali Formspree.

## Konfigurasi server

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `PORT` | `4173` | Port server |
| `HOST` | `127.0.0.1` | Alamat bind |

Contoh port lain di Windows:

```bat
set PORT=4174 && node server.js
```

Jika port diubah, sesuaikan juga `LOCAL_SIGNUP_ENDPOINT` di `index.html`.

## Keamanan dan batasan

- Hanya menerima `application/json`, maksimal 16 KB per permintaan.
- Validasi nama (2–80 karakter), email, dan nama tim (maks. 60 karakter).
- Rate limit 8 pendaftaran per IP dalam 10 menit.
- CORS hanya untuk `file://` (`Origin: null`) dan `localhost`/`127.0.0.1`.
- Honeypot `_gotcha` menolak bot tanpa memberi tahu mereka.
- Server ini untuk pengembangan lokal. Untuk produksi, gunakan Formspree, layanan form lain, atau backend dengan database, HTTPS, autentikasi, dan backup.

## Troubleshooting

- **Port 4173 dipakai** — hentikan proses lain atau jalankan dengan `PORT` berbeda.
- **Form gagal saat halaman dibuka via `file://`** — server lokal harus berjalan; jalankan `start.bat`.
- **Ingin mengirim ke Formspree** — isi `SIGNUP_ENDPOINT` seperti di atas; server tidak perlu berjalan untuk pengiriman form.
