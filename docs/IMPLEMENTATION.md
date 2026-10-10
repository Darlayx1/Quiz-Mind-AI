# Implementasi 10 Oktober 2026

Pengguna mengubah instruksi perencanaan menjadi implementasi dan deployment GitHub. Rencana awal di AI_SETTINGS_REBUILD_TASK_PLAN.md menjadi acuan, bukan klaim bahwa seluruh rincian rencana telah diuji.

## Hasil

Window Pengaturan AI memusatkan Akun, API key, Model & penggunaan, dan Riwayat. Navigasi, form kuis, status proses, serta bahasa visual menggunakan gaya bersama. Desktop memakai sidebar; ponsel memakai window penuh dengan tab horizontal. UI menyediakan keadaan kosong, gagal, menyimpan, dan sesi perlu dipulihkan.

Repository tamu menggunakan IndexedDB persisten. Repository akun memakai Supabase Auth dan transaksi berbasis auth.uid, RLS, serta pemeriksaan versi. Setiap pergantian ruang membersihkan state dan membatalkan operasi frontend. Tidak ada penyalinan otomatis antar ruang atau penggunaan key tamu sebagai cadangan akun. Permintaan akun memakai JWT identitas asal; refresh tertunda dibuang jika ruang berubah.

Key dibatasi 100 per ruang, termasuk nonaktif. SHA-256 dipakai untuk mendeteksi duplikasi, bukan enkripsi kredensial. Teks kredensial akun berada pada tabel privat, tidak dapat dibaca role anon/authenticated. Fungsi layanan memverifikasi sesi dan kepemilikan sebelum pemakaian. Vault, kata sandi vault, endpoint vault, dan fallback secret server lama dihapus.

Preferensi, draft, kuis, progres dengan deadline timer, hasil pengerjaan berulang, aktivitas, dan checkpoint generasi tersimpan pada ruang aktif. Impor eksplisit memetakan ID key, melewati duplikasi, mempertahankan referensi akun, dan menjaga data tamu. Ekspor tidak berisi kredensial.

Generasi memakai batch tervalidasi, model tetap, maksimal tiga percobaan per batch, timeout, lease cloud, pembatalan, dan checkpoint. Melanjutkan pekerjaan harus dipilih pengguna; tidak ada resume, uji key, atau polling AI otomatis setelah reload. Penilaian pilihan ganda tetap deterministik.

## Verifikasi

- TypeScript dan build produksi frontend, Node, dan Worker.
- Pengujian IndexedDB: persistensi, metadata tanpa secret, duplikasi, key nonaktif, konflik versi, 99 key ditambah dua secara serentak tetap menghasilkan tepat 100, penolakan key ke-101, penghapusan credential/pilihan key, dan payload impor.
- Pengujian provider menggunakan mock: katalog, kesulitan, prompt, grounding, timer, jumlah hasil, dan jalur batch baru dengan tepat satu request tanpa fallback model internal. Tidak memakai kuota Google.
- Smoke test aset, health, penolakan API lama, dan endpoint vault yang sudah dihapus.
- SQL pada proyek Supabase aktual: batas 100, isolasi akun A/B, penolakan akses credential privat, penolakan helper service dari authenticated, konflik versi, dan penolakan akses tamu. Semua fixture dibatalkan dengan rollback.
- SQL impor aktual: deduplikasi key/aktivitas, referensi key akun asal tetap utuh, dan pemetaan preferensi key impor. Fixture di-rollback.
- Browser lokal: empat tab tampil; key uji nonaktif bertahan setelah reload; tampilan ponsel diperiksa pada 390 × 844.

## Operasional

Migrasi Supabase dipasang melalui dashboard. Source fungsi berada di supabase/functions/quiz-ai; scripts/build-edge.mjs menghasilkan bundle tunggal untuk reproduksi deployment. Redirect Auth produksi diarahkan ke GitHub Pages. Status deployment publik dikonfirmasi terpisah dari keberhasilan build lokal.

Tidak ada automation atau cron yang dibuat. Workflow GitHub hanya dipicu push main atau permintaan manual. Autosave mengikuti perubahan pengguna; timer hanya berjalan ketika mengerjakan kuis. Aturan anti-loop permanen dipertahankan tanpa perubahan.

## Batas verifikasi

Login dan panggilan Google dengan kredensial nyata pengguna tidak diuji; pengujian provider memakai mock dan isolasi akun memakai transaksi database dengan role pengguna. Ketersediaan model mengikuti proyek Google masing-masing. Penggunaan token/biaya ditampilkan tidak tersedia ketika tidak ada data tepercaya. Browser dapat menghapus data lokal; penyimpanan persisten tidak menjamin data bertahan setelah penghapusan data situs.

## Integrasi perubahan GitHub

Push pertama ditolak karena origin/main mempunyai 13 commit baru. Riwayat GitHub digabungkan, bukan ditimpa. Tujuh tipe soal, komposisi campuran, bobot, kredit parsial, timer per tipe, rubrik, tinjauan manual, dan penjelasan kuota dipertahankan. Penilaian objektif memakai modul scoring; evaluasi jawaban terbuka memakai adapter lokal/akun dengan key ruang aktif. Preferensi evaluator ditempatkan pada tab Model & penggunaan. Adapter vault dan penyimpanan key lama beserta tes khusus arsitektur tersebut digantikan oleh repository workspace; sumber data lama tetap tidak dihapus.

Uji adapter workspace tambahan lulus: tujuh tipe dalam satu kuis, distribusi batch, key invalid hanya dicoba sekali sebelum memakai key alternatif pada batch berikutnya, bobot esai, dan evaluasi satu permintaan dengan mock.
