# Motion dan visual polish — 15 Oktober 2026

Status: PARTIALLY_VERIFIED. Implementasi, pengujian regresi, dan pemeriksaan browser lokal selesai. Pengukuran FPS/CLS, teknologi bantu, dan perangkat fisik masih mempunyai batas verifikasi yang dijelaskan di bawah. Tidak ada deployment.

## Perubahan

- Sistem durasi/easing bersama di `src/ui/motion.ts` dan lapisan visual `src/styles/motion.css`.
- Transisi presentasi mempertahankan node dan pemilik state. Root layar menggunakan opacity agar posisi toolbar fixed di ponsel tetap mengikuti viewport. Soal berurutan memakai gerak arah maju/mundur.
- Indikator navigasi dan tab pengaturan berpindah mengikuti ukuran kontrol, termasuk saat ukuran layar berubah.
- Beranda mempunyai reveal berurutan, cahaya latar statis, kedalaman permukaan, feedback tekan/fokus, serta elevasi preset yang konsisten.
- Chip lampiran masuk/keluar dengan animasi, dan elemen keluar menjadi inert. Callback pembacaan, antrean, serta pembatalan file tetap berjalan pada alur semula.
- Dialog, dropdown, settings, dan drawer mendapat masuk/keluar yang selaras. Penutupan mempunyai fallback terbatas dan cleanup; aksi bisnis seperti submit tetap langsung dijalankan.
- Ilustrasi generasi/evaluasi/persiapan memperoleh penyelarasan cahaya dan kedalaman. Tombol jeda menghentikan dekorasi berulang dan rotasi informasi. Dekorasi juga dijeda ketika dokumen tersembunyi atau visual di luar viewport.
- Pengerjaan kuis memakai feedback pilihan/bookmark, reflow urutan yang mempertahankan fokus, dan progres yang tenang. Loop shimmer progres dan pulse timer dekoratif dihapus dari layar ujian; teks waktu dan status kritis tetap tersedia.
- Skor numerik dan kilau hasil dipresentasikan sekali per hasil. Nilai pending tetap “Belum final”; pembaca layar mendapat nilai akhir, bukan setiap frame angka. Registry perayaan dibatasi 100 identitas dalam memori.
- Riwayat merapatkan baris setelah penghapusan dan memberi reveal hanya pada sejumlah item yang terlihat. Toast memiliki animasi masuk/keluar serta identitas ruang; pergantian ruang langsung membuang presentasi toast lama.
- Reduced motion mengikuti perubahan preferensi OS. CSS, Web Animations, count-up, dan komponen Motion mempunyai jalur tanpa gerakan.

Implementasi memakai CSS dan Web Animations untuk menjaga lifecycle/state, serta `LazyMotion` dengan fitur `domAnimation` untuk toast dan chip lampiran. Pustaka `motion` sudah ada sebelumnya; tidak ada dependency baru. Mesin AI, skema penyimpanan, autentikasi, scoring, dan kebijakan timer tidak diubah.

## Pemeriksaan otomatis

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run lint` | Lulus pada sumber akhir |
| `npm run test:motion` | Lulus: preferensi OS dinamis, jeda, visibility, cleanup listener, dismissal langsung pada reduced motion, duplikasi dismissal, cleanup unmount, dan entrance |
| `npm run test:composer` | Lulus pada sumber akhir, termasuk konfigurasi, draft, pembatalan, pemulihan sesi, remedial, generasi ulang, dan persiapan |
| `npm run test:runner` | Lulus: tujuh input, StrictMode/lease, jawaban, timer, pemulihan deadline, dan submit sekali |
| `npm run test:results` | 11 tes lulus: penilaian, filter, pending, ekspor, pembahasan, dan konfigurasi generasi ulang |
| `npm run test:auth` | Lulus: OAuth redirect, callback, timeout, pembatalan, dan UI akun |
| `npm run build` | Lulus pada sumber akhir: frontend, server, dan Worker |
| `npm run build:pages` | Lulus pada sumber akhir dengan `VITE_BASE_PATH=/Quiz-Mind-AI/` |

Simulator hook pada empat tes domain sekarang mengisolasi modul presentasi melalui `scripts/presentation-test-host.ts`. Assert domain yang sudah ada dipertahankan. Gerak diuji secara terpisah lewat kebijakan presentasi dan interaksi browser nyata. Tes App juga memeriksa keunikan key sibling pengaturan/toast untuk mencegah dialog tertinggal.

## Pemeriksaan browser

Browser: Codex In-app Browser lokal. Preview aplikasi di port 4173; fixture terisolasi tanpa pemanggilan AI/penulisan akun.

- Beranda, konfigurasi, persiapan, hasil, dan runner diperiksa pada lebar 320, 390, 768, 1024, dan 1440 px. Seluruh pengukuran akhir menunjukkan `scrollWidth === clientWidth`; scrollbar vertikal diperhitungkan.
- Draft topik bertahan saat masuk konfigurasi dan kembali ke composer.
- Lampiran teks lokal berhasil mencapai “Teks siap”; chip hilang setelah dihapus. Materi dan topik yang dibuat untuk QA dibersihkan sesudah pemeriksaan.
- Pemilih tipe pertanyaan membuka/menutup dengan benar. Dropdown model menutup melalui Escape, mengembalikan fokus ke combobox, dan tidak ikut menutup settings.
- Settings sesudah interaksi dropdown menutup dengan benar: tidak ada dialog tertinggal, `body.style.overflow` kembali kosong, fokus kembali ke tombol pembuka.
- Pilihan jawaban dan bookmark bertahan setelah maju/mundur soal pada sesi berurutan.
- Pengurutan item mempertahankan fokus pada tombol milik item yang dipindahkan.
- Drawer mobile menutup dengan benar dan mengembalikan fokus ke tombol navigasi. Pembatalan konfirmasi pengumpulan melepas scroll lock.
- Konfirmasi penghapusan fixture dapat dibatalkan, dibuka kembali, lalu menghapus satu baris dari tiga menjadi dua. Fixture hanya memakai state memori.
- Status pending menampilkan “Skor · Belum final”. Kontrol jeda mengubah visual menjadi tidak aktif sambil mempertahankan progres aktual 30%.

Bukti lokal di `.qa/motion-polish/`: `responsive.json`, `home-desktop.jpg`, `configuration-desktop.jpg`, `generation-desktop.jpg`, `preparation-desktop.jpg`, `results-desktop.jpg`, dan `runner-mobile.jpg`. Screenshot menjadi bukti visual diam; tidak ada rekaman video animasi. Matriks responsif memakai ukuran DOM; screenshot pada viewport override tertentu dapat terpotong oleh panel browser. Screenshot beranda akhir diambil ulang setelah ukuran browser direset.

## Ukuran dan performa

Baseline build Pages sebelum perubahan: entry JavaScript 201,55 KB gzip dan CSS 39,01 KB gzip.

Build akhir standar: entry JavaScript 231,55 KB gzip dan CSS 41,43 KB gzip. Entry Pages dengan base path proyek: 231,58 KB gzip. Tambahan JavaScript entry sekitar 30 KB gzip, ditambah sekitar 0,15 KB gzip pada runtime bundler, masih dalam anggaran awal 35 KB. Peringatan chunk >500 KB sudah muncul pada baseline dan tetap ada.

Pengukuran trace FPS, long task, dan CLS tidak tersedia melalui antarmuka browser yang digunakan; target 60 fps/CLS ≤0,1 belum diklaim terverifikasi. Perubahan mengutamakan transform/opacity, membatasi animasi daftar, tidak mempertahankan runner keluar, dan menghentikan dekorasi di luar area aktif.

## Temuan dan koreksi

1. Simulator React tes domain belum mengekspor hook presentasi yang baru. Diagnosis dilakukan sebelum mengubah batas simulasi; isolasi presentasi memperbaikinya dalam satu intervensi. Satu patch awal ditolak karena konteks baris berbeda; patch itu tidak mengubah file.
2. Typecheck fixture mendeteksi dua tipe yang kurang tepat; keduanya dikoreksi dalam satu intervensi, lalu lulus.
3. Kilau hasil menambah overflow sementara. Area efek sekarang di-clip ke kartu hasil; matriks akhir lulus.
4. Cahaya latar beranda melampaui lebar tablet. Inset dibatasi ke area beranda; matriks akhir lulus.
5. Tambahan kontrol jeda mempersempit header konfigurasi pada tablet. Label pengaturan visual disingkat menjadi ikon pada rentang tablet, dengan nama aksesibel tetap tersedia; matriks akhir lulus.
6. Key sibling toast dan settings bertabrakan setelah pembatasan toast per ruang. Key toast diberi namespace, ditambahkan tes regresi, lalu browser memverifikasi penutupan sesudah interaksi dropdown. Tidak ada duplikasi key pada struktur root yang diuji.

Setiap masalah memiliki diagnosis dan koreksi terbatas; tidak ada circuit breaker yang terpicu. Tidak ada rollback perubahan pengguna. File aturan agen dan dokumen Google login yang sudah ada dipertahankan.

## Batas verifikasi

Perangkat fisik, keyboard virtual/safe area nyata, zoom browser 200%, pembaca layar, perubahan preferensi OS nyata, serta print dari dialog sistem belum diperiksa manual. Preferensi/cleanup diuji secara deterministik; CSS reduced motion dan print ditinjau pada sumber. Status error/cancel dan penyimpanan diuji melalui suite domain serta fixture, bukan layanan AI atau akun produksi. Video sebelum/sesudah setiap area dan profil performa tetap menjadi pekerjaan verifikasi lanjutan bila diperlukan.

Server preview milik sesi ini dan tab pengujian dihentikan setelah QA. Kode sumber, build, fixture, serta bukti lokal tetap tersimpan untuk ditinjau.
