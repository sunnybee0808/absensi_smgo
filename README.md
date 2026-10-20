# Absensi SMGO

Aplikasi absensi On Duty / Off Duty untuk **SMGO Taxi Service**: login Discord, wajib Full Name, tarif per role yang bisa diatur, dan ekspor Excel per periode.

**Teknologi:** React 18 + Vite (frontend), Node.js + Express (server), SQLite (database), ExcelJS (file Excel).

## Fitur

- **Login dengan Discord.** Bisa dibatasi hanya untuk anggota server Discord SMGO.
- **Wajib isi Full Name** saat login pertama. Setelah disimpan, hanya admin yang bisa mengubahnya.
- **On Duty / Off Duty** untuk diri sendiri. Jam dicatat oleh server, jadi tidak bisa diakali dengan mengubah jam di HP. Papan tugas menampilkan siapa yang sedang on duty.
- **Role dan tarif:** Driver Junior, Driver Reguler, Driver Senior, Manager, dan CEO. Setiap role diatur "$X setiap N menit/jam".
- **Dua cara menghitung upah:** blok waktu penuh (sisa diabaikan) atau proporsional per menit.
- **Pengajuan cuti:** setiap karyawan bisa mengajukan cuti (Cuti Tahunan, Sakit, Izin Pribadi, atau Lainnya) dengan tanggal dan alasan. Pengajuan **wajib disetujui oleh karyawan dengan role Manager atau CEO**. Detailnya ada di bagian "Alur cuti".
- **Status karyawan:** Resign, SP 1, SP 2, SP 3 & PHK, dan SP 3 & PTDH, masing-masing dengan alasan. Hanya Manager atau CEO yang bisa mengubahnya.
- **Laporan per periode:** Hari ini, Minggu ini, Bulan ini, Bulan lalu, atau tanggal pilihan.
- **Ekspor Excel (.xlsx)** dengan sheet Rekap (termasuk kolom Hari Cuti, Status Karyawan, Tanggal Berakhir Kerja, dan SP), Rincian, Cuti, Status Karyawan, dan Info.
- **Admin bisa:**
  - mencatat atau mengoreksi jam secara manual,
  - menentukan role setiap karyawan,
  - menjadikan orang lain admin,
  - menonaktifkan akun,
  - mengubah nama karyawan.
- **Karyawan biasa** hanya melihat catatan dan laporan miliknya sendiri.

## Struktur project

```
smgo-absensi/
├── index.html              # halaman utama Vite
├── vite.config.mjs         # konfigurasi Vite + proxy ke server saat development
├── package.json            # semua dependency & script
├── .env.example            # contoh konfigurasi (salin jadi .env)
├── Dockerfile              # untuk deploy dengan Docker
├── public/
│   ├── logo.png            # logo SMGO
│   └── icon.png            # ikon tab browser
├── src/                    # frontend React
│   ├── main.jsx
│   ├── App.jsx             # pemilih layar: login → isi Full Name → aplikasi
│   ├── api.js              # pemanggil API
│   ├── toast.js            # notifikasi
│   ├── utils.jsx           # format waktu/uang, jam berjalan, avatar, tombol konfirmasi
│   ├── styles.css          # seluruh tampilan
│   └── components/
│       ├── LoginScreen.jsx
│       ├── NameScreen.jsx
│       ├── MainApp.jsx     # header, tab, pengambilan data
│       ├── AbsenView.jsx   # status saya, papan tugas, catat manual, catatan terbaru
│       ├── CutiView.jsx    # ajukan cuti, pengajuan saya, persetujuan, riwayat
│       ├── StaffView.jsx   # status karyawan: Resign, SP 1, SP 2, SP 3 & PHK, SP 3 & PTDH
│       ├── LaporanView.jsx # periode, rekap, cuti, rincian, unduh Excel
│       ├── AturView.jsx    # tarif per role & daftar karyawan
│       └── ShiftTable.jsx
└── server/                 # backend Express
    ├── index.js            # login Discord, API, perhitungan upah, ekspor Excel
    └── db.js               # skema SQLite & tarif bawaan
```

## Persiapan

### 1. Buat aplikasi Discord

1. Buka https://discord.com/developers/applications lalu klik **New Application**.
2. Buka menu **OAuth2**. Salin **Client ID**, lalu klik **Reset Secret** dan salin **Client Secret**.
3. Di **Redirects**, tambahkan alamat berikut:
   - Development: `http://localhost:5173/auth/discord/callback`
   - Online: `https://alamat-anda.com/auth/discord/callback`

Alamat redirect harus sama persis dengan `BASE_URL` + `/auth/discord/callback`.

### 2. Isi konfigurasi

```bash
cp .env.example .env
```

| Variabel | Keterangan |
|---|---|
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Dari langkah 1 |
| `ADMIN_DISCORD_IDS` | User ID Discord admin. Aktifkan Discord → Settings → Advanced → Developer Mode, lalu klik kanan nama Anda → Copy User ID. |
| `DISCORD_GUILD_ID` | Opsional. Server ID Discord SMGO, agar hanya anggota server yang bisa login. |
| `SESSION_SECRET` | String acak minimal 16 karakter: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BASE_URL` | `http://localhost:5173` saat development, atau alamat `https://` saat online |
| `TZ_ZONE` | Zona waktu, bawaan `Asia/Jakarta` |

**Jangan pernah meng-upload file `.env` ke GitHub.** File ini sudah tercantum di `.gitignore`.

## Menjalankan di komputer sendiri

Perlu **Node.js 20 atau lebih baru**.

```bash
npm install
npm run dev
```

Buka **http://localhost:5173**. Perintah ini menjalankan dua hal sekaligus:

- Vite di port 5173 untuk tampilan, dengan reload otomatis saat file diubah.
- Server Express di port 3000 untuk API dan login.

**Mencoba tanpa Discord:** isi `DEV_LOGIN=1` di `.env`. Halaman login akan menampilkan form "Masuk uji". Agar akun uji menjadi admin, masukkan ID ujinya (misalnya `dev1`) ke `ADMIN_DISCORD_IDS`.

**Menjalankan versi production di komputer sendiri:**

```bash
npm run build      # membuat folder dist/
npm start          # server menyajikan dist/ + API di port 3000
```

Untuk mode ini, ubah `BASE_URL=http://localhost:3000` dan tambahkan redirect-nya di Discord.

## Upload ke GitHub

```bash
git init
git add .
git commit -m "Absensi SMGO"
git branch -M main
git remote add origin https://github.com/USERNAME/smgo-absensi.git
git push -u origin main
```

Cara lain: buat repository baru di github.com, lalu pilih **uploading an existing file** dan tarik seluruh isi folder ke sana. Folder `node_modules`, `dist`, `data`, dan file `.env` tidak perlu di-upload.

## Deployment (online)

Aplikasi menyimpan data di file SQLite, jadi hosting harus punya **disk permanen**. GitHub Pages, Vercel, dan Netlify **tidak cocok**: GitHub Pages hanya untuk halaman statis tanpa server, sedangkan Vercel dan Netlify tidak menyimpan file database secara permanen.

Di semua pilihan di bawah, isi environment variable yang sama dengan `.env`. Untuk server online, pastikan:

- `NODE_ENV=production`
- `BASE_URL=https://alamat-anda`
- `DB_PATH` mengarah ke disk permanen

Tambahkan juga redirect `https://alamat-anda/auth/discord/callback` di Discord Developer Portal.

### Pilihan A: Railway (paling mudah, terhubung ke GitHub)

1. Buka railway.app, pilih **New Project → Deploy from GitHub repo**, lalu pilih repository ini. Railway otomatis memakai `Dockerfile`.
2. Buka **Variables** dan isi semua variabel di atas, termasuk `DB_PATH=/data/absensi.db`.
3. Buka **Settings → Volumes** lalu tambahkan volume dengan mount path `/data`.
4. Buka **Settings → Networking → Generate Domain**. Isi domain itu ke `BASE_URL` dan ke redirect Discord.

### Pilihan B: Render

1. Pilih **New → Web Service → Connect repository**. Runtime: **Docker**.
2. Tambahkan **Disk** dengan mount path `/data`. Fitur ini perlu paket berbayar.
3. Isi environment variable seperti di atas.

### Pilihan C: VPS (DigitalOcean, Contabo, IDCloudHost, dan sejenisnya)

```bash
git clone https://github.com/USERNAME/smgo-absensi.git
cd smgo-absensi
cp .env.example .env    # lalu isi
npm ci
npm run build
npm install -g pm2
pm2 start server/index.js --name absensi-smgo
pm2 save && pm2 startup
```

Setelah itu pasang **Nginx** sebagai reverse proxy ke `http://localhost:3000` dan aktifkan HTTPS dengan Let's Encrypt (`certbot --nginx`).

### Pilihan D: Docker di server sendiri

```bash
docker build -t absensi-smgo .
docker run -d --name absensi-smgo -p 3000:3000 --env-file .env -v absensi-data:/data absensi-smgo
```

### Backup

Salin file database secara berkala: `data/absensi.db` saat lokal, atau `/data/absensi.db` di server.

## Alur cuti

1. Karyawan membuka tab **Cuti**, memilih jenis cuti, tanggal mulai dan selesai, menulis alasan, lalu menekan **Kirim pengajuan**.
   - Pengajuan ditolak jika tanggalnya bertabrakan dengan pengajuan lain yang masih menunggu atau sudah disetujui.
   - Satu pengajuan maksimal 90 hari.
2. Karyawan dengan role **Manager** atau **CEO** melihat angka merah di tab Cuti. Di bagian **Perlu Persetujuan**, mereka menekan **Setujui** atau **Tolak**. Penolakan wajib disertai alasan.
3. Aturan persetujuan:
   - Hanya role Manager atau CEO yang bisa menyetujui. Admin yang bukan Manager atau CEO hanya bisa melihat.
   - Tidak ada yang bisa menyetujui cuti miliknya sendiri. Cuti seorang Manager harus disetujui Manager lain atau CEO, dan sebaliknya.
   - Pengajuan yang sudah diputuskan tidak bisa diubah lagi.
4. Karyawan melihat status di **Pengajuan Saya**. Pengajuan yang masih menunggu bisa dibatalkan.
5. Di laporan dan file Excel:
   - Sheet **Cuti** berisi semua pengajuan pada periode itu (menunggu, disetujui, dan ditolak) beserta nama penyetuju, waktu keputusan, dan catatannya.
   - Kolom **Hari Cuti (disetujui)** di sheet Rekap hanya menghitung cuti yang disetujui. Hari dihitung per hari kalender dan dipotong sesuai periode. Contoh: cuti 30 Okt–2 Nov dihitung 2 hari di laporan Oktober dan 2 hari di laporan November.

Cuti tidak mengubah perhitungan upah. Upah tetap hanya dihitung dari jam On Duty.

## Status Karyawan (Resign, SP, PHK, PTDH)

Tab **Status Karyawan** menyimpan riwayat tindakan kepegawaian setiap karyawan. Setiap tindakan **wajib disertai alasan** berupa teks bebas.

| Tindakan | Efek |
|---|---|
| **Resign** | Hubungan kerja berakhir mulai tanggal berlaku |
| **SP 1** | Surat peringatan. Karyawan tetap bekerja seperti biasa. |
| **SP 2** | Surat peringatan. Karyawan tetap bekerja seperti biasa. |
| **SP 3 & PHK** | Hubungan kerja berakhir mulai tanggal berlaku |
| **SP 3 & PTDH** | Hubungan kerja berakhir mulai tanggal berlaku |

**Hak akses:**

- Hanya role **Manager** atau **CEO** yang bisa mencatat atau membatalkan tindakan.
- Admin yang bukan Manager atau CEO hanya bisa melihat.
- Driver tidak bisa melihat tab ini.
- Tidak ada yang bisa mengubah status dirinya sendiri.

**Cara kerja:**

1. Pilih karyawan, tekan **Catat tindakan**, lalu pilih jenis, tanggal berlaku, dan tulis alasannya.
2. Setiap catatan menyimpan siapa yang mencatat dan kapan. Tombol **Riwayat** menampilkan semua catatan.
3. Catatan yang salah bisa **dibatalkan**. Catatan yang dibatalkan tidak dihapus, tetapi ditandai beserta siapa yang membatalkan.
4. Untuk tindakan yang mengakhiri hubungan kerja (Resign, SP 3 & PHK, SP 3 & PTDH):
   - Mulai tanggal berlaku, karyawan tidak bisa On Duty, tidak bisa mengajukan cuti, dan namanya hilang dari Papan Tugas.
   - Ia tetap bisa login untuk melihat riwayatnya sendiri.
   - Jika tanggal berlaku hari ini atau sudah lewat, shift yang masih aktif langsung ditutup.
   - Tanggal boleh dijadwalkan ke depan, dengan status "Akan …".
   - Cuti menunggu yang dimulai setelah tanggal itu otomatis dibatalkan.
   - Hanya satu status berakhir yang boleh aktif. Untuk menggantinya (misalnya dari Resign ke PHK), batalkan dulu catatan lama.
5. Kolom "SP tercatat" menampilkan SP tertinggi (SP 1 atau SP 2) yang belum dibatalkan.

**Di Excel** (khusus Manager, CEO, dan admin):

- Sheet Rekap memiliki kolom **Status Karyawan**, **Tanggal Berakhir Kerja**, dan **SP Tercatat**.
- Sheet **Status Karyawan** berisi semua tindakan yang berlaku pada periode itu beserta alasan, pencatat, dan waktunya.

Driver yang mengunduh laporannya sendiri hanya melihat status kerjanya, tanpa informasi SP.

Tombol **Aktif** di tab Tarif & Karyawan (khusus admin) berbeda: tombol itu memblokir login sepenuhnya.

Database lama, termasuk data resign dari versi sebelumnya, otomatis dipindahkan ke riwayat baru saat server dijalankan. Tidak ada data yang hilang.

## Perbedaan dengan versi Claude Artifacts

Versi pertama aplikasi ini berjalan di dalam Claude Artifacts dan memakai layanan khusus Claude. Semuanya sudah diganti di project ini:

| Fitur di Claude Artifacts | Pengganti di project ini |
|---|---|
| Database bersama (`claude.use("db")`) untuk tarif, karyawan, dan shift | SQLite di server (`server/db.js`), diakses lewat API Express |
| Identitas pengguna dari akun Claude (`claude.use("user")`) dan hak akses Editor/Contributor | Login Discord OAuth2. Admin ditentukan oleh `ADMIN_DISCORD_IDS` dan tombol Admin di tab Tarif & Karyawan. |
| Unduhan file (`claude.use("downloads")`) dengan Excel dibuat di browser (SheetJS) | Excel dibuat di server dengan ExcelJS dan diunduh lewat link biasa (`/api/export`) |
| Pembaruan otomatis antar-pengguna (realtime) | Papan tugas dan catatan disegarkan otomatis setiap 20 detik |
| Mode lokal (`localStorage`) saat database Claude tidak tersedia | Tidak diperlukan karena data selalu tersimpan di server |
| Jam absen diambil dari perangkat pengguna | Jam diambil dari server, jadi lebih aman dari kecurangan |

Kode project ini tidak lagi memakai `window.claude` maupun layanan Claude apa pun.

## Catatan perhitungan

- **Blok penuh:** `floor(menit kerja ÷ menit per blok) × dollar`. Contoh: 2 jam 15 menit dengan tarif $3 per 30 menit = 4 blok = $12.
- **Proporsional:** `(menit kerja ÷ menit per blok) × dollar`. Contoh yang sama menghasilkan $13.50.
- Upah dihitung dengan tarif yang berlaku saat laporan dibuat. Role yang dipakai adalah role karyawan saat shift dimulai.
- Shift yang belum Off Duty belum dihitung upahnya.
