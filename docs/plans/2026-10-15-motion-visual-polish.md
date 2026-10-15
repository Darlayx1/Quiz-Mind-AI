# Rencana peningkatan animasi, transisi, dan efek visual Quiz Mind AI

Tanggal: 15 Oktober 2026
Status: implementasi selesai; pemeriksaan otomatis dan browser lokal lulus. Batas verifikasi performa/perangkat dicatat dalam [laporan implementasi](../implementation/2026-10-15-motion-visual-polish.md).

## 1. Tujuan dan arah visual

Membuat pengalaman terasa jauh lebih kaya, dinamis, elegan, polished, high-end, refined, dan satisfying melalui koreografi gerak yang konsisten, kedalaman visual, serta respons yang jelas terhadap tindakan pengguna.

Pertahankan identitas biru malam, permukaan terang, tipografi, struktur informasi, dan keterbacaan aplikasi. Intensitas gerak mengikuti konteks: ekspresif pada beranda dan keberhasilan, informatif selama proses AI, serta tenang saat mengerjakan soal. Keindahan harus terasa pada detail dan kesinambungan antarmomen.

Lingkup pekerjaan mencakup frontend presentasi. Alur autentikasi, penyimpanan, API, generasi AI, payload konfigurasi, penilaian, timer, dan kebijakan ujian tetap mengikuti perilaku domain yang ada. Tidak ada deployment dalam rencana ini.

## 2. Temuan dari kode saat ini

- `motion` sudah terpasang. Pencarian sumber belum menemukan pemakaian `motion` atau `AnimatePresence`; animasi yang ditemukan terutama berupa CSS dan pergantian komponen React.
- `src/index.css` sudah memuat reveal, hover, shimmer, ilustrasi berlapis, animasi skor, dan beberapa aturan reduced motion. Durasi dan easing tersebar pada masing-masing fitur; ada `transition: all` yang perlu ditinjau secara lokal.
- `App.tsx` merender layar berdasarkan view, loading, dan evaluasi. `QuizCreator` sengaja dipertahankan terpasang dalam pembungkus `hidden`; strategi transisi harus mempertahankan draft dan pekerjaan pembacaan lampiran.
- `QuizCreator.tsx` menyimpan draft sebelum navigasi/generasi dan mempunyai guard untuk mencegah aksi ganda. Koreografi visual harus menghormati urutan ini.
- `ConfigurationDialog.tsx` sudah mempunyai animasi penutupan, dialog native, pengelolaan fokus, dan durasi penutupan 220 ms. Settings, drawer, dropdown, dan dialog lain mempunyai pola berbeda.
- `ProcessingLayout.tsx` sudah menangani reduced motion, rotasi konteks, jeda saat hover/fokus, dan pemeriksaan tab tersembunyi untuk rotasi konteks. Kebijakan jeda perlu mencakup efek dekoratif juga.
- `QuizRunner.tsx` menggunakan identitas soal dan sesi untuk jawaban, fokus, serta navigasi. Animasi tidak boleh memicu reset, timer ganda, atau pengiriman ulang.
- `QuizResults.tsx` sudah mempunyai reveal skor dan progress bar. Skor dapat belum final; presentasi perayaan harus membedakan hasil final, pending, dan hasil revisi.

Temuan ini berasal dari inspeksi kode. Audit visual browser, pengukuran performa, dan pembandingan sebelum/sesudah menjadi langkah awal implementasi; kualitas visual saat ini belum dinilai langsung.

## 3. Sistem gerak bersama

Gunakan CSS untuk feedback sederhana dan `motion/react` yang sudah tersedia untuk koordinasi masuk/keluar, indikator pilihan, serta perubahan tata letak yang memerlukannya. Tidak perlu menambah pustaka animasi baru.

| Elemen | Spesifikasi awal | Rasa yang dituju |
| --- | --- | --- |
| Tekan tombol | 90–130 ms; scale 0,985–1 | Cepat, presisi, responsif |
| Hover dan fokus | 140–180 ms; elevasi 1–2 px pada pointer halus | Ringan dan terasa dapat disentuh |
| Pilihan, chip, toggle | 180–240 ms; indikator berpindah dengan spring lembut | Pilihan terasa menetap |
| Dialog dan drawer | Masuk 240–320 ms; keluar 160–220 ms | Lapisan terasa menyatu |
| Pergantian layar | 240–360 ms; perpindahan 8–16 px | Berkesinambungan, terarah |
| Reveal bertahap | Jeda 35–50 ms; total koreografi maksimal 600 ms | Hierarki terbaca dengan tenang |
| Skor final | 650–900 ms, sekali per hasil yang memenuhi syarat | Puncak pengalaman yang memuaskan |

Easing masuk awal: `cubic-bezier(.16,1,.3,1)`; keluar: `cubic-bezier(.4,0,1,1)`. Spring mempunyai overshoot kecil dan tidak diterapkan pada paragraf atau area baca panjang. Nilai ini menjadi titik awal untuk penyesuaian melalui preview.

Tetapkan token durasi, easing, jarak, elevasi, dan intensitas. Setiap properti pada satu elemen mempunyai satu pengendali animasi agar CSS dan Motion tidak berebut `transform` atau `opacity`.

## 4. Rencana pengalaman per area

| Area | Peningkatan konkret | Batas perilaku |
| --- | --- | --- |
| Beranda dan composer | Reveal judul → composer → preset; cahaya latar biru yang lembut; focus halo; kartu preset terangkat; ikon CTA bergerak singkat | Reveal sekali per kunjungan, tidak terulang saat mengetik atau autosave |
| Lampiran | Chip masuk/keluar dengan perubahan ruang yang halus; ikon proses berubah menjadi siap/gagal; drop target memperoleh highlight terarah | Identitas file, antrean, pembatalan, dan OCR dipertahankan |
| Konfigurasi | Indikator segmented control berpindah; pilihan tipe/durasi terasa menetap; detail terbuka dengan halus; ringkasan berubah secara terlokalisasi | Input dan fokus tidak di-remount saat nilainya berubah |
| Navigasi utama | Indikator aktif bergerak; perpindahan maju/mundur mempunyai arah; perubahan header/footer mengikuti layar | Draft tetap hidup; tombol dan konten keluar tidak dapat menerima interaksi |
| Dialog, settings, dropdown | Backdrop fade; dialog scale/translate ringan; drawer naik dari bawah; tab settings crossfade; keluar sehalus masuk | Escape, focus trap, pemulihan fokus, scroll lock, dan konfirmasi form tetap benar |
| Generasi dan evaluasi AI | Sinkronkan orbit, kartu, cahaya, dan pergantian konteks; status berganti tanpa kedipan; progress terasa mengalir | Progress mengikuti data nyata; waktu tunggu dan error tetap jujur; pembatalan langsung berjalan |
| Persiapan kuis | Reveal ilustrasi berlapis dan ringkasan; CTA memperoleh respons tekan yang tegas; transisi menuju sesi terasa terarah | Mulai sesi tidak menunggu dekorasi selesai |
| Pengerjaan kuis | Transisi arah untuk soal berurutan; feedback pilihan dan bookmark; perpindahan urutan jawaban halus; palet navigasi merespons perubahan status | Feedback berarti pilihan tersimpan/terpilih; tidak membocorkan benar/salah sebelum penilaian |
| Hasil dan pembahasan | Skor dan bar tersinkron; metrik menyusul; kilau singkat pada penyelesaian; filter dan pembahasan berganti halus | Skor pending tetap “belum final”; animasi angka tidak membanjiri pembaca layar |
| Riwayat dan notifikasi | Kartu masuk secara singkat; penghapusan merapatkan daftar; toast masuk/keluar halus; empty state memperoleh hierarki visual | Batasi stagger pada item terlihat; tidak menganimasikan seluruh daftar panjang sekaligus |

Efek pendukung menggunakan gradient lokal, highlight tepi, bayangan berlapis, dan dekorasi SVG/CSS yang sejalan dengan ilustrasi sekarang. Maksimal satu pusat perhatian bergerak per layar. Dekorasi tidak menangkap pointer dan tidak masuk ke pohon aksesibilitas.

Pada pengerjaan soal, gunakan highlight progres sesaat saat nilainya berubah. Tinjau penggantian shimmer terus-menerus dan pulse timer berulang dengan indikator statis ditambah penekanan singkat saat memasuki ambang peringatan. Tampilan teks waktu tetap jelas.

Perayaan hasil berupa kilau lokal yang singkat, hanya ketika hasil final pertama tersedia dalam sesi tampilan tersebut. Re-render, filter, revisi manual, dan kunjungan ulang tidak memutar perayaan besar. Kondisi belum final/gagal memakai feedback informatif.

## 5. Arsitektur dan perlindungan state

- Tambahkan `src/ui/motion.ts` sebagai sumber preset gerak dan `src/styles/motion.css` untuk token, aturan dekoratif, serta fallback reduced motion. Hubungkan secara eksplisit melalui entry stylesheet; hindari refactoring seluruh stylesheet.
- Tambahkan kebijakan gerak bersama melalui `MotionConfig` dan hook yang mengikuti preferensi OS secara langsung. Efek dekoratif aktif hanya saat area terlihat dan dokumen aktif.
- Tambahkan pembungkus transisi presentasi yang kecil bila diperlukan. State domain tetap berada di pemiliknya saat ini; keys mengikuti identitas yang stabil, bukan timestamp atau nilai input.
- Pertahankan instance `QuizCreator`. Animasikan pembungkus/presentasi tahap tanpa mengganti pemilik draft dan operasi file. Ukur transisi `hidden` secara eksplisit karena elemen tersembunyi tidak mempunyai layout yang dapat dianimasikan.
- Jangan mempertahankan layar ujian aktif sebagai salinan interaktif selama exit. Pastikan timer dan efek domain dibersihkan sesuai lifecycle asli; gunakan masuk saja atau representasi visual statis bila exit akan memperpanjang lifecycle operasi.
- Perubahan ruang akun/tamu langsung membuang presentasi ruang lama. Jangan menunda reset keamanan atau menampilkan data akun sebelumnya demi animasi keluar.
- Efek visual tidak memulai fetch, autosave, submit, generasi, atau evaluasi. Callback bisnis berjalan satu kali sesuai guard yang ada.
- Saat navigasi cepat, tujuan terbaru menang. Batalkan animasi lama; bersihkan listener, timeout, observer, dan frame callback saat unmount.
- Fokus berpindah ke heading yang benar; elemen keluar menjadi inert dan tidak muncul ganda dalam pembaca layar. Koordinasikan fokus dengan scroll yang sudah ada agar tidak melompat dua kali.
- Untuk dialog native, exit selesai sebelum `close()` dan pelepasan scroll lock. Sediakan jalur selesai tanpa animasi serta timeout fallback terbatas; durasi tidak diduplikasi sebagai angka terpisah di CSS dan kode.
- Target perubahan mencakup `main.tsx`, `App.tsx`, `index.css`, serta komponen pada tabel area. `QuestionInput.tsx`, `Select.tsx`, `ConfirmModal.tsx`, dan `MaterialContextEditor.tsx` ikut hanya sejauh presentasinya membutuhkan penyelarasan.

## 6. Aksesibilitas dan anggaran performa

- Reduced motion menampilkan state akhir segera: tanpa parallax, orbit, perpindahan besar, count-up, atau perayaan. Informasi status dan fokus tetap lengkap. Sediakan kontrol jeda untuk dekorasi yang bergerak terus-menerus lebih dari lima detik.
- Hover khusus `(hover: hover) and (pointer: fine)`; sentuhan dan keyboard mendapat feedback setara melalui pressed, selected, dan focus-visible. Target sentuh tetap minimal 44 px.
- Tidak ada animasi scroll yang mengambil alih kontrol pengguna, efek kedip cepat, suara otomatis, atau efek yang menutupi jawaban.
- Utamakan `transform` dan `opacity`. Perubahan ukuran dibatasi ke area kecil dan diperiksa agar tidak mengganggu input/fokus. Hindari animasi blur layar penuh, shadow besar, dan gradient kompleks per frame.
- Gunakan `will-change` hanya ketika perlu. Batasi lapisan dekoratif berulang maksimal dua per layar di luar ujian; hentikan ketika tidak terlihat. Layar ujian tidak memakai loop dekoratif.
- Target pada perangkat/browser acuan yang dicatat: sekitar 60 fps pada interaksi utama, tanpa rangkaian dropped frame yang terlihat dan tanpa long task baru >50 ms yang berasal dari animasi. Simpan trace bila target tidak tercapai.
- Ukur ukuran bundle gzip sebelum/sesudah. Anggaran awal tambahan JavaScript untuk pekerjaan ini maksimal 35 KB gzip; periksa pemuatan fitur Motion bila melewati anggaran.
- Animasi tidak menambahkan layout shift tak terduga. Catat baseline dan target CLS ≤0,1 pada alur uji; perubahan layout yang dipicu input dinilai juga dari kontinuitas fokus dan posisi baca.

## 7. Urutan implementasi dan gerbang kelulusan

1. **Audit visual dan baseline.** Jalankan preview lokal menggunakan instance yang sudah berfungsi jika tersedia. Rekam beranda, konfigurasi, dialog, proses AI, persiapan, runner, hasil, dan riwayat dengan fixture lokal. Catat viewport, state, browser, bundle, serta trace interaksi. Hasil: daftar prioritas dan pembanding yang dapat diulang.
2. **Fondasi dan contoh utuh.** Implementasikan token/kebijakan gerak, tombol, beranda, dan jalur composer → konfigurasi beserta dialog. Tinjau konsistensi, draft, input, dan reduced motion sebelum memperluas pola. Hasil: satu alur yang menunjukkan standar visual final.
3. **Navigasi dan overlay.** Terapkan pola terpilih pada pergantian layar, top bar, settings, dropdown, dialog, drawer, serta toast. Hasil: buka/tutup dan navigasi cepat tidak meninggalkan overlay, fokus, atau scroll lock.
4. **Proses AI dan persiapan.** Poles ilustrasi, perubahan status, progress, pembatalan, error, dan masuk ke kuis. Hasil: gerak mengikuti status nyata; jeda/visibilitas bekerja.
5. **Pengerjaan kuis.** Poles pilihan, bookmark, urutan, perpindahan soal, progres, dan peringatan waktu. Hasil: tujuh tipe soal, dua mode tampilan, serta timer tetap identik secara fungsional.
6. **Hasil dan riwayat.** Sinkronkan skor, metrik, kilau penyelesaian, filter, pembahasan, dan perubahan daftar. Hasil: final/pending/revisi mempunyai presentasi tepat tanpa perayaan berulang.
7. **Verifikasi akhir.** Bandingkan rekaman sebelum/sesudah, periksa responsivitas dan aksesibilitas, ukur performa, lalu dokumentasikan hasil serta batas verifikasi. Hasil: seluruh kriteria berikut lulus atau keterbatasan dicatat secara eksplisit.

## 8. Kriteria penerimaan dan pengujian

- **Visual:** setiap area pada tabel mempunyai contoh sebelum/sesudah; pola masuk/keluar, feedback pilihan, dan elevasi konsisten. Tidak ada flicker, teks terpotong, efek bertumpuk, atau replay pada setiap render.
- **Responsivitas:** periksa lebar 320, 390, 768, 1024, dan 1440 px; tidak ada overflow horizontal atau CTA tertutup. Periksa zoom 200%, keyboard virtual, safe area, dan print hasil.
- **Interaksi:** uji klik cepat/navigasi berulang, Escape saat exit, tab keyboard, overlay bertingkat, pergantian tab browser, dan perubahan reduced motion saat aplikasi terbuka. Tidak ada fokus hilang, scroll lock tertinggal, atau target keluar masih aktif.
- **State:** draft/lampiran tidak hilang; jawaban dan bookmark bertahan; timer tidak reset atau berjalan ganda; submit/cancel sekali; perpindahan ruang tidak menyisakan konten ruang lama.
- **Status:** uji sukses, pending, error, cancel, waktu tunggu panjang, empty state, hasil belum final, dan perubahan skor. Toast/progress/pembahasan tidak mengumumkan perubahan dekoratif setiap frame.
- **Regresi:** jalankan `npm run lint`, `npm run test:composer`, `npm run test:runner`, dan `npm run test:results`, serta `npm run test:auth` jika lifecycle settings berubah. Jalankan `npm run build` dan `npm run build:pages`; perluas tes hanya jika ada perubahan relevan atau kegagalan baru.
- **Pengujian tambahan:** tambahkan tes perilaku hanya untuk risiko baru, misalnya cleanup exit dan ketahanan state saat navigasi. Hindari tes yang sekadar mencocokkan nama kelas atau menyalin implementasi animasi.
- **Performa:** bandingkan trace dan bundle terhadap anggaran. Pengujian perangkat simulasi tidak diklaim sebagai verifikasi perangkat fisik.
- Gunakan fixture lokal untuk generasi/evaluasi dan data akun tiruan; verifikasi visual tidak membutuhkan panggilan AI berbayar atau perubahan akun produksi.

## 9. Checkpoint dan anti-loop

Catat setiap fase dalam dokumen implementasi pendamping: perubahan, alasan, hasil pemeriksaan, bukti visual, dan keterbatasan. Tinjau Git diff agar pekerjaan pengguna dan area di luar presentasi terjaga.

Ikuti UALIP 3.0: maksimal tiga intervensi substantif per masalah berisiko rendah. Dua intervensi berturut-turut tanpa kemajuan memicu analisis akar masalah. Jangan mengulang pendekatan identik; hentikan operasi yang mencapai circuit breaker dan laporkan bukti serta opsi berikutnya. Pembacaan kode dan pengukuran awal bukan percobaan koreksi.

## 10. Hasil yang diserahkan saat implementasi

Sistem gerak bersama, peningkatan presentasi seluruh alur prioritas, dukungan reduced motion dan jeda dekorasi, rekaman/screenshot pembanding, hasil pemeriksaan regresi, serta catatan performa dan batas pengujian. Selesai berarti perubahan terasa konsisten dan halus sekaligus mempertahankan perilaku aplikasi yang diverifikasi.
