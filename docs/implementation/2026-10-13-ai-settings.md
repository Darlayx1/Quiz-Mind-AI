# Pengaturan model dan penggunaan

- Pembuat kuis, evaluator kuis, dan pencarian web memiliki kategori terpisah; pilihan tersimpan otomatis.
- Evaluator menggunakan model tersendiri dan menilai jawaban isian singkat/esai setelah pengumpulan. Soal objektif memakai penilaian deterministik.
- Key yang menerima penolakan kuota dijeda 24 jam melalui status quota dan testedAt/tested_at; key nonaktif manual tetap dilewati. UI memperbarui kelayakan saat jeda berakhir.
- Generator mencoba maksimal tiga key berbeda hanya pada penolakan kuota. Evaluator memperbarui kandidat pada setiap kelompok jawaban agar tidak memakai kembali key yang dijeda.
- Pemesanan ulang akun membutuhkan bukti penolakan kuota, owner dan lease yang sesuai, dan bukti key yang belum dipakai untuk pemesanan ulang. Operasi dibatasi tiga panggilan.
- Nama key opsional dengan urutan API key 1, API key 2, dst. Google AI Studio dapat dibuka dari tab API key.
- Semua dropdown aplikasi memakai komponen Select dengan keyboard, Escape, pilihan nonaktif, dan posisi berdasarkan ruang layar.
- Toggle pencarian web berada paling bawah konfigurasi kuis. Tab akun memakai form minimalis; nama profil tersimpan setelah selesai diedit.

## Validasi

Lint, build frontend/server/worker dan build Edge. Pengujian alur composer, hasil, workspace akun, tipe soal, rotasi generator lokal/akun, rotasi evaluator antarkelompok, batas tiga percobaan, jeda/expiry, dan SQL PostgreSQL sementara. Semua respons provider pada pengujian disimulasikan.

## Penerapan backend

Terapkan supabase/migrations/202610130001_quota_key_failover.sql, lalu deploy fungsi quiz-ai dari sumber yang dibangun oleh npm run build:edge. Migrasi dan fungsi belum diterapkan ke layanan produksi oleh tugas ini.

## Aturan workspace

.agents/rules/anti-loop.md sudah tersedia dengan frontmatter trigger: always_on, dan AGENTS.md mewajibkan pembacaan aturan tersebut. Aturan lainnya dipertahankan.
