# QuizMind AI: Generator Kuis Gemini 3.8 Flash & Google Grounding

Aplikasi kuis interaktif bertenaga **Gemini 3.8 Flash** dengan kemampuan **berpikir mendalam (deep thinking)** dan **Google Search Grounding** untuk menghasilkan butir-butir soal berkualitas tinggi, bebas halusinasi, dan dilengkapi verifikasi sumber rujukan faktual.

---

## Fitur Utama

- **Model Gemini 3.8 Flash**: Penalaran mendalam (*deep thinking*) dalam menyusun opsi jawaban, distractor realistis, dan pembahasan analitis.
- **Google Search Grounding Terintegrasi**: Memvalidasi fakta ilmiah, peristiwa sejarah, dan konsep terkini secara langsung via mesin pencari Google, lengkap dengan tautan sumber web yang dapat diverifikasi.
- **API Key Pribadi & Backend Opsional**:
  - Pengguna GitHub Pages memasukkan kunci Gemini sendiri. Key aktif berada dalam memori halaman dan dikirim langsung ke Google. Vault opsional menyimpan hanya ciphertext di `localStorage`, terpisah dari riwayat kuis.
  - Hosting Node.js/Express juga mendukung kunci milik server (`process.env.GEMINI_API_KEY`), yang tidak dimasukkan ke bundle browser.
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

## Deployment GitHub Pages

Halaman aplikasi diterbitkan di `https://darlayx1.github.io/Quiz-Mind-AI/`
melalui workflow `.github/workflows/pages.yml` setiap push ke `main`.
Pengguna mengisi kolom **API Key Pribadi**, memilih materi, lalu membuat kuis.
Browser menghubungi Google Gemini secara langsung sehingga tidak memerlukan backend
Render atau konfigurasi `VITE_API_BASE_URL`. Kunci disamarkan secara bawaan,
dapat disimpan terenkripsi, dibuka dengan kata sandi setelah reload, diganti tanpa build ulang, dikunci, atau dihapus.
Kuota dan akses model mengikuti proyek Google milik masing-masing pengguna.

Sebagai pilihan untuk menggunakan kunci milik server, backend dapat dibuat dari `render.yaml` menggunakan
[Deploy to Render](https://render.com/deploy?repo=https://github.com/Darlayx1/Quiz-Mind-AI).
Pasang `GEMINI_API_KEY` sebagai secret di Render. Setelah backend aktif, atur
repository variable `VITE_API_BASE_URL` di GitHub ke URL HTTPS layanan Render
(tanpa `/api`), lalu jalankan ulang workflow **Deploy GitHub Pages**.
`VITE_API_BASE_URL` hanya alamat backend, bukan API key.

Jangan masukkan API key ke repository atau variabel dengan awalan `VITE_`.

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
privat untuk pemilik. GitHub Pages menggunakan API key pribadi melalui browser;
endpoint server dan demo vault hanya tersedia jika menggunakan backend.

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

## Pilihan model & pengalaman belajar

Menu pembuatan kuis menyediakan enam model: **Gemini 3.8 Flash**, **Gemini 3.7 Flash**, **Gemini 3.6 Flash**, **Gemini 3.5 Flash**, **Gemini 3.5 Flash Lite**, dan **Gemma 4 31B** (`gemma-4-31b-it`). Pilihan diterapkan pada API server, Worker, dan mode API key pribadi di browser. Konfigurasi lama tanpa `model` tetap menggunakan Gemini 3.8 Flash. ID model mengikuti [katalog Gemini API](https://ai.google.dev/gemini-api/docs/models) dan [dokumentasi Gemma pada Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api).

Jika model tidak tersedia, sistem mencoba model lainnya lalu `gemini-flash-latest`. Kuis menyimpan `requestedModel`, `model` aktual, dan `usedGrounding` agar halaman hasil menjelaskan penggunaan model cadangan dan status pencarian web. Ketersediaan dan kuota mengikuti proyek Google pengguna. Referensi yang dihasilkan AI tetap perlu ditinjau.

Tampilan menu, pengerjaan, dan hasil menggunakan desain indigo yang konsisten dengan layout responsif, ringkasan pengaturan, progres jawaban, timer berbasis waktu nyata, filter benar/salah/belum dijawab, dan navigasi keyboard.

Konfigurasi dibagi menjadi materi, ritme kuis, partner AI, dan personalisasi:

- Sembilan tingkat kesulitan: primitif, sangat mudah, mudah, sedang, menengah, sulit, sangat sulit, master, dan grand master. Masing-masing memiliki arahan penalaran tersendiri di prompt AI.
- Jumlah soal: 5, 10, 15, 20, atau custom berupa bilangan bulat 1–100. Hasil AI harus memuat tepat jumlah soal yang diminta; hasil tidak lengkap menghasilkan pesan untuk mencoba kembali.
- **Non sekuensial**: semua soal ditampilkan dan dapat dikerjakan atau ditinjau dengan urutan bebas. Slider mengatur durasi total 1–120 menit. Saat waktu habis, jawaban otomatis dikumpulkan.
- **Sekuensial**: satu soal per langkah, tanpa kembali ke soal sebelumnya. Slider mengatur 15–600 detik per soal dengan langkah 15 detik. Waktu direset setelah beralih; saat habis, soal dikunci dan kuis otomatis melanjutkan. Setelah soal terakhir, jawaban otomatis dikumpulkan.
- Kedua mode mendukung **tanpa batas**; nilai timer aktif `0` menonaktifkan countdown. Waktu pengerjaan tetap dicatat. Timer menggunakan deadline absolut agar tetap akurat saat tab tidak aktif.
- Gaya bahasa opsional menerima saran atau teks bebas, maksimal 500 karakter. Instruksi tambahan opsional menerima maksimal 2.000 karakter. Kedua preferensi dikirim ke AI dan disimpan bersama kuis.

Validasi bersama berada di `src/quizConfig.ts`. Kuis lama tetap dapat dibuka; konfigurasi lama `beginner`, `advanced`, dan `expert` dipetakan ke level baru saat digunakan untuk membuat kuis.

Verifikasi lokal: `npm run lint`, `npm run build`, `node --import tsx scripts/model-test.ts`, dan `node scripts/smoke-test.mjs`. Tes model menggunakan respons tiruan sehingga tidak memakai kuota Gemini.

Untuk memeriksa alur pengerjaan tanpa API atau penyimpanan riwayat, jalankan `npm run dev`, lalu buka `/scripts/quiz-session-preview.html`. Fixture lokal menyediakan kedua mode dengan dan tanpa timer singkat untuk menguji navigasi, penguncian jawaban, dan pengumpulan otomatis. Halaman fixture tidak disertakan dalam build produksi.

## Vault API key pribadi

Pada menu **API key pribadi**, masukkan key dan kata sandi unik minimal 12 karakter, ulangi kata sandi, lalu pilih **Simpan terenkripsi**. Untuk memakai key kembali setelah reload, masukkan kata sandi dan pilih **Buka vault**. Penggantian memakai kolom key pengganti dan kata sandi untuk salinan baru; key lama hanya ditimpa setelah enkripsi dan penyimpanan berhasil. Status aktif berarti key telah dipasang untuk permintaan berikutnya, bukan validasi kredensial Google.

- AES-256-GCM melalui Web Crypto, salt acak 16 byte, IV acak 12 byte pada setiap penyimpanan, dan PBKDF2-SHA-256 sebanyak 600.000 iterasi. Kunci enkripsi tidak dapat diekspor. Tidak ada API key atau kata sandi yang ditanam dalam kode/bundle.
- Kata sandi dan key enkripsi tidak disimpan. Vault tersimpan hanya pada profil browser dan origin situs tersebut, tanpa sinkronisasi akun. Vault memerlukan HTTPS atau localhost. Jika penyimpanan ditolak, gunakan **Gunakan tanpa menyimpan** untuk sesi ini.
- Reload dan **Kunci / kosongkan sesi** membersihkan key aktif. Setelah 15 menit tanpa aktivitas keyboard/klik, aplikasi juga mengosongkan key aktif. Permintaan Google yang sudah berjalan dapat tetap selesai.
- Perubahan vault dari tab lain mengosongkan key aktif pada semua tampilan agar pengguna membuka key terbaru. Penghapusan permanen memerlukan konfirmasi di menu dan tidak mencabut key di Google; pencabutan dilakukan di AI Studio.
- Kata sandi tidak dapat dipulihkan. Jika lupa, hapus vault lalu simpan API key kembali. Enkripsi melindungi salinan tersimpan; skrip berbahaya pada origin yang sama atau perangkat terkompromi dapat membaca key ketika aktif. Jangan gunakan vault pada perangkat bersama.

Implementasi: src/personalKeyVault.ts dan src/components/PersonalKeyManager.tsx. Verifikasi vault: node --import tsx scripts/key-vault-test.ts.
