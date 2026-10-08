---
trigger: always_on
description: "Prevent repetitive debugging, infinite loops, unnecessary tool calls, and inefficient token usage."
---

# Anti-Loop, Anti-Repetition, and Efficient Debugging Rules

Sistem aturan ini mengatur perilaku eksekusi agen untuk mencegah pengulangan solusi yang gagal, debugging tanpa arah, pemborosan token, dan loop proses yang tidak terkendali.

---

## 1. Iteration Control
- **Batas Percobaan**: Maksimal 3 percobaan untuk setiap masalah atau bug yang dihadapi.
- **Deteksi Kegagalan Berulang**: Jika 2 percobaan berturut-turut menghasilkan kegagalan yang sama, hentikan perubahan kode seketika dan lakukan *root cause analysis* (RCA).
- **Larangan Solusi Identik**: Dilarang mengulang solusi yang identik atau variasi sintaksis minor tanpa adanya hipotesis baru atau bukti diagnostik baru.
- **Batas Berhenti (Cut-off)**: Setelah 3 percobaan gagal, hentikan proses otomatis dan laporkan kendala serta batasan yang dihadapi secara komprehensif kepada pengguna.

---

## 2. Intelligent Debugging
- **Analisis Sebelum Eksekusi**: Identifikasi penyebab utama (*root cause*) sebelum melakukan modifikasi kode.
- **Pemeriksaan Menyeluruh**: Periksa log kesalahan, file konfigurasi, dependensi, dan file terkait sebelum merumuskan hipotesis perbaikan.
- **Perubahan Minimal & Terisolasi**: Prioritaskan perubahan kecil (*atomic changes*) yang dapat diuji secara terpisah.
- **Fokus Masalah**: Hindari perubahan atau "pembersihan" kode yang tidak berkaitan langsung dengan masalah utama.
- **Integritas Kode Berfungsi**: Jangan mengganti atau mengutak-atik kode yang sudah bekerja tanpa alasan terverifikasi dan relevan.

---

## 3. Terminal & Execution Safety
- **Perintah Non-Repetitif**: Jangan menjalankan perintah terminal yang sama berulang-ulang tanpa parameter baru atau alasan berbasis fakta baru.
- **Penerapan Timeout**: Terapkan batas waktu (*timeout*) pada proses yang berpotensi menggantung atau berjalan tanpa henti.
- **Hindari Terminal Interaktif Tanpa Batas**: Jangan memulai perintah interaktif yang mengharuskan input manual tanpa pengawasan atau pembatasan.
- **Deteksi Hang/Deadlock**: Identifikasi dan hentikan secara aman proses background atau terminal yang mengalami *deadlock*, *freeze*, atau *hang*.
- **Manajemen Server**: Jangan menjalankan ulang dev server atau background service apabila instance sebelumnya masih aktif dan berfungsi normal.

---

## 4. Token & Context Efficiency
- **Pencegahan Redundansi Pembacaan**: Hindari membaca file yang sama berulang kali jika tidak ada perubahan relevan pada isi file tersebut.
- **Pencarian Tertarget**: Gunakan pencarian spesifik (grep, targeted search, specific line ranges) sebelum memutuskan membaca seluruh file atau codebase.
- **Dokumentasi State**: Catat temuan penting, error trace spesifik, dan hasil pengujian sebelumnya agar tidak perlu diteliti ulang.
- **Komunikasi Efisien**: Hindari penjelasan internal yang berulang, klise, atau tidak menambahkan wawasan atau fakta baru.
- **Checkpointing**: Gunakan checkpoint logis untuk mempertahankan konteks pekerjaan tanpa membebani context window.

---

## 5. Change Management
- **Verifikasi Git**: Periksa `git status` dan `git diff` sebelum dan setelah melakukan perubahan berisiko.
- **Hormati Kode Pengguna**: Jangan pernah melakukan rollback atau membuang perubahan manual pengguna tanpa persetujuan eksplisit.
- **Catat Rasionalisasi Perubahan**: Catat apa yang diubah, hasil yang diharapkan, serta alasan di balik strategi perbaikan yang dipilih.
- **Hindari Refactoring Prematur**: Jangan membuat refactoring skala besar hanya untuk memperbaiki bug kecil.
- **Batasan Lingkup (Scope Boundary)**: Jangan mengubah file di luar lingkup tugas (*out-of-scope*) tanpa kebutuhan yang jelas dan terbukti.

---

## 6. Completion & Verification
- **Kriteria Keberhasilan Terukur**: Setiap tugas harus memiliki kriteria keberhasilan yang jelas, terdefinisi, dan dapat diuji.
- **Verifikasi Berbasis Pengujian**: Verifikasi keberhasilan solusi menggunakan pengujian relevan (test suite, build, lint, atau command verifikasi).
- **Larangan Klaim Tanpa Bukti**: Jangan pernah mengklaim masalah terselesaikan tanpa bukti konkret hasil eksekusi/verifikasi.
- **Transparansi Batasan**: Jika solusi gagal berulang, segera berhenti dan jelaskan batasannya secara transparan kepada pengguna.
- **Hindari Over-Optimization**: Jangan terus-menerus melakukan optimasi spekulatif tanpa adanya metrik atau manfaat nyata yang terukur.

---

## 7. Circuit Breaker Protocol

Jika menghadapi kegagalan atau bug dalam alur pemecahan masalah, patuhi urutan protokol berikut secara ketat:

1. **Attempt 1 (Analisis & Minimal Fix)**:
   - Analisis error secara mendalam.
   - Buat hipotesis pertama.
   - Lakukan perubahan minimal dan uji hasilnya.

2. **Attempt 2 (Hipotesis & Pendekatan Alternatif)**:
   - Jika Attempt 1 gagal, evaluasi mengapa gagal.
   - Gunakan hipotesis atau pendekatan yang berbeda dari Attempt 1.
   - Lakukan pengujian kembali.

3. **Attempt 3 (Percobaan Alternatif Terakhir Berbasis Bukti)**:
   - Jika Attempt 2 masih gagal, lakukan satu percobaan alternatif terakhir yang didukung bukti kuat/log baru.
   - Hindari spekulasi tanpa dasar.

4. **STOP (Circuit Breaker Triggered)**:
   - Jika Attempt 3 tetap gagal, **HENTIKAN** semua percobaan otomatis seketika.
   - Sajikan laporan terstruktur kepada pengguna berisi:
     - Root cause analysis dan ringkasan 3 percobaan sebelumnya.
     - Fakta dan log terakhir yang diperoleh.
     - Opsi/rekomendasi langkah selanjutnya untuk dipilih oleh pengguna.

> **Wajib Root Cause Analysis (RCA)**: Jika dua kegagalan berturut-turut menunjukkan gejala atau pesan error yang identik, wajib lakukan root cause analysis sebelum melangkah ke percobaan berikutnya.
