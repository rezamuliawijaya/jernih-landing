# Bekasi Live — CCTV Kota Bekasi & Kabupaten Bekasi

Halaman statis untuk memantau kamera lalu lintas publik di Kota Bekasi dan Kabupaten Bekasi, termasuk Cikarang, Tambun, dan Bekasi Timur. Semua video diputar langsung dari server sumber (HLS); tidak ada rekaman yang disimpan.

Situs ini menampilkan **24 kamera live** dan **5 kamera terdaftar yang belum bersiaran**. Kamera offline tetap ditautkan ke sumber resmi, tetapi tidak diputar.

## Kamera yang tersedia

Diperiksa 28 Oktober 2026, 06.05 WIB. Seluruh 24 stream di bawah terverifikasi dapat diputar di browser (playlist berisi segmen, tanpa `#EXT-X-ENDLIST`, CORS terbuka). Resolusi yang teramati: 1280×720 dan 1920×1080.

### Kota Bekasi — 21 live

Sumber: [CCTV Pemerintah Kota Bekasi](https://bekasikota.go.id/cctv) · daftar kamera: `https://eofficev2.bekasikota.go.id/backupcctv/m3/list.json` · basis stream: `https://eofficev2.bekasikota.go.id/backupcctv/m3/`.

| Kode | Kamera | Lokasi |
| --- | --- | --- |
| KB-01 | Stasiun Kota Bekasi | Jl. Ir. H. Juanda |
| KB-02 | FTL Fitness Gym | Jl. Ir. H. Juanda |
| KB-03 | KFC Taman Cut Mutia | Jl. Ir. H. Juanda |
| KB-04 | SMP Strada Budi Luhur | Jl. Ir. H. Juanda |
| KB-05 | Perempatan Rawa Semut | Jl. Cut Mutia |
| KB-06 | Terminal Kota Bekasi | Jl. Cut Mutia |
| KB-07 | MPP Kota Bekasi | Jl. Jend. A. Yani |
| KB-08 | Pintu Samping Pemkot | Jl. Jend. A. Yani |
| KB-09 | RS Mitra Keluarga | Jl. Jend. A. Yani |
| KB-10 | Pertigaan Cevest | Jl. Jend. Soedirman |
| KB-11 | Putaran Depan Kawasaki | Jl. KH. Noer Ali |
| KB-12 | Taman Kel. Jakasampurna | Jl. KH. Noer Ali |
| KB-13 | Bendungan Prisdo | Jl. M. Hasibuan |
| KB-14 | Univ. Bani Saleh | Jl. M. Hasibuan |
| KB-15 | Depan Ngopibah | Jl. RA. Kartini |
| KB-16 | Simpang Telkom | Jl. Rawa Tembaga |
| KB-17 | Depan Anugrah Motor | Jl. Siliwangi |
| KB-18 | Depan Pasar Segar | Jl. Siliwangi |
| KB-19 | Flyover Cipendawa | Jl. Siliwangi |
| KB-20 | Seberang Fajar Mas Murni | Jl. Siliwangi |
| KB-21 | RS Primaya Bekasi Timur | Jl. HM. Joyo Martono |

### Kabupaten Bekasi — 3 live

Sumber: [CCTV Jalan Non Tol Ditjen Bina Marga](https://binamarga.pu.go.id/cctv-ai/).

| Kode | Kamera | Stream |
| --- | --- | --- |
| CT-03 | Cikarang Utara | `https://its.binamarga.pu.go.id:8989/play/hls/CT-03/index.m3u8` |
| CT-02 | Cikarang Barat — Jl. Sultan Hasanudin | `https://its.binamarga.pu.go.id:8989/play/hls/CT-02/index.m3u8` |
| CT-01 | Tambun Selatan | `https://its.binamarga.pu.go.id:8989/play/hls/CT-01/index.m3u8` |

### Belum bersiaran — 5

Playlist kamera berikut kosong atau berakhir dengan `#EXT-X-ENDLIST`, sehingga tidak layak ditampilkan sebagai live:

- Cikarang Barat — Jl. Raya Teuku Umar (`CT-04`, Bina Marga)
- Kedungwaringin (`CT-07`, Bina Marga)
- DPRD Kota Bekasi — Jl. Chairil Anwar (`KB-22`, Pemkot Bekasi)
- Proyek Kota Bekasi — Jl. Mayor Oking (`KB-23`, Pemkot Bekasi)
- Perempatan Caman — Jl. Raya Kalimalang (`KB-24`, Pemkot Bekasi)

Kamera internal ATCS Kabupaten Bekasi tidak diakses. ATCS memantau simpang seperti SGC, Warung Bongkok, dan Terminal Cikarang dari CC Room, tetapi belum menyediakan siaran publik lewat web. Stream MM2100, Jasa Marga, dan BPTJ juga tidak dimasukkan karena tidak dapat diverifikasi publik.

## Menjalankan

Disarankan memakai server statis lokal:

```powershell
python -m http.server 4175 --bind 127.0.0.1 --directory cikarang-cctv
```

Lalu buka `http://127.0.0.1:4175/`.

Membuka `index.html` langsung dari disk juga bisa, tetapi server lokal lebih konsisten untuk pemuatan HLS di semua browser.

## Cara kerja

- **hls.js** memutar stream HLS di Chrome, Edge, dan Firefox. Safari yang mendukung HLS native memakai pemutar bawaan.
- **Pemuatan bertahap**: pemutar hanya diaktifkan saat kartu mendekati viewport (IntersectionObserver, margin 180 px). Maksimal 9 stream aktif bersamaan agar bandwidth dan CPU tetap wajar. Pemutar dilepas saat kartu jauh dari viewport.
- Setiap kartu punya status sendiri: `Menghubungkan` → `LIVE`, atau `Tidak tersedia` dengan tombol coba lagi dan tautan ke sumber resmi. Tombol jeda/putar menghentikan atau memulai stream per kartu.
- **Filter wilayah** (Semua / Kota Bekasi / Kabupaten Bekasi) dan **pencarian** berdasarkan nama, jalan, kode, atau instansi. Keduanya juga menyaring penanda peta.
- **Segarkan semua** memuat ulang playlist kamera yang sedang aktif dan mencoba lagi kamera yang gagal.
- Peta Leaflet memakai ubin OpenStreetMap yang digelapkan lewat CSS. Penanda hijau = Kota Bekasi, biru = Kabupaten Bekasi, abu-abu = belum bersiaran. Klik penanda untuk membuka siaran.
- Modal siaran mendukung layar penuh, klik backdrop, dan tombol `Esc`.
- Waktu memakai zona `Asia/Jakarta` (WIB), termasuk jam berjalan dan cap waktu pemeriksaan.

## Struktur

```
cikarang-cctv/
├── index.html          Markup halaman
├── assets/
│   ├── cameras.js      Data 29 kamera, URL stream, koordinat, status
│   ├── app.js          Pemutar HLS bertahap, filter, modal, peta, jam
│   └── styles.css      Tema control room dan layout responsif
└── README.md
```

## Menambah atau memperbarui kamera

1. Cek halaman sumber dan ambil URL playlist `.m3u8`.
2. Pastikan playlist berisi segmen baru, bukan kosong atau `#EXT-X-ENDLIST`:
   ```powershell
   curl.exe -s "https://eofficev2.bekasikota.go.id/backupcctv/m3/Jl_Ir_H_Juanda_Stasiun_Kota_Bekasi.m3u8"
   ```
3. Pastikan server sumber mengizinkan CORS (`Access-Control-Allow-Origin: *`) dan segmen `.ts` juga dapat diakses.
4. Tambahkan objek baru di `assets/cameras.js` dengan `id` unik, `stream`, `page` resmi, dan koordinat. Gunakan `status: "live"` hanya setelah stream terverifikasi.
5. Perbarui `window.CCTV_CHECKED_AT`, tanggal di `index.html`, dan hitungan pada tab filter bila jumlah kamera berubah.

Kamera dengan `status: "offline"` tidak diputar; hanya tampil sebagai tautan ke sumber resmi.

## Catatan

- Koordinat kamera Kabupaten Bekasi berasal dari data Bina Marga. Koordinat kamera Kota Bekasi adalah perkiraan berdasarkan nama lokasi pada daftar resmi; gunakan tautan sumber untuk verifikasi.
- Situs ini bukan situs resmi pemerintah. Gambar dan hak siar tetap milik instansi sumber. Jika kamera berubah menjadi tidak tersedia, kemungkinan besar sumber sedang offline atau dalam perawatan — bukan karena situs ini menyimpan rekaman.
