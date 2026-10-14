# Completion Report — UALIP 3.0

Tanggal: 14 Oktober 2026 (Asia/Makassar)

Status: **PARTIALLY_VERIFIED** — implementasi dan seluruh pemeriksaan otomatis lulus; QA browser menggunakan generator fixture dan penerapan deklarasi reduced-motion melalui preview, bukan provider AI langsung atau emulasi DevTools.

## Perubahan

- Menambahkan tipe bersama `AppView` dengan view `preparation`.
- Generate sukses, termasuk buat ulang dari hasil, masuk ke Persiapan Kuis setelah kuis disimpan; toast sukses dipertahankan.
- Resume, pilih kuis dari Riwayat, dan ulangi kuis mempertahankan alur runner sebelumnya.
- Header khusus berisi tombol kembali 44×44 px, satu h1 terlihat, dan spacer simetris. Kembali membuka konfigurasi tanpa menghapus draf atau riwayat.
- `preparationSummary` menggunakan label tipe, kesulitan, durasi, gaya bahasa, mode, dan bahasa bersama. Fallback kuis lama serta waktu per tipe, termasuk nol dan default timer legacy, diuji.
- Visual kartu berdiri, dua lapisan belakang, pedestal, orbit, dan bayangan memakai CSS 3D; animasi hanya transform/opacity, tanpa dependensi baru. `overflow-x: clip` pada wadah visual mencegah proyeksi animasi menambah lebar halaman.
- Tombol Mulai mendapat fokus saat mount dan menolak aktivasi kedua dengan guard ref serta disabled state. Runner tetap belum terpasang selama persiapan.
- Menambahkan tes helper, markup aksesibel, aktivasi ganda, dan memperkuat tes operasi App; tes lama tetap berlaku.
- Tidak mengubah logika generator, scoring, evaluasi, maupun persistensi. Ekstraksi opsi bahasa/mode mempertahankan teks konfigurasi sebelumnya; mode berurutan memakai label bersama “Satu per satu”. Aturan workspace dan perubahan pengguna yang sudah ada dipertahankan.

## Hasil terverifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run lint` | PASS, termasuk setelah penambahan tes aktivasi ganda |
| `npm run test:composer` | PASS, lima skrip termasuk `quiz-preparation-test.ts` |
| `npm run test:results` | PASS, 11 tes |
| `npm run build` | PASS, client, server, dan Worker; diulang setelah perbaikan CSS |
| `git diff --check` | PASS |
| Generate dua soal di browser | Persiapan, ringkasan dua soal, toast sukses, runner belum terpasang |
| Tombol Kembali | Konfigurasi tetap dua soal, topik dan durasi dipertahankan |
| Riwayat setelah Kembali | Kuis tersedia; Lanjutkan kuis langsung membuka runner |
| Mulai melalui Enter di 390px | Runner terbuka dengan timer baru `05:00` |
| Fokus dan aria | Fokus awal Mulai, satu h1 terlihat, section merujuk heading header, visual aria-hidden |
| Reduced-motion melalui preview | Keenam elemen animasi bernilai computed `animation-name: none` |
| Console browser | Tidak ada log error |

## Responsivitas

Pengukuran browser akhir, setelah viewport diterapkan dan accessibility state diperbarui:

| Viewport | Lebar konten | scrollWidth | Pusat judul | Tombol kembali |
| --- | --- | --- | --- | --- |
| 320 px | 305 px | 305 px | 152,4 px | 44 px |
| 390 px | 375 px | 375 px | 187,6 px | 44 px |
| 768 px | 753 px | 753 px | 376,4 px | 44 px |
| 1440 px | 1425 px | 1425 px | 712,4 px | 44 px |

Scrollbar vertikal menggunakan 15 px. Tidak ada overflow horizontal; selisih pusat judul terhadap pusat konten kurang dari 0,2 px. Data mentah disimpan di `viewport-measurements.json`.

Screenshot: `preparation-320.jpg`, `preparation-390.jpg`, `preparation-768.jpg`, `preparation-1440.jpg`, `preparation-reduced-motion.jpg`, `history-after-back.jpg`, dan `runner-after-start-390.jpg`.

## Attempt ledger dan batas sumber daya

- Implementasi utama: satu intervensi, pemeriksaan otomatis pertama lulus.
- Masalah `PREP-320-OVERFLOW`: diagnosis menemukan overflow kecil yang muncul pada sebagian fase proyeksi animasi; satu koreksi terbatas pada wadah visual, pemeriksaan akhir seluruh ukuran lulus. Tidak melakukan perubahan spekulatif pada CSS global.
- Harness `QA-PREVIEW-SYNTAX`: build fixture awal gagal karena penutup objek plugin kurang; satu koreksi sintaks, build fixture berikutnya lulus. Tidak memengaruhi aplikasi.
- Diagnostik, pembacaan, dan sampling viewport tidak dihitung sebagai koreksi. Tidak ada masalah mencapai batas tiga percobaan atau memicu circuit breaker.
- Perintah pengujian dan build selesai dengan exit code 0; tidak ada proses yang hang. Tidak menggunakan provider eksternal atau kuota AI selama QA. Pengukuran token/biaya tidak tersedia.

## Isu tersisa dan tindakan berikutnya

Tidak ditemukan isu fungsional pada cakupan perubahan. Build menampilkan peringatan chunk lebih dari 500 kB; perubahan optimasi bundling berada di luar tugas ini.

QA terisolasi memakai App, Creator, Preparation, TopBar, History, dan Runner asli; hanya adapter workspace/generator/account yang diganti fixture, dengan data sementara dalam memori. Harness berada di `.qa/quiz-preparation/` yang diabaikan Git; data dan kredensial pengguna tidak disentuh.

Browser terhubung menyediakan viewport, tetapi tidak menyediakan capability emulasi media atau DevTools. Preview mengambil deklarasi `@media (prefers-reduced-motion: reduce)` dari stylesheet produksi dan menerapkannya untuk menguji pose statis; ini tidak membuktikan perubahan nilai browser `matchMedia`. Verifikasi refresh/persistensi produksi tidak dilakukan melalui harness dalam memori.

Sebelum rilis, lakukan satu generate nyata 1–2 soal di aplikasi, cek refresh persiapan kembali ke beranda dengan kuis tetap di Riwayat, dan cek `prefers-reduced-motion` memakai DevTools pada browser biasa. Implementasi tidak menambah penyimpanan progress pada halaman Persiapan.
