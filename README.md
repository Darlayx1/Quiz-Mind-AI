# QuizMind AI: Generator Kuis Gemini 3.8 Flash & Google Grounding

Aplikasi kuis interaktif bertenaga **Gemini 3.8 Flash** dengan kemampuan **berpikir mendalam (deep thinking)** dan **Google Search Grounding** untuk menghasilkan butir-butir soal berkualitas tinggi, bebas halusinasi, dan dilengkapi verifikasi sumber rujukan faktual.

---

## Fitur Utama

- **Model Gemini 3.8 Flash**: Penalaran mendalam (*deep thinking*) dalam menyusun opsi jawaban, distractor realistis, dan pembahasan analitis.
- **Google Search Grounding Terintegrasi**: Memvalidasi fakta ilmiah, peristiwa sejarah, dan konsep terkini secara langsung via mesin pencari Google, lengkap dengan tautan sumber web yang dapat diverifikasi.
- **Keamanan Server-Side & Enkripsi AES-256-GCM**:
  - API Key **100% aman** di server Node.js/Express (`process.env.GEMINI_API_KEY`) dan tidak pernah bocor ke bundle JavaScript browser.
  - File `.env` diproteksi secara otomatis melalui `.gitignore` sehingga aman saat di-push ke GitHub.
  - Modul vault kriptografi AES-256-GCM terotentikasi untuk perlindungan token dan integritas kuis.
- **Pengerjaan Kuis Interaktif**:
  - Live countdown timer dengan format MM:SS.
  - Matriks navigasi nomor soal dan penanda ragu-ragu (*bookmark*).
  - Penilaian instan dengan rincian akurasi, waktu pengerjaan, dan analisis kekuatan belajar.
  - Pembahasan mendalam langkah-demi-langkah beserta sitasi Google Grounding.
- **Penyimpanan Lokal & Ekspor**:
  - Riwayat kuis otomatis tersimpan di peramban (`localStorage`).
  - Fitur cetak / simpan lembar evaluasi dalam format PDF.

---

## Panduan Instalasi & Menjalankan Aplikasi

### 1. Prasyarat
- Node.js versi 22.12 atau lebih baru
- NPM

### 2. Kloning & Instalasi Dependensi
```bash
git clone https://github.com/Darlayx1/Quiz-Mind-AI.git
cd Quiz-Mind-AI
npm ci
```

### 3. Konfigurasi Lingkungan (.env)
Salin file template `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Buka file `.env` dan masukkan API Key Google Gemini Anda:
```env
GEMINI_API_KEY="AIzaSy..."
PORT=3000
```
> **Catatan**: Dapatkan API Key Gemini secara gratis di [Google AI Studio](https://aistudio.google.com/).

### 4. Menjalankan Server Development
```bash
npm run dev
```
Buka peramban di `http://localhost:3000`.

### 5. Build dan Deployment Produksi

```bash
npm ci
npm run lint
npm run build
node scripts/smoke-test.mjs
npm start
```

`npm start` menjalankan server produksi dari `dist-server/server.js` dan melayani
halaman dari `dist`. Port mengikuti variabel `PORT` dari penyedia hosting, dengan
default `3000`. Gunakan Node.js 22.12 atau lebih baru. Build juga menghasilkan
Worker ESM untuk Sites di `dist/server/index.js`, berisi halaman, aset, dan API.

Di pengaturan lingkungan hosting, pasang `GEMINI_API_KEY` sebagai secret dan
`ENCRYPTION_SECRET` sebagai secret acak. Jangan gunakan awalan `VITE_` untuk
kredensial, karena variabel tersebut masuk ke bundle browser. Situs dapat dibuka
tanpa kunci Gemini; pembuatan kuis memerlukan kunci yang valid dan kuota tersedia.
`/api/health` mengembalikan status pemasangan kunci tanpa menampilkan kunci lengkap.

Sites menggunakan identitas pada `.openai/hosting.json`. Publikasi awal bersifat
privat untuk pemilik. Hosting statis saja (misalnya GitHub Pages) tidak dapat
menjalankan endpoint server Gemini aplikasi ini.

---

## Panduan Push Aman ke GitHub

File `.gitignore` pada proyek ini sudah secara ketat mengecualikan file `.env*` dan hanya mengizinkan template `.env.example`.

Langkah-langkah push ke repositori GitHub:
```bash
# Inisialisasi git jika belum ada
git init

# Tambahkan seluruh file proyek
git add .

# Verifikasi bahwa .env TIDAK tercantum dalam daftar staged files
git status

# Lakukan commit
git commit -m "feat: quiz generator gemini 3.8 flash with deep thinking & google grounding"

# Tentukan branch utama
git branch -M main

# Sambungkan remote repositori Anda
git remote add origin https://github.com/USERNAME/quizmind-ai.git

# Push ke GitHub
git push -u origin main
```

---

## Struktur Arsitektur

```
├── server.ts                  # Server Express & proxy API Gemini 3.8 Flash
├── src/
│   ├── server/
│   │   ├── geminiService.ts   # Integrasi @google/genai dengan thinking & googleSearch
│   │   └── cryptoVault.ts     # Enkripsi & dekripsi AES-256-GCM
│   ├── types/
│   │   └── quiz.ts            # Tipe data TypeScript untuk kuis & grounding
│   ├── components/
│   │   ├── TopBar.tsx         # Navigasi 3 zona sesuai standar desain
│   │   ├── QuizCreator.tsx    # Form konfigurasi kuis & materi
│   │   ├── GenerationLoader.tsx # Visualisasi proses penalaran AI
│   │   ├── QuizRunner.tsx     # Runner pengerjaan kuis dengan timer
│   │   ├── QuizResults.tsx    # Hasil skor & lembar pembahasan
│   │   ├── QuizHistoryView.tsx# Riwayat kuis lokal
│   │   ├── SecurityGuideModal.tsx # Panduan keamanan & demo enkripsi
│   │   ├── ConfirmModal.tsx   # Dialog konfirmasi defensif
│   │   └── Button.tsx         # Komponen tombol standar
│   ├── App.tsx                # Orkestrasi state & alur aplikasi
│   ├── main.tsx               # Entry point React
│   └── index.css              # Tailwind CSS
├── .env.example               # Template variabel lingkungan publik
├── .gitignore                 # Proteksi ketat file kredensial
└── metadata.json              # Konfigurasi applet AI Studio
```
