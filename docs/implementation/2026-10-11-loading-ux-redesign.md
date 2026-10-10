# Dokumentasi Implementasi: Pembaruan UI/UX Halaman Loading Quiz Mind AI

**Tanggal:** 11 Oktober 2026  
**Status:** Selesai dan Terverifikasi  
**Lingkup:** Halaman Loading Generate Soal dan Halaman Loading Evaluasi AI

---

## 1. Ringkasan Eksekutif

Pembaruan ini menghadirkan pengalaman menunggu yang elegan, tenang, minimalis, profesional, dan jujur (tanpa tahapan fiktif atau persentase rekayasa) pada dua titik krusial alur belajar Quiz Mind AI:
1. **Pembuatan Kuis (Generate Soal):** Mengolah topik/materi menjadi struktur kuis yang siap dikerjakan.
2. **Penelaahan Jawaban (Evaluasi AI):** Menguji dan menelaah jawaban terbuka (esai dan isian singkat) berdasarkan rubrik sebelum menampilkan umpan balik dan skor akhir.

Pembaruan dilakukan secara terisolasi pada sisi presentasi dan orkestrasi UI tanpa memodifikasi logika prompt, algoritma scoring deterministik, skema database, maupun sistem autentikasi.

---

## 2. Arsitektur & Komponen

### 2.1 Komponen Tata Letak Bersama (`ProcessingLayout.tsx`)
Menyatukan kedua halaman dalam hierarki visual dan semantik yang konsisten:
- **Eyebrow:** Label konteks uppercase singkat (`MENYUSUN SOAL` / `MENELAAH JAWABAN`).
- **Ilustrasi Utama:** Komponen vektor SVG simbolis dengan animasi gerak mikro yang tenang.
- **Judul & Deskripsi:** Hirarki tipografi kuat dengan kontras teruji (`#0f172a` pada judul, `#475569` pada teks penjelas).
- **Ringkasan Konteks:** Badge informasi (topik, jumlah soal/jawaban, jenis soal spesifik, tingkat kesulitan, status grounding web, dan model AI aktif).
- **Zona Progres Aktual:**
  - *Indeterminate:* Spinner halus saat menunggu respons awal layanan AI tanpa persentase palsu.
  - *Determinate:* Bar kemajuan nyata dengan label numerik akurat saat data parsial diterima.
- **Pesan Tunggu Lama:** Notifikasi informatif tenang saat waktu proses melampaui ambang batas 20 detik.
- **Aksi Pembatalan:** Tombol pembatalan terintegrasi dengan target sentuh $\ge 44 \times 44\text{ px}$ dan pencegahan klik ganda saat proses pembatalan aktif.
- **Aksesibilitas:** Menghormati atribut `role="status"`, `aria-busy="true"`, `aria-live="polite"`, dan `aria-hidden="true"` pada elemen dekoratif.

### 2.2 Ilustrasi Simbolis (`ProcessingIllustrations.tsx`)
Mengusung tema **"Ruang belajar yang tertata"**:
- **Generate Soal (`GenerateIllustration`):**
  - *Konsep:* "Materi menjadi soal".
  - *Visual:* Lembaran materi belajar di latar belakang berdampingan dengan kartu soal kuis rapi di latar depan, dihiasi aksen biru stabil.
- **Evaluasi AI (`EvaluationIllustration`):**
  - *Konsep:* "Jawaban ditelaah melalui rubrik".
  - *Visual:* Lembar jawaban pengguna berdampingan dengan panel dock kriteria rubrik penilaian, dengan sorotan pemindai (*scan beam*) lembut yang bergerak perlahan.
- *Reduced Motion:* Seluruh animasi dinonaktifkan otomatis saat `@media (prefers-reduced-motion: reduce)` aktif.

---

## 3. Detail Implementasi Alur

### 3.1 Pembaruan Halaman Generate Soal (`GenerationLoader.tsx`)
- Mendeteksi jenis kuis secara dinamis (`Pilihan ganda`, `Esai`, `Isian singkat`, atau `Campuran`) sehingga tidak pernah keliru menampilkan label "pilihan jawaban" pada kuis esai murni.
- Kontrol pembatalan dan status jumlah soal diterima (`generation.completed / generation.config.questionCount`) disatukan ke dalam kartu loading utama, meniadakan elemen kontrol terpisah di luar kartu.

### 3.2 Halaman Khusus Loading Evaluasi AI (`EvaluationLoader.tsx`)
- Menggantikan tampilan evaluasi inline pada halaman hasil menjadi halaman loading khusus yang tenang.
- **Penetapan Target yang Akurat:**
  - Evaluasi kuis baru: Menghitung jumlah soal terbuka yang membutuhkan evaluasi AI (misal: 2 dari 5 soal).
  - Melanjutkan evaluasi: Menghitung sisa soal yang belum dievaluasi.
  - Penilaian ulang 1 soal: Menargetkan soal spesifik (misal: "Soal 3 · Penilaian Ulang") tanpa menganggap skor lama sebagai bukti operasi baru selesai.
- **Perlindungan Pesan Penyimpanan:** Status "Jawaban Anda telah tersimpan" hanya dikonfirmasi setelah proses penyimpanan awal benar-benar tuntas.
- **Pembatalan Aman:** Memanggil sinyal pembatalan `AbortController`, mempertahankan checkpoint nilai yang sudah tersimpan, lalu mengarahkan pengguna kembali ke `QuizResults` dengan notifikasi status yang jelas.

### 3.3 Penyesuaian Orkestrasi (`App.tsx` & `evaluation.ts`)
- `evaluateWorkspace`: Meneruskan metadata progres `{ completed: cursor, total: ids.length, group }` pada callback `checkpoint`.
- `App.tsx`: Mengatur transisi tampilan:
  - `loading`: Menampilkan `GenerationLoader`.
  - `isEvaluating && result && activeEvaluation`: Menampilkan `EvaluationLoader`.
  - Terminal/selesai/dibatalkan: Kembali ke `view === 'results'` dan menampilkan `QuizResults`.

---

## 4. Hasil Verifikasi & Pengujian

### 4.1 Matriks Uji Logika (`scripts/verify-loading-ux.ts`)
- **Matriks 1 (Pemetaan Label):** Pemetaan nama jenis soal dan tingkat kesulitan akurat (100% lulus).
- **Matriks 2 (Perhitungan Progres Generate):** Indeterminate saat 0 soal diterima, determinate akurat saat $\ge 1$ soal diterima (100% lulus).
- **Matriks 3 (Perhitungan Target Evaluasi):** Hanya menargetkan soal yang membutuhkan evaluasi AI; identifikasi penilaian ulang nomor soal tepat (100% lulus).
- **Matriks 4 (Integritas Skor Lama):** Penilaian ulang tidak keliru mengklaim 100% selesai berdasarkan skor dari sesi sebelumnya (100% lulus).

### 4.2 Verifikasi Tampilan Visual & Responsivitas
Diuji dan diverifikasi menggunakan headless Chromium pada berbagai resolusi perangkat:
- **Desktop (1440 × 900 px):** Komposisi seimbang, padding luas (36–40 px), lebar maksimum kartu 640 px di tengah layar.
- **Tablet (768 × 1024 px):** Tata letak fleksibel, pembungkus badge konteks rapi, proporsi ilustrasi ideal.
- **Mobile (390 × 844 px):** Ukuran ilustrasi menyesuaikan (128 px), padding adaptif (22 × 14 px), tipografi judul 1.25rem, zero overflow horizontal.
- **Small Mobile (360 × 780 px):** Seluruh elemen muat secara proporsional tanpa clipping teks atau tombol.

Artefak tangkapan layar tersimpan pada direktori:
- `.qa/screenshots/gen-waiting-1440.png`
- `.qa/screenshots/gen-waiting-768.png`
- `.qa/screenshots/gen-progress-390.png`
- `.qa/screenshots/eval-progress-1440.png`
- `.qa/screenshots/eval-reeval-360.png`

### 4.3 Typecheck & Build
- `npm run lint` (`tsc --noEmit`): **0 errors**.
- `npm run build`: **Sukses**, waktu kompilasi 330 ms.

---

## 5. Batasan & Catatan Pemeliharaan

- **Penyedia AI Tanpa Streaming Token:** Karena API layanan AI saat ini mengembalikan soal per kelompok atau per kuis utuh, UI mengandalkan progres jumlah soal/jawaban yang telah diterima (*discrete checkpoint*), bukan interpolasi persentase per milidetik buatan.
- **Penyimpanan Lokal vs Akun:** Penghentian/pembatalan operasi pada mode Akun memicu `qm_cancel_job` di server, sedangkan mode Tamu/Lokal segera membatalkan fetch client dan mempertahankan IndexedDB lokal.
