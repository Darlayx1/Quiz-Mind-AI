# QuizMind AI — Smart Workspace Implementation

Tanggal: 12 Oktober 2026. Branch: `codex/smart-quiz-workspace`.

## Hasil implementasi

Homepage kini berfokus pada satu composer dengan textarea multiline yang menyesuaikan tinggi, tombol lampiran dan konteks yang hanya menampilkan ikon, serta CTA **Buat Kuis** di kanan bawah container. Preset opsional dan sesi yang dapat dilanjutkan menjadi bagian sekunder. Tidak ada statistik performa gabungan yang ditambahkan.

Alur menjadi **Beranda → Konfigurasi Kuis → Mulai → pipeline generasi yang sudah ada**. Membuka konfigurasi hanya memvalidasi sumber dan menyimpan draft. Generasi hanya berjalan melalui Mulai atau tindakan eksplisit melanjutkan job yang sudah ada. Ref guard pada form dan controller pada App mencegah dispatch ganda sebelum React selesai merender status loading.

Konfigurasi tetap menyediakan tujuh tipe soal, komposisi campuran, jumlah 1–100 soal, sembilan tingkat kesulitan, mode urutan bebas/sekuensial, timer/tanpa timer, waktu per tipe, bobot, kredit parsial, bahasa, gaya bahasa, dan instruksi tambahan. Penilaian dan personalisasi kini terlihat tanpa accordion. Pengaturan model, referensi web, evaluator, dan API key tetap memakai pengaturan workspace yang sudah ada; shortcut model/evaluator membuka tab Model & penggunaan.

## Komponen dan file baru

| File | Tanggung jawab |
| --- | --- |
| `src/components/QuizComposer.tsx` | Composer, native multi-file picker, drag/drop, antrean ingestion, chip status/removal, preview teks, dan toolbar aksesibel. |
| `src/components/MaterialContextEditor.tsx` | Editor dialog responsif dengan focus trap native, fokus textarea, Escape, dan pengembalian fokus. |
| `src/components/useComposerDraft.ts` | Satu state draft, autosave 300 ms, flush sebelum navigasi/generasi, error penyimpanan, dan perlindungan penutupan sebelum edit tersimpan. |
| `src/composerDraft.ts` | Pemulihan draft lama, normalisasi draft rusak, preset, validasi sumber, dan penggabungan teks dengan batas sumber eksplisit. |
| `src/materialIngestion.ts` | Validasi ukuran/format/isi, ekstraksi teks/OpenXML/PDF, fingerprint duplikat, dan pengendalian OCR. |
| `src/imageOcr.worker.ts` | Worker OCR terisolasi yang dapat dihentikan saat pembacaan dibatalkan atau melewati timeout, termasuk saat inisialisasi. |
| `src/resumableSession.ts` | Memeriksa referensi history, indeks, jawaban, dan metadata sesi sebelum menawarkan resume; tidak mengubah data. |
| `scripts/ingestion-assets.ts` | Menyajikan dan mengemas resource OCR dari origin aplikasi, termasuk deployment dengan base path. |
| `scripts/composer-workflow-test.ts` | Tes nyata komponen creator/hook dengan rendering host terisolasi dan tes persistensi/validasi. |
| `scripts/composer-fixtures.mjs` | Fixture upload lokal yang dapat dibuat ulang di direktori QA yang diabaikan Git. |

File yang diubah: `src/App.tsx`, `src/components/QuizCreator.tsx`, `src/components/QuestionComposition.tsx`, `src/components/TopBar.tsx`, `src/index.css`, `vite.config.ts`, `worker.ts`, `scripts/build-worker.mjs`, `scripts/smoke-test.mjs`, `scripts/app-operation-test.ts`, `scripts/workspace-account-test.ts`, `package.json`, `package-lock.json`, dan `.github/workflows/pages.yml`.

`QuizCreator` tetap menjadi pemilik state kedua tahap dan tetap mounted saat navigasi ke history/runner/results. Continue Learning menggunakan mekanisme progress/history/job yang sudah ada di App. Tidak dibuat pipeline generasi atau sistem storage kedua. CI sekarang menjalankan `npm run test:composer`, termasuk tes App yang sebelumnya dijalankan sendiri.

## State dan integritas data

- Draft tetap berada pada field workspace `draft` yang sudah tersedia. Tidak ada migrasi database atau perubahan versi IndexedDB/Supabase.
- Metadata lampiran dan **hasil ekstraksi teks** disimpan bersama draft. Objek File, blob asli, dan API key tidak ditambahkan ke penyimpanan baru. File asli tidak tersedia setelah reload; teks hasil ekstraksi tetap tersedia untuk generasi.
- `studyMaterial` draft lama tetap dipulihkan sebagai konteks, dan field lama yang tidak dikenal dipertahankan. Lampiran yang terputus atau rusak menampilkan error, bukan status ready palsu.
- Navigasi Kembali/Buat Kuis/Mulai menunggu flush edit terakhir. Status UI membedakan draft kotor, sedang disimpan, gagal, dan tersimpan.
- Komponen di-key menurut scope/mode workspace. Worker dihentikan pada unmount, dan completion navigasi/generasi lama diperiksa agar tidak mengisi workspace baru.
- Topik, konteks, dan masing-masing lampiran tetap dibedakan melalui label sumber di kontrak `studyMaterial` yang sudah ada. Instruksi utama lebih dari batas topic server 300 karakter juga disertakan lengkap sebagai sumber materi; gabungan yang terlalu panjang ditolak sebelum server memotongnya.
- Beranda dan logo memakai navigasi biasa. Tindakan Kuis baru/reset tetap terpisah. History, hasil, progress, bookmark, attempt ID, dan deadline tidak dihapus ketika menuju Beranda.
- Engine generasi/grading, repository workspace, model catalogue, dan aturan bisnis server tidak diubah. Build Edge menghasilkan kembali file engine yang sama tanpa diff.

## Kemampuan lampiran

| Format | Pemrosesan dan batas |
| --- | --- |
| TXT/MD/Markdown/TEXT/CSV/TSV/JSON/XML/HTML/LOG/YAML/YML | Teks UTF-8; biner dan JSON/XML rusak ditolak. HTML tidak dirender, script/style tidak dipakai sebagai materi. |
| PDF | Ekstraksi teks menggunakan [PDF.js](https://mozilla.github.io/pdf.js/api/). Maksimal 80 halaman; scan tanpa teks dan PDF terenkripsi diberi pesan konversi. |
| DOCX/PPTX/XLSX | Ekstraksi teks XML dalam ZIP memakai fflate. DOCX mengambil paragraf body, PPTX mengambil teks slide, XLSX mengambil nilai cell tersimpan/shared strings. |
| PNG/JPG/JPEG/WebP/GIF/BMP | OCR lokal Indonesia dan Inggris menggunakan [Tesseract.js](https://github.com/naptha/tesseract.js). Hanya teks yang digunakan; bukan interpretasi gambar/diagram. GIF memakai frame pertama. Hasil bisa dilihat lewat nama lampiran. |
| DOC/PPT/XLS, RTF, format biner lain | Tidak diinterpretasikan. Pesan meminta ekspor ke format modern, PDF berteks, atau TXT. |

Batas: 5 lampiran, 5 MB per file, 12.000 karakter hasil per file, 15.000 karakter gabungan materi, 16 megapiksel gambar, 60 detik pemrosesan per file, dan maksimal 2.000 entry/20 MB hasil dekompresi arsip. Pemrosesan dilakukan berurutan untuk membatasi penggunaan memori. Duplikat file valid dideteksi dengan SHA-256. Lampiran gagal harus diperbaiki/dihapus sebelum melanjutkan, sehingga tidak diam-diam diabaikan.

Gambar tertanam Office, catatan presenter, format/tata letak dokumen, makro, kalkulasi formula spreadsheet, dan penafsiran semantik diagram tidak didukung. OCR dapat keliru; pengguna dapat memeriksa hasilnya. Aset OCR/PDF dimuat saat dibutuhkan dan dikemas dari origin sendiri. Worker packaging diperbaiki untuk mempertahankan byte WASM/traineddata dan MIME module JavaScript. CSP mendukung worker serta WebAssembly tanpa mengaktifkan evaluasi JavaScript umum.

## Pengujian yang dijalankan

| Pemeriksaan | Hasil aktual |
| --- | --- |
| Baseline sebelum perubahan: TypeScript, `workspace-test.ts`, `app-operation-test.ts` | Lulus. Working tree awal bersih pada main. |
| `npm run lint` | Lulus setelah implementasi final. |
| `npm run test:composer` | Lulus: tanpa generasi di homepage, flush edit terakhir, satu Start untuk klik serentak, Back mempertahankan sumber/config, legacy draft, preset, error save, completion workspace lama, dan resume. |
| `workspace-account-test.ts` | Lulus: auth/refresh deduplication, akun A/B/C terisolasi termasuk konteks dan teks lampiran, payload RPC save, salah scope ditolak, expiry/re-login, timeout, serta guest isolation. |
| `quiz-types-test.ts` | Lulus: tujuh tipe soal, scoring, bobot, legacy migration, evaluator/cache/review/failure/fallback. |
| `model-test.ts` | Lulus: enam model, sembilan level, konfigurasi lama, timer, dan jumlah soal. |
| `workspace-ai-test.ts` | Lulus: mixed generation, model tetap, invalid key, essay weighting, scoped evaluator, batas panggilan. |
| `npm run test:generation` | Lulus seluruh stream, efficiency, dan quality gate checks. |
| `npm run test:quality` | Lulus 16 tes, termasuk interrupted generation recovery dan pilihan UI. |
| `npm run test:parallel` | Lulus: search, disposable PostgreSQL, account Edge fixtures, local storage, generation, cancellation, serta build Edge. |
| `gemma-resilience-test.ts` | Lulus: parsing, timeout/cleanup, no silent fallback, error permanen/kuota tanpa retry loop. |
| `npm run build` | Lulus: Vite client, Node server, Worker package. |
| `npm run build:pages` | Lulus untuk root dan `/Quiz-Mind-AI/` base path sesuai konfigurasi CI. |
| `scripts/smoke-test.mjs` | Lulus, termasuk kesamaan byte WASM/traineddata, MIME worker, dan asset 404. |
| `git diff --check` | Lulus; hanya pemberitahuan normalisasi LF/CRLF dari Git. |
| Anti-loop rules | File sudah ada; frontmatter dua-field YAML tervalidasi, `trigger: always_on`, dan referensi AGENTS tetap ada. Tidak ditimpa. |

## QA browser dan visual

Homepage dan konfigurasi diuji pada viewport 320, 375, 768, 1024, dan 1440 px. Semua tidak memiliki horizontal overflow. CTA composer tetap di dalam container pada kanan bawah, ikon tidak bertumpuk, dan target kedua ikon berukuran 44 × 44 px. Konfigurasi diuji dalam mode campuran/sekuensial dengan bobot dan waktu per tipe terlihat.

Native multiple picker serta ekstraksi TXT, DOCX, PPTX, XLSX, dan PDF berhasil diuji. OCR PNG menghasilkan tiga kalimat sesuai fixture. PDF dan OCR juga berhasil pada build produksi dengan CSP, tanpa error browser. Konteks diuji melalui Enter/Escape, fokus awal textarea, serta pengembalian fokus. DOC lama menampilkan error dengan arahan konversi dan menonaktifkan CTA hingga dihapus. Back dan reload memulihkan topik, konteks, lima lampiran, preset, dan bahasa pada origin QA yang terpisah.

QA awal menemukan tab localhost lain yang berbagi guest storage. Pengujian selanjutnya memakai `127.0.0.1` untuk tidak berbagi draft dengan tab pengguna. Tab pengguna tidak ditutup. Bukti: [hasil pengukuran browser](evidence/smart-workspace/browser-qa.json), [homepage produksi](evidence/smart-workspace/home-production-1440.jpg), [homepage 320 px](evidence/smart-workspace/home-320.jpg), [konfigurasi desktop](evidence/smart-workspace/configuration-1440.jpg), [konfigurasi 375 px](evidence/smart-workspace/configuration-375.jpg), dan [editor konteks 320 px](evidence/smart-workspace/context-320.jpg).

## Batas verifikasi dan isu yang tetap ada

1. `scripts/grounding-fallback-test.ts` gagal dengan `WEB_SEARCH_QUOTA`. Kegagalan yang sama direproduksi dari salinan commit awal di direktori QA: tes mengharapkan model fallback setelah 429, sedangkan engine saat ini menghentikan generasi dengan web quota error. File tes dan engine terkait tidak diubah oleh redesign. Skrip ini tidak termasuk pemeriksaan CI Pages saat ini; kebijakan AI tidak diubah untuk memaksanya lulus.
2. Vite memberikan peringatan chunk utama lebih dari 500 kB (sekitar 650 kB, 189 kB gzip). Build tetap berhasil. Resource OCR bahasa/core sekitar 7,2 MB dan hanya diambil saat OCR digunakan. Tidak dilakukan optimasi bisnis atau rewrite tambahan untuk mengejar metrik bundle.
3. Generasi AI, grading, dan account persistence diuji dengan provider/RPC fixture serta database disposable. Tidak dilakukan panggilan AI berbayar atau pengujian sign-in/penyimpanan dengan akun produksi. Pengujian browser dilakukan di Chromium in-app; Safari/Firefox dan pembaca layar nyata belum diuji. Timeout 60 detik tidak dipaksakan melalui browser; validasi batas file dan arsip diuji otomatis.
4. Tidak ada tema gelap di aplikasi baseline; tampilan terang yang sudah ada dipertahankan. Dukungan reduced-motion ditambahkan pada workspace baru.

Tidak dilakukan deployment, push, migrasi database produksi, penghapusan history pengguna, atau penambahan penyimpanan credential. Perubahan tersedia di working tree feature branch untuk ditinjau.
