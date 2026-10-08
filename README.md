# QuizMind AI: Generator Kuis Gemini & Groq

Aplikasi kuis interaktif dengan pilihan **Google Gemini** dan **Groq**, pengelolaan API key terpadu, serta Google Search Grounding pada model Gemini yang mendukung. Soal dilengkapi pembahasan; akurasi dan referensi keluaran AI tetap perlu ditinjau.

---

## Fitur Utama

- **Model Gemini 3.8 Flash**: Penalaran mendalam (*deep thinking*) dalam menyusun opsi jawaban, distractor realistis, dan pembahasan analitis.
- **Google Search Grounding Terintegrasi**: Memvalidasi fakta ilmiah, peristiwa sejarah, dan konsep terkini secara langsung via mesin pencari Google, lengkap dengan tautan sumber web yang dapat diverifikasi.
- **API Key Pribadi & Backend Opsional**:
  - Pengguna GitHub Pages memasukkan kunci Gemini atau Groq sendiri. Key aktif berada dalam memori halaman dan dikirim langsung ke penyedia yang dipilih. Vault opsional menyimpan hanya ciphertext di `localStorage`, terpisah dari riwayat kuis.
  - Hosting Node.js/Express juga mendukung kunci milik server (`process.env.GEMINI_API_KEY` / `process.env.GROQ_API_KEY`), yang tidak dimasukkan ke bundle browser.
  - File `.env` diproteksi secara otomatis melalui `.gitignore` sehingga aman saat di-push ke GitHub.
  - Vault multi-key AES-256-GCM, fallback berbasis proyek, cadangan terenkripsi, dan vault server dengan login pemilik.
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
Pengguna menambahkan key melalui **Koneksi AI**, memilih materi, lalu membuat kuis.
Browser menghubungi Gemini atau Groq secara langsung sehingga tidak memerlukan backend
Render atau konfigurasi `VITE_API_BASE_URL`. Kunci disamarkan secara bawaan,
dapat disimpan terenkripsi, dibuka dengan kata sandi setelah reload, diganti tanpa build ulang, dikunci, atau dihapus.
Kuota dan akses model mengikuti proyek Google milik masing-masing pengguna.

Sebagai pilihan untuk menggunakan kunci milik server, backend dapat dibuat dari `render.yaml` menggunakan
[Deploy to Render](https://render.com/deploy?repo=https://github.com/Darlayx1/Quiz-Mind-AI).
Pasang `GEMINI_API_KEY` dan/atau `GROQ_API_KEY` sebagai secret di Render. Setelah backend aktif, atur
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
endpoint server tersedia jika menggunakan backend; demo enkripsi berjalan lokal di browser.

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

Pilihan Gemini pada menu pembuatan kuis mencakup enam model: **Gemini 3.8 Flash**, **Gemini 3.7 Flash**, **Gemini 3.6 Flash**, **Gemini 3.5 Flash**, **Gemini 3.5 Flash Lite**, dan **Gemma 4 31B** (`gemma-4-31b-it`). Pilihan diterapkan pada API server, Worker, dan mode API key pribadi di browser. Konfigurasi lama tanpa `model` tetap menggunakan Gemini 3.8 Flash. ID model mengikuti [katalog Gemini API](https://ai.google.dev/gemini-api/docs/models) dan [dokumentasi Gemma pada Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api).

Pada vault multi-key, perpindahan model dan melanjutkan tanpa pencarian web dinonaktifkan secara bawaan; keduanya dapat diizinkan secara terpisah di Koneksi AI. Jalur Node/Worker dengan key hosting juga mengikuti cadangan model yang nonaktif secara bawaan. Pilihan Gemma 4 31B tetap menggunakan `gemma-4-31b-it`, tanpa perpindahan otomatis ke Gemini. Jalur Gemma menggunakan prompt teks gabungan tanpa Google Search; opsi referensi web dinonaktifkan untuk jalur ini. Kuis menyimpan `requestedModel`, `model` aktual, dan `usedGrounding` agar halaman hasil menjelaskan penggunaan model cadangan dan status pencarian web. Ketersediaan dan kuota mengikuti proyek Google pengguna. Referensi yang dihasilkan AI tetap perlu ditinjau.

Uji Gemma melalui API nyata: pasang `GEMINI_API_KEY` di `.env`, lalu jalankan `node --import tsx scripts/gemma-live-test.ts`. Tes ini menggunakan kuota API dan hanya lulus jika Gemma sendiri menghasilkan satu soal. Tes tiruan tidak membuktikan layanan Google sedang tersedia. Error `500 INTERNAL` atau `504 DEADLINE_EXCEEDED` pada API nyata harus diselesaikan sebelum menyatakan integrasi berhasil atau menerbitkan perubahan.

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

## Koneksi AI multi-key

Buka **Koneksi AI → API Key**, pilih Gemini atau Groq, lalu tempel key dan beri nama opsional. ID kelompok kuota, urutan 1–100, dan penambahan beberapa key (satu per baris) tersedia di pengaturan lanjutan. Maksimal 100 key; duplikat ditolak. Key baru aktif di memori sesi. Buka **Penyimpanan → Simpan terenkripsi** dengan kata sandi minimal 12 karakter untuk mempertahankan seluruh koleksi setelah reload.

- **Prioritas + cadangan otomatis** memakai key dengan prioritas terkecil yang siap digunakan. **Distribusi seimbang** membagi pekerjaan berbeda antar-key yang tersedia. Satu panggilan menggunakan satu key; tidak ada pengiriman serentak untuk kuis yang sama.
- **ID proyek Google diisi manual**, bukan dideteksi dari nilai API key. Key dalam proyek yang sama berbagi kuota dan satu izin permintaan serentak. Semua key tanpa ID proyek dikelompokkan bersama secara konservatif. Banyak key dari satu proyek tidak meningkatkan kuota Gemini.
- `401`/key tidak valid menonaktifkan pemilihan key sampai status direset atau key diganti. `403` menandai akses model terkait; masalah billing berlaku global. `429` memberi cooldown pada kelompok proyek; `retryDelay`/`Retry-After` dihormati bila tersedia. Kuota harian yang teridentifikasi menunggu hingga tengah malam Pacific (termasuk DST). Jika jenis kuota tidak diketahui, gunakan cooldown 60 detik dan pemeriksaan ulang.
- `5xx`/timeout mendapat retry terbatas dengan jeda dan jitter; gangguan internet, input salah, dan konten diblokir tidak memutar semua key. Maksimal tiga percobaan per panggilan, lima per batch termasuk fallback, dan batas keseluruhan sepuluh menit. Retry otomatis SDK dimatikan agar tidak mengalikan jumlah percobaan.
- Fallback key mempertahankan model. **Izinkan model Gemini cadangan** dan **Izinkan melanjutkan tanpa pencarian web** adalah pilihan terpisah dan bawaan mati. Gemma tetap memakai Gemma. Batch Gemma yang sudah selesai dipertahankan ketika batch berikutnya berpindah key.
- Status **Belum diuji** berbeda dari key yang berhasil dipakai. **Uji kredensial** hanya meminta daftar model; tidak menghasilkan token dan tidak membuktikan akses/kuota semua model. Pengujian dilakukan atas permintaan pengguna.
- Tambah, edit/ganti, ubah prioritas, aktif/nonaktif, hapus individual, reset status, dan hapus seluruh vault tersedia di panel. Perubahan browser harus disimpan kembali. Perubahan vault server otomatis tersimpan.

### Penyimpanan, migrasi, dan cadangan browser

AES-256-GCM memakai salt acak 16 byte, IV acak 12 byte, additional authenticated data, PBKDF2-SHA-256 600.000 iterasi, dan kunci enkripsi yang tidak dapat diekspor. Ciphertext memuat seluruh koleksi dan pengaturan. Kata sandi tidak disimpan. Menyimpan vault terbuka dengan kata sandi baru mengganti kata sandinya.

Vault satu key versi lama tetap bisa dibuka dengan kata sandi semula. **Simpan terenkripsi** memigrasikannya ke versi tiga; ciphertext lama baru dihapus setelah penyimpanan baru berhasil. Data lama tetap utuh jika penulisan baru gagal. Web Locks digunakan bila tersedia, bersama pemeriksaan perubahan ciphertext antar-tab; browser tanpa Web Locks memakai pemeriksaan perubahan sebagai perlindungan best effort.

**Cadangan terenkripsi → Ekspor** membuat file `.vault.json` dengan kata sandi cadangan tersendiri. **Impor** membuka cadangan dan menambahkan isinya; duplikat/konflik ditolak tanpa menimpa koleksi lama. Cadangan browser dan server memakai format yang sama. Impor ke browser perlu disimpan kembali. File cadangan yang sudah dibuat tetap memakai kata sandi saat ekspor.

Reload, **Kunci vault**, perubahan vault dari tab lain, dan 15 menit tanpa aktivitas mengunci sesi dan menghentikan percobaan berikutnya. Tombol **Batalkan pembuatan kuis** menghentikan permintaan browser bila didukung; operasi yang sudah diterima penyedia AI dapat tetap berjalan dan menggunakan kuota. Form kuis tidak direset. Enkripsi data tersimpan tidak melindungi key yang sedang terbuka dari XSS/perangkat terkompromi.

Vault browser hanya tersimpan pada profil browser dan origin tersebut. Penghapusan data situs, mode privat, atau kerusakan perangkat dapat menghilangkannya; buat cadangan dan simpan kata sandi secara terpisah. Lupa kata sandi tidak dapat dipulihkan. Menghapus key di aplikasi tidak mencabutnya di Google AI Studio.

### Vault server lintas perangkat

Backend **Node.js 22.12+** menyediakan satu akun pemilik untuk pengelolaan key pribadi lintas perangkat. Ini bukan layanan multi-tenant dengan registrasi pengguna. GitHub Pages dan Worker statis menggunakan vault browser; untuk vault server, pasang backend Node dengan penyimpanan persisten. Disarankan melayani frontend dan backend pada origin HTTPS yang sama (`npm start` sudah melayani keduanya).

1. Jalankan `npm run vault:password` di terminal interaktif. Kata sandi minimal 12 karakter tidak ditampilkan; perintah menghasilkan hash scrypt untuk `VAULT_PASSWORD_HASH`.
2. Di secret manager/pengaturan secret hosting, pasang `VAULT_USERNAME`, `VAULT_PASSWORD_HASH`, dan `ENCRYPTION_SECRET` acak khusus minimal 32 karakter. Jangan memakai API key atau secret contoh sebagai kunci enkripsi. Contoh pembuat secret lokal: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Jangan masukkan secret ke repository atau variabel `VITE_*`.
3. Pasang volume/disk persisten dan arahkan `DATA_DIR` ke direktori privat di volume tersebut, di luar direktori aset publik. Vault disimpan sebagai SQLite terenkripsi dengan transaksi dan pemeriksaan versi. Hosting free dengan disk sementara tidak memenuhi penyimpanan permanen; blueprint Render lama belum memasang disk persisten atau login pemilik.
4. Gunakan `NODE_ENV=production` dan HTTPS. Jika ada satu reverse proxy tepercaya, pasang `TRUST_PROXY=true`. Untuk frontend origin lain, atur `CORS_ORIGIN` secara tepat dan `VITE_API_BASE_URL`; cookie lintas situs memerlukan HTTPS dan dapat diblokir oleh kebijakan browser. Origin yang sama menghindari ketergantungan cookie pihak ketiga.
5. Buka **Koneksi AI → Penyimpanan → Server · lintas perangkat → Masuk ke server**, lalu tambahkan key. UI menerima metadata/status dan empat karakter terakhir, tanpa menerima key lengkap kembali. API key baru dikirim lewat HTTPS ke backend dan disimpan terenkripsi.

Login menggunakan hash scrypt, pembatasan percobaan, cookie HttpOnly/Secure, sesi 15 menit, dan token CSRF untuk setiap operasi perubahan/generasi. Origin yang tidak sesuai ditolak. Backend mendukung maksimal tiga pekerjaan berbeda per akun, mencegah permintaan identik yang berjalan bersamaan, dan mempertahankan batas satu panggilan per proyek. Mutasi vault ditolak selama generasi berjalan. Sesi hilang ketika server restart; ciphertext tetap tersimpan pada disk persisten.

Build produksi memasang Content Security Policy untuk membatasi skrip pada origin sendiri dan koneksi pada Google, Groq, serta backend yang dikonfigurasi. Header Node/Worker mencegah MIME sniffing, embedding dalam frame, dan pengiriman referrer. Notifikasi fallback server dikirim bertahap selama generasi, sehingga pengguna dapat melihat perpindahan key sebelum kuis selesai.

Saat vault server dikonfigurasi, endpoint generasi membutuhkan login dan CSRF; key server lama tidak menjadi jalan pintas tanpa autentikasi. Tanpa konfigurasi login, jalur `GEMINI_API_KEY` dan `GROQ_API_KEY` hosting tetap tersedia untuk deployment lama. Endpoint enkripsi/dekripsi publik telah dihapus pada Node dan Worker; demo keamanan berjalan lokal di browser.

Rotasi API key melalui **Edit / ganti**; cabut key lama di Google setelah penggantian berhasil. Untuk mengganti kata sandi akun server, buat hash baru dan restart server. Untuk mengganti master secret enkripsi, ekspor cadangan terenkripsi terlebih dahulu, hentikan server, simpan salinan aman database dan master secret lama, pasang master secret baru dengan `DATA_DIR` baru/kosong, lalu login dan impor cadangan. Jangan mengganti master secret langsung pada database lama karena data tidak lagi dapat didekripsi. Backup master secret di secret manager terpisah dari database.

Verifikasi tanpa panggilan Google nyata:

```bash
npm run lint
npm run test:keys
node --import tsx scripts/key-vault-test.ts
node --import tsx scripts/model-test.ts
node --import tsx scripts/gemma-resilience-test.ts
npm run build
node scripts/smoke-test.mjs
```

Pengujian mencakup migrasi, salah kata sandi, perubahan ciphertext, penulisan gagal, konflik versi, duplikat, kuota bersama, retry budget, pembatalan, concurrency, reset Pacific/DST, kelanjutan batch Gemma, login/CSRF, ciphertext pada disk, dan persistensi setelah restart. Tes tiruan tidak membuktikan ketersediaan layanan Google atau validitas key pengguna.

## Koneksi AI terpadu: Gemini dan Groq

Buka **Koneksi AI** pada top bar atau **Kelola Koneksi AI** pada pembuat kuis. Desktop menggunakan jendela pengaturan di dalam aplikasi; ponsel menggunakan layar penuh. Menutup jendela mempertahankan sesi. Perubahan yang belum disimpan ditandai dan diperingatkan sebelum penutupan/reload.

- **Ringkasan**: penyedia utama, status key hosting atau koleksi pribadi, serta akses cepat untuk menambahkan key.
- **API Key**: pilih Gemini/Groq → tempel key → beri nama opsional → uji koneksi → tambahkan. Key pertama otomatis menetapkan penyedia utama. Uji koneksi hanya membaca daftar model. Key server diuji melalui backend setelah ditambahkan; key tidak dikirim kembali ke browser. Filter penyedia, edit/ganti, aktif/nonaktif, dan hapus tersedia per koneksi. Urutan, kelompok kuota, penambahan massal, reset status, dan uji pembuatan satu soal tersedia di pengaturan lanjutan. Uji pembuatan soal menggunakan kuota model.
- **Model & Cadangan**: pilih penyedia/model utama atau terapkan ID model kustom. Key cadangan, model cadangan pada penyedia yang sama, dan penyedia cadangan merupakan pengaturan terpisah. Cadangan key aktif secara bawaan; cadangan model/penyedia dan melanjutkan tanpa web nonaktif secara bawaan. Mengaktifkan cadangan penyedia berarti materi dapat dikirim ke penyedia cadangan; perpindahan diberitahukan saat generasi.
- **Penyimpanan**: key lokal aktif untuk sesi hingga disimpan dengan kata sandi minimal 12 karakter. Vault server menyimpan perubahan otomatis. Cadangan terenkripsi mencakup kedua penyedia. Mengimpor ke koleksi kosong memulihkan pengaturannya; mengimpor ke koleksi terisi mempertahankan pengaturan saat ini.

Adapter Groq memakai endpoint resmi `https://api.groq.com/openai/v1`. Pilihan bawaannya adalah `qwen/qwen3.8-27b` (default, juga menerima alias `qwen/qwen3.8-27`), `openai/gpt-oss-20b`, dan `openai/gpt-oss-120b`; daftar aktual dapat diperbarui lewat **Uji koneksi**. Model kustom harus tersedia untuk akun pengguna. Model Groq yang dikenali menggunakan JSON Schema strict; model kustom menggunakan JSON Object. Gemini yang dikenali menggunakan skema JSON saat tanpa tools. Prompt, skema soal, parsing, dan validasi dibagikan melalui `src/server/quizPipeline.ts`. Groq menghasilkan maksimal lima soal per batch agar respons tetap terkendali.

Pencarian Google tersedia hanya melalui adapter Gemini dan model yang mendukungnya. Adapter Groq ini tidak mengaktifkan fitur pencarian Groq. Cadangan yang tidak mendukung pencarian hanya digunakan untuk permintaan dengan web jika pengguna juga mengizinkan melanjutkan tanpa referensi web. Hasil menyimpan `requestedProvider`, `provider`, `requestedModel`, `model`, dan `usedGrounding`.

Kuota Gemini dikelompokkan berdasarkan proyek; Groq berdasarkan organisasi. Kelompok selalu dipisahkan menurut penyedia, termasuk ID kosong. Menambah key pada kelompok yang sama tidak menambah kuota. Groq menghormati `Retry-After`; reset tengah malam Pacific hanya berlaku pada kuota harian Gemini yang teridentifikasi. Retry, pembatalan, dan batas percobaan dibatasi. Error/log metadata tidak menyertakan key lengkap.

Vault satu key dan vault/cadangan versi 2 tetap dapat dibuka; key tanpa identitas penyedia dimigrasikan sebagai Gemini. Penyimpanan/ekspor baru menggunakan format versi 3. Lokasi storage dan AAD lama dipertahankan untuk kompatibilitas. Salinan lama baru diganti setelah enkripsi dan penyimpanan berhasil.

Node dan Worker menerima `GEMINI_API_KEY` dan/atau `GROQ_API_KEY` dari secret hosting. Key tidak boleh memakai awalan variabel `VITE_`. Worker mendukung key hosting serta vault browser, tetapi vault lintas perangkat memerlukan Node dan disk persisten. CSP produksi mengizinkan koneksi ke API resmi Gemini/Groq. Jika akses langsung browser ditolak oleh jaringan/CORS, gunakan backend Node melalui `VITE_API_BASE_URL` dan vault server.

Verifikasi: `npm run lint`, `npm run build`, `npm run test:keys`, `npm run test:providers`, `node --import tsx scripts/model-test.ts`, dan `node scripts/smoke-test.mjs`. Pengujian otomatis memakai respons tiruan tanpa panggilan API eksternal. Untuk memverifikasi akun nyata, tambahkan key lalu jalankan **Uji koneksi** dan **Uji pembuatan satu soal** di Koneksi AI.