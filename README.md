# Absensi Sekolah — GPS + Selfie

Sistem presensi siswa berbasis web. Tanpa install, tanpa login, tanpa hardware.
Siswa buka link → izinkan lokasi → selfie → kirim. Data langsung masuk Google Sheets.

**Live:** SMK Yappa Depok — radius 150 m dari `-6.394003, 106.845314`

---

## Arsitektur

```
Browser siswa  →  HTML statis  →  Google Apps Script (webhook)  →  Google Sheets
```

- **Frontend** — file statis. Gak butuh server. Butuh HTTPS karena GPS browser cuma jalan di HTTPS.
- **Backend** — Google Apps Script `Code.gs`. Jalan di infra Google, 24 jam, gratis.
- **Database** — Google Sheets, 3 tab: `Data_Absensi`, `Config_Sekolah`, `Rekap_Harian`.

Biaya: **Rp0**. Kuota Apps Script akun biasa ~20.000 request/hari.

---

## Struktur File

```
absensi/
├── index.html          # Markup halaman
├── src/
│   ├── style.css       # Styling (mobile-first, gradient)
│   └── app.js          # Logic: GPS, validasi, kompresi selfie, submit
├── netlify.toml        # Konfigurasi deploy Netlify
├── .gitignore
├── LICENSE             # MIT
└── README.md
```

Logic **tidak** digabung ke HTML. Semua perilaku ada di `src/app.js`, styling di `src/style.css`.

---

## Konfigurasi

Semua pengaturan ada di blok `CONFIG` di baris paling atas `src/app.js`:

```js
const CONFIG = {
  webhookUrl: 'https://script.google.com/macros/s/.../exec',
  school: {
    name: 'SMK Yappa Depok',
    lat: -6.394003,
    lng: 106.845314,
    radius: 150            // meter
  },
  maxAcceptableAccuracy: 50, // meter — GPS lebih buruk dari ini ditolak
  maxPhotoSize: 1024 * 1024, // 1MB
  maxDimension: 600,         // px, sisi terpanjang selfie
  quality: 0.85              // JPEG quality
};
```

### Ganti sekolah

1. `CONFIG.school` di `src/app.js` → nama, `lat`, `lng`, `radius`.
2. Tab `Config_Sekolah` di spreadsheet → nilai yang **sama persis**.

Dua-duanya harus cocok. Frontend nolak lebih awal biar siswa gak nunggu submit,
backend nolak lagi pakai Haversine — jadi orang gak bisa bypass cuma dengan
ngutak-ngatik JS di browser.

---



### Cek setelah deploy

- Buka link di HP → izin lokasi + kamera muncul (kalau gak muncul, berarti bukan HTTPS)
- Tombol **Ambil Lokasi Presisi** → lat/lng/akurasi keisi
- Submit → muncul "Absensi diterima"
- Buka spreadsheet → baris baru nongol di `Data_Absensi`

---

## Backend (`Code.gs`)

Ditaruh di Apps Script yang nyambung ke spreadsheet. Isinya:

| Bagian | Fungsi |
|---|---|
| `doGet(e)` | Health check. Balikin `{"status":"ok"}` |
| `doPost(e)` | Terima absensi, validasi, tulis ke sheet |
| `haversine()` | Hitung jarak siswa ke titik sekolah (meter) |
| `LockService` | Kunci saat nulis — 10 siswa submit barengan gak tabrakan |
| Anti-dobel | 1 nama/NIS cuma boleh absen 1x per hari |

Deploy: **Deploy → Manage deployments → pensil → Version: New version → Deploy.**
URL `/exec` gak berubah kalau cuma bikin versi baru.

---

## Alur Absen Siswa

1. Guru paste link ke grup WA/Telegram kelas
2. Siswa klik → kebuka di browser HP (gak ada install)
3. Browser minta izin **lokasi** → tap Izinkan
4. Browser minta izin **kamera** → selfie
5. Tap Kirim → ±3 detik → selesai

HP Android 2018 pun jalan. Gak ada yang perlu download.

---

## Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Izin lokasi gak muncul | Bukan HTTPS | Deploy lewat Netlify/Cloudflare/GitHub Pages |
| "Akurasi GPS (78m) terlalu rendah" | Sinyal lemah / di dalam gedung | Keluar ruangan, tunggu GPS lock, ulangi |
| "Lokasi ... di luar radius" | Beneran di luar area, atau koordinat salah | Cek `Config_Sekolah` di spreadsheet dan `CONFIG.school` di `app.js` |
| "Kamu sudah melakukan absensi hari ini!" | Anti-dobel jalan | Memang begitu — 1 absen per hari |
| Submit sukses tapi sheet kosong | Sheet/kolom beda nama | Pastikan tab `Data_Absensi` ada, header di baris 1 |
| `403` di webhook | Deploy belum "Anyone" | Manage deployment → Who has access → **Anyone** |

---

## Roadmap

- **Phase 1 (sekarang)** — Google Sheets + Apps Script, 1 sekolah, gratis
- **Phase 2** — Supabase + RLS, multi-sekolah (`org_id`), dashboard admin, laporan bulanan

---

**Dibuat oleh:** Kiann
**Lisensi:** MIT
**Status:** Phase 1 MVP live di SMK Yappa Depok
