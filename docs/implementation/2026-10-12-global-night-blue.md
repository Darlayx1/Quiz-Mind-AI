# Global night blue dan latar putih

Permintaan pengguna: terapkan aksen night blue di semua tampilan, jadikan latar seluruh halaman putih, dan deploy melalui jalur proyek yang tersedia.

## Perubahan

- Palet night blue 50–950 disatukan pada token `--qm-blue-*`. Aksen workspace, konfigurasi, hasil, utilitas Tailwind `blue-*`, tombol, pilihan aktif, progress, focus, dan ikon menggunakan palet yang sama.
- Seluruh aksen serta tint ungu pada stylesheet diganti menjadi blue. Ilustrasi generasi/evaluasi dan metadata `theme-color` ikut diperbarui. Status benar/salah/pending, peringatan, dan warna kategori soal tetap mempunyai pembeda semantik.
- Latar root, frame seluruh halaman, dan sidebar pengaturan menjadi putih. Tint lembut dipertahankan untuk pilihan, kartu, dan status. Overlay dialog mempertahankan backdrop agar fokus tetap jelas.
- Navigasi soal aktif dan huruf opsi terpilih memakai aksen utama yang lebih gelap agar teks putih terbaca jelas.

## Verifikasi

- `npm run lint`, `npm run test:results` (11 kelompok), dan `npm run test:composer` berhasil.
- `npm run build:pages` dengan base path produksi `/Quiz-Mind-AI/` dan `git diff --check` berhasil. Peringatan ukuran chunk besar tetap ada.
- Browser beranda, konfigurasi, pengaturan akun/model, riwayat kosong, serta fixture sesi diperiksa. Computed style mengonfirmasi aksen `#214f82` dan latar `rgb(255, 255, 255)`; konfigurasi desktop 1440px dan mobile 390px tanpa overflow horizontal.
- Fixture sesi menunjukkan penguncian tab lama; pemeriksaan hanya mencakup visual, tanpa mengubah mekanisme locking atau memanggil AI. Pengujian alur sebelumnya tetap lulus.
- Screenshot lokal tersimpan di `night-blue-global/`. Draft topik sintetis untuk QA dikosongkan kembali.

## Publikasi

Jalur produksi yang dikonfigurasi adalah GitHub Actions `.github/workflows/pages.yml`, yang menerbitkan frontend ketika `main` diperbarui. Target: https://darlayx1.github.io/Quiz-Mind-AI/. Perubahan ini hanya frontend; tidak membutuhkan deployment Edge Functions atau migrasi database.
