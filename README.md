# QuizMind AI

Aplikasi latihan kuis dengan pengaturan AI terpusat, penyimpanan lokal tanpa login, dan data akun terisolasi melalui Supabase.

Situs: https://darlayx1.github.io/Quiz-Mind-AI/

## Pengaturan AI

- **Akun:** masuk, daftar, pemulihan akun, profil, logout, dan impor data lokal secara eksplisit.
- **API key:** hingga 100 key Google dan satu key Parallel per ruang, status, pengaktifan, uji akses, edit, dan hapus. Key nonaktif tetap dihitung; prioritas hanya berlaku untuk key Google.
- **Model & penggunaan:** pilihan model dan key, referensi web jika didukung, maksimal 1–3 percobaan per batch.
- **Riwayat:** kuis, hasil pengerjaan, aktivitas AI, pencarian, ekspor tanpa kredensial.

Desktop menggunakan window dengan sidebar; ponsel menggunakan window penuh dan tab horizontal. Pengaturan mendukung keyboard, fokus dialog, dan pengembalian fokus saat ditutup.

Parallel Search memakai API key yang diinput pengguna dan menyimpan kredensial mengikuti ruang lokal/akun yang aktif. Lihat [panduan integrasi, deployment, dan pengujian](docs/parallel-search.md).

## Penyimpanan

Tanpa login, key, pengaturan, draft, checkpoint generasi, kuis, progres, hasil, dan aktivitas disimpan dalam IndexedDB pada browser/origin yang sama. Setelah login, seluruh data domain dibaca dan disimpan pada akun aktif di Supabase. Kegagalan jaringan akun tidak mengalihkan penyimpanan ke tamu. Logout mengembalikan ruang tamu yang sebelumnya tersimpan.

Login tidak otomatis memindahkan data. Impor dilakukan melalui tab Akun dengan pilihan key dan preferensi; data sumber tetap tersedia. Akun A dan B mempunyai data dan batas key masing-masing. Pergantian ruang membatalkan operasi frontend dan mengosongkan state ruang sebelumnya.

Tidak ada vault atau enkripsi khusus aplikasi. Kredensial tamu berupa teks di IndexedDB; kredensial akun berupa teks dalam tabel privat Supabase. Browser hanya membaca metadata key akun. Layanan Edge memeriksa identitas pengguna sebelum mengambil key milik akun itu. HTTPS dan proteksi infrastruktur tetap berlaku.

Data lokal bertahan setelah reload/penutupan normal, tetapi dapat hilang jika data situs dihapus atau browser menolak penyimpanan. Riwayat lokal lama diimpor tanpa menghapus sumber. Vault lama tidak dipindahkan otomatis.

## Arsitektur

- src/workspace/: domain, repository lokal/akun, Auth, antrean penyimpanan dengan pemeriksaan versi, eksekusi AI.
- src/components/AISettings.tsx: window empat tab.
- src/server/geminiService.ts: validasi konfigurasi dan hasil satu batch; jalur aplikasi baru tidak mengganti model diam-diam.
- supabase/migrations/: tabel, RLS, kredensial privat, transaksi batas 100, impor, lease pekerjaan AI.
- supabase/functions/quiz-ai/: layanan AI akun; handler memverifikasi token pengguna.
- .agents/rules/anti-loop.md: aturan debugging permanen yang dipertahankan.

Mode tamu memanggil Google dengan key lokal. Mode akun memanggil Supabase Edge dengan sesi pengguna; key provider tidak dikirim kembali ke browser. Penilaian objektif tetap deterministik; isian dan esai mendukung evaluasi AI dengan rubrik serta tinjauan manual. Tujuh tipe soal dan komposisi campuran dipertahankan. Token/biaya yang tidak tersedia tidak ditampilkan sebagai perkiraan.

## Pengembangan

Memerlukan Node.js 22.12+.

~~~sh
npm ci
npm run dev
npm run lint
node --import tsx scripts/workspace-test.ts
node --import tsx scripts/model-test.ts
node --import tsx scripts/quiz-types-test.ts
node --import tsx scripts/workspace-ai-test.ts
npm run build
node scripts/smoke-test.mjs
~~~

.env.example hanya memuat konfigurasi publik Supabase dan port. Jangan menaruh key Google atau service role pada variabel VITE_. Server Node/Worker melayani aset dan health; endpoint vault dan AI anonim lama dinonaktifkan.

## Deployment

Push main menjalankan pemeriksaan dan deployment GitHub Pages melalui .github/workflows/pages.yml; tidak ada jadwal cron. Supabase menggunakan proyek btsvqhlfkkgwkqsezzoq.

Untuk mereproduksi backend: terapkan kedua migrasi berurutan, jalankan node scripts/build-edge.mjs, lalu deploy quiz-ai dengan Supabase CLI atau source tunggal build/quiz-ai.ts melalui dashboard. Gateway verify_jwt=false digunakan karena handler memvalidasi bearer token melalui auth.getUser; permintaan tanpa sesi tetap ditolak. SUPABASE_SERVICE_ROLE_KEY hanya digunakan di runtime Edge.

Pasang Site URL dan redirect Auth sesuai origin deployment. Verifikasi RLS di supabase/tests/workspace_rls.sql menggunakan transaksi yang di-rollback. Catatan hasil dan keterbatasan berada di docs/IMPLEMENTATION.md.
